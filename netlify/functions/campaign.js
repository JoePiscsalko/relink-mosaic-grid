import { getStore } from "@netlify/blobs";

/* ------------------------------------------------------------------
   Campaign builder — the model call.

   POST /api/campaign  -> streams markdown back as it is written

   Why streaming. A Netlify function has ten seconds to respond, and
   writing a keyword plan, ad copy, an email and a landing page brief
   takes considerably longer than that. The ten seconds applies to the
   first byte, not the last, so the response is piped through as it
   arrives. It also means the person watches the plan being written
   instead of watching a spinner and wondering if it broke.

   Two environment variables, both set in
   Netlify -> Site configuration -> Environment variables:

     ANTHROPIC_API_KEY   the API key. Server side only — it is never
                         sent to the browser and never in the repo.
     MOSAIC_WRITE_KEY    already set. Reused here as the gate.

   The gate matters more here than anywhere else in this app. Every
   other endpoint costs nothing to call. This one spends money on each
   request, and the site has no login, so without a check anyone who
   found the URL could run up the bill.
------------------------------------------------------------------- */

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 8000;
const STORE = "mosaic-grid";
const MAX_BRIEF = 12000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const SYSTEM = `You are a senior B2B demand generation strategist writing for reLink Medical, a veteran-owned medical equipment disposition company in Twinsburg, Ohio. reLink sells to hospitals, health systems, surgery centres and equipment vendors — this is B2B, never patient-facing.

You are writing a campaign plan an SBU leader will act on this week. Ground every recommendation in the performance evidence supplied in the brief.

Rules you do not break:

1. Never invent a number. If the brief supplies spend, conversions, cost per lead or lead counts, use those exact figures and say where they came from. If you need a figure the brief does not contain, say what you would need to look up rather than estimating one.

2. Distinguish what is already working from what is a proposal. A keyword with conversion history in the brief is evidence. A keyword you are suggesting is a hypothesis, and should be labelled as one.

3. No medical claims about equipment condition, safety or regulatory status beyond what the brief states. reLink refurbishes and resells; it does not make clinical claims.

4. Write plainly. No "unlock", "leverage", "game-changing", "in today's fast-paced". Short sentences. Say the thing.

Brand: Action Orange #F38637, Tech Teal #0598A6, Olive Green #90AD51, Espresso #2E2622, Cream #FAF7F1. Source Sans 3. Pill-shaped buttons. Headlines use weight contrast with one orange accent word.

Output GitHub-flavoured markdown with these five sections, in this order and with these exact headings:

## Where this stands today
Three to five sentences on what the evidence says about demand and current performance for this focus. Lead with the strongest number. If the evidence is thin, say so plainly — that is a useful finding, not a failure.

## Keywords
Two tables. First "Already converting" — only keywords present in the evidence with conversions, columns: Keyword | Spend | Conv | CPL | Action. Second "Worth adding" — your proposals, columns: Keyword | Match type | Why | Intent. If evidence contains keywords with spend and no conversions that relate to this focus, add a short "Add as negatives" list beneath. If there is no keyword evidence at all, say so and give proposals only.

## Campaign structure
Google Ads: which existing campaign this belongs in or why it needs a new one, ad group breakdown, match types, suggested daily budget with your reasoning. LinkedIn: objective, audience definition, and an explicit audience size check — reLink has previously spent $2,336 reaching 274 people at a $1,523 CPM, so state the minimum viable audience size and what to do if targeting comes in under it. Email: which list or journey, cadence, and where it sits against the other channels.

## Ad copy and subject lines
Google responsive search ads: 8 headlines at 30 characters or fewer, 4 descriptions at 90 characters or fewer. Give the character count in brackets after each. LinkedIn: 3 variants, intro text plus headline. Email: 5 subject lines with preheaders, each subject under 50 characters.

## Landing page brief
Target URL (propose a slug under relinkmedical.com), H1, section-by-section outline with the point each section makes, the primary CTA, proof points to include, and 3 FAQ entries. Note which existing reLink pages should link to it.

Then, last, a fenced html code block containing a complete SFMC-ready email: table-based layout, all styles inline, 600px wide, the brand palette above, a pill-shaped CTA button, an unsubscribe line, and %%[ ]%% free — plain merge fields like %%FirstName%% only. Include <custom name="opencounter" type="tracking"/> immediately before the closing body tag. The email must match the campaign focus and reuse one of the subject lines above.`;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return json({ error: "ANTHROPIC_API_KEY isn't set on this site yet. Add it in Netlify under Site configuration, Environment variables, then redeploy." }, 500);

  const secret = process.env.MOSAIC_WRITE_KEY;
  if (!secret) return json({ error: "No write passphrase is configured on this site yet." }, 500);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Could not read the request." }, 400);
  if (body.key !== secret) return json({ error: "That passphrase doesn't match." }, 401);

  const brief = String(body.brief || "");
  if (!brief.trim()) return json({ error: "Nothing to work from — the brief was empty." }, 400);
  if (brief.length > MAX_BRIEF) return json({ error: "That brief is too long." }, 413);

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: SYSTEM,
        messages: [{ role: "user", content: brief }],
      }),
    });
  } catch (e) {
    return json({ error: "Couldn't reach the API." }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    let msg = "The API refused the request.";
    if (upstream.status === 401) msg = "The API key was rejected. Check ANTHROPIC_API_KEY in Netlify.";
    if (upstream.status === 429) msg = "Rate limited by the API. Wait a moment and try again.";
    if (upstream.status === 400 && /credit|balance/i.test(detail)) msg = "The API account is out of credit.";
    return json({ error: msg, status: upstream.status }, 502);
  }

  /* Pull the text deltas out of the SSE stream and send plain text on,
     so the browser side stays simple. */
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const out = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const ev = JSON.parse(raw);
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta")
                controller.enqueue(encoder.encode(ev.delta.text));
              if (ev.type === "error")
                controller.enqueue(encoder.encode(`\n\n> The API stopped early: ${ev.error?.message || "unknown error"}\n`));
            } catch (e) { /* partial frame, wait for the rest */ }
          }
        }
      } catch (e) {
        controller.enqueue(encoder.encode("\n\n> The connection dropped before the plan finished.\n"));
      }
      controller.close();
    },
  });

  /* Log what was asked for. Useful for spotting a runaway bill early. */
  try {
    const store = getStore(STORE);
    const at = new Date().toISOString();
    const prev = (await store.get("campaign/runs", { type: "json" })) || { count: 0, recent: [] };
    await store.setJSON("campaign/runs", {
      count: (prev.count || 0) + 1,
      last: at,
      recent: [{ at, by: String(body.by || "").slice(0, 60), focus: String(body.focus || "").slice(0, 120) }]
        .concat(prev.recent || []).slice(0, 50),
    });
  } catch (e) { /* logging must never break the response */ }

  return new Response(out, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
};

export const config = { path: "/api/campaign" };
