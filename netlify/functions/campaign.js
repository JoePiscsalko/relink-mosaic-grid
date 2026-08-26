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
const STORE = "mosaic-grid";
const MAX_BRIEF = 12000;
const MAX_PRIOR = 30000;

/* ------------------------------------------------------------------
   Why this is staged.

   A Netlify function is killed at 60 seconds. That is total duration,
   not time to first byte — streaming buys you a responsive UI, not a
   longer budget. Asking for a whole campaign plus a full email
   sequence in one call meant several minutes of writing against a one
   minute ceiling, so it was cut off every time with nothing to show.

   So the plan is written in five passes, each small enough to land
   comfortably inside the window. Each pass gets the brief plus
   everything written so far, so the later sections answer to the
   earlier ones rather than drifting. The browser stitches them
   together and the reader sees one document.
------------------------------------------------------------------- */
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const STAGES = {
  1: {
    label: "the idea",
    tokens: 2600,
    ask: `Write ONLY these two sections.

## The idea
The campaign in one sentence, then the thinking behind it. What is the angle? Why does this land now? What is the single message everything else hangs off? Give it a working name. Be specific to reLink and to this equipment — not a template with the product swapped in.

## Who you're actually talking to
The buying situation, not a persona sheet. What is happening in their week that makes this relevant. Who signs off versus who searches. The two or three objections that kill these deals and how the campaign pre-empts each. If the brief's lead data says something about where these people come from, use it.

Stop after those two sections. Do not write any other heading.`,
  },
  2: {
    label: "the offer and channel plan",
    tokens: 2800,
    ask: `Write ONLY these two sections, continuing the campaign already begun above.

## The offer
What makes someone act now rather than bookmark it. Options with trade-offs — a valuation, a walkthrough, a guaranteed removal window, a first-look list. Say which you would pick and why. This section is why campaigns work or don't; treat it seriously.

## Channel plan
A sequenced plan, not a list. Which channel opens, what each one is for, how they hand off. Include a week-by-week table across the timeframe given.

Then per channel, with real depth:

**Search and SEO** — the intent you are capturing, the page that should rank, what to build or fix, and how this connects to the paid side.

**Google Ads** — which campaign or ad group, structure, match types, budget with reasoning, and what you would turn off to fund it.

**LinkedIn** — objective, audience definition, and an explicit audience size check: reLink previously spent $2,336 reaching 274 people at a $1,523 CPM, so state a minimum viable audience and what to do if targeting comes in under it. Then the creative concept and a three-touch sequence.

**Email** — where this sits in the existing journeys, the flow with a send-by-send purpose, timing, and how it segments.

**Organic social and sales enablement** — what the AE team gets, what goes out socially, how the two reinforce the paid spend.

Stop after those two sections.`,
  },
  3: {
    label: "the copy",
    tokens: 2800,
    ask: `Write ONLY this section, using the campaign idea and the three-touch LinkedIn sequence already established above.

## Copy
Google RSA: 8 headlines at 30 characters or fewer, 4 descriptions at 90 or fewer, character count in brackets after each.

LinkedIn: write the three posts in full, one per touch in the sequence. Each is a complete caption ready to paste — opening line that earns the scroll-stop, body with line breaks where they fall, a clear ask, and 3 to 5 hashtags. Label them Touch 1, Touch 2, Touch 3 and say what each is doing. No placeholders, nothing left to fill in.

Email: 5 subject lines with preheaders, each subject under 50 characters.

Organic social: 2 complete captions for the LinkedIn company page.

Stop after this section.`,
  },
  4: {
    label: "keywords and the landing page",
    tokens: 2800,
    ask: `Write ONLY these three sections.

## Keywords
Two tables. "Already converting" — only keywords present in the evidence with conversions: Keyword | Spend | Conv | CPL | Action. "Worth adding" — your proposals: Keyword | Match type | Why | Intent. Then a short negatives list if the evidence shows spend with no conversions. If there is no keyword evidence, say so plainly and give proposals only, noting they need volume checking in Keyword Planner before budget goes near them.

## Landing page
Target URL slug under relinkmedical.com, H1, section-by-section outline with the point each section makes, primary CTA, proof points, 3 FAQs, and which existing reLink pages should link to it.

## How you'll know it worked
Three or four numbers to watch, what good looks like for each given what the brief shows about current performance, and the point at which you would stop and rethink. Include a two-week checkpoint.

Stop after those three sections.`,
  },
  5: {
    label: "the emails",
    tokens: 3800,
    ask: `Write ONLY this section. Use the subject lines and the email flow already established above.

## The emails

Write exactly two emails from the sequence. For each, first a line in this exact form:

**Email 1 — <name of the send>** · Subject: <subject line> · Preheader: <preheader> · Sends: <when, relative to campaign start>

then one sentence on what this email is for and who gets it, then a fenced html code block containing the complete email.

Every email must be SFMC-ready: table-based layout, all styles inline, 600px wide, the brand palette, a pill-shaped CTA button, a plain-text preheader span hidden at the top, an unsubscribe line, plain merge fields like %%FirstName%% only, and <custom name="opencounter" type="tracking"/> immediately before the closing body tag. Real copy throughout — no lorem, no placeholders. The second must move on from the first rather than repeat it.

Keep each email's HTML tight. Stop after the second email.`,
  },
};

const SYSTEM = `You are a senior B2B campaign strategist writing for reLink Medical, a veteran-owned medical equipment disposition company in Twinsburg, Ohio. reLink helps hospitals and health systems remove, redeploy and resell surplus equipment, and sells refurbished equipment onward to buyers. This is B2B — never patient-facing.

You are writing the campaign an SBU leader will run. Think like a strategist first and an analyst second. The performance data in the brief keeps you honest about what has worked; it is not the campaign. A plan that only reshuffles existing keywords is a failure of imagination. Bring an idea.

The plan is written in passes. You will be given the brief, everything written so far, and the sections to write now. Write only what is asked for, continue the campaign already established rather than restarting it, and never repeat a section that already exists.

Rules you do not break:

1. Never invent a performance number. Spend, conversions, cost per lead, lead counts, open rates — if the brief supplies them use them exactly; if it does not, say what you would want to look up. This applies to figures only. Ideas, angles, audience insight, creative concepts and channel tactics are yours to generate freely and you should be bold with them.

2. Separate evidence from proposal. Anything with history in the brief is evidence. Everything you invent is a hypothesis — label it, and say how you would know within two weeks whether it is working.

3. No clinical or regulatory claims about equipment condition, safety or certification beyond what the brief states.

4. Write plainly. No "unlock", "leverage", "elevate", "game-changing", "in today's fast-paced". Short sentences. Say the thing.

Brand: Action Orange #F38637, Tech Teal #0598A6, Olive Green #90AD51, Espresso #2E2622, Cream #FAF7F1. Source Sans 3. Pill-shaped buttons. Headlines use weight contrast with a single orange accent word.

Output GitHub-flavoured markdown.`;

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

  const stage = STAGES[String(body.stage || 1)];
  if (!stage) return json({ error: "Unknown stage." }, 400);

  /* Later passes see the earlier ones so the campaign stays one campaign.
     Trimmed from the front if it grows: the recent sections matter most
     for continuity, and the brief is sent in full every time regardless. */
  let prior = String(body.prior || "");
  if (prior.length > MAX_PRIOR) prior = "\u2026" + prior.slice(-MAX_PRIOR);

  const userMessage = prior
    ? `${brief}\n\n---\n\n# The plan so far\n\n${prior}\n\n---\n\n${stage.ask}`
    : `${brief}\n\n---\n\n${stage.ask}`;

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
        max_tokens: stage.tokens,
        stream: true,
        system: SYSTEM,
        messages: [{ role: "user", content: userMessage }],
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
      /* Send something immediately, and keep sending while we wait.

         The proxy in front of a function will close the connection to the
         browser if no bytes arrive soon enough, and the model produces
         nothing for the first few seconds while it reads the brief. The
         function itself completes fine — the browser just never sees it.

         A zero-width space is invisible once rendered and the client strips
         it anyway. It exists only to keep the pipe warm. */
      const HEARTBEAT = "\u200b";
      controller.enqueue(encoder.encode(HEARTBEAT));
      let alive = true;
      const beat = setInterval(() => {
        if (alive) { try { controller.enqueue(encoder.encode(HEARTBEAT)); } catch (e) { /* closed */ } }
      }, 3000);

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
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
                if (alive) { alive = false; clearInterval(beat); }
                controller.enqueue(encoder.encode(ev.delta.text));
              }
              if (ev.type === "error")
                controller.enqueue(encoder.encode(`\n\n> The API stopped early: ${ev.error?.message || "unknown error"}\n`));
            } catch (e) { /* partial frame, wait for the rest */ }
          }
        }
      } catch (e) {
        try { controller.enqueue(encoder.encode("\n\n> The connection dropped before the plan finished.\n")); } catch (e2) { /* closed */ }
      }
      alive = false;
      clearInterval(beat);
      controller.close();
    },
  });

  /* Log what was asked for. Useful for spotting a runaway bill early. */
  try {
    if (Number(body.stage || 1) !== 1) throw new Error("skip");
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
