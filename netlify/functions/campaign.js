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

/* Token budgets are deliberately small. A function is killed at 60 seconds,
   and a pass that generates its full allowance at typical speed lands right
   on that wall — the stream dies with nothing delivered and the whole run
   stops. Since a section that runs out of room now asks for the rest of
   itself, a small budget costs an extra round trip; a large one costs the
   entire plan. 1,500 tokens is roughly 30 seconds at typical speed and still
   under the wall at half that speed, which is the case worth designing for. */
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
    label: "the market read",
    tokens: 1500,
    ask: `Write ONLY this section. This one is your own knowledge of the market rather than reLink's data. Be concrete and be specific to this equipment — a generic B2B answer is worse than nothing here.

## The market read

**How this actually gets bought.** Who raises it, who specifies it, who signs. What the approval path looks like inside a health system and roughly how long it takes. Where the money comes from — capital budget, operating budget, or a disposal that funds itself — because that changes the entire pitch.

**What triggers it.** The events that create demand for this specific thing: a service line closing, fleet standardisation, an OR refit, a merger, an OEM end-of-life notice, a fiscal year ending with budget to burn. Name the ones that matter here and say roughly when in the year they cluster.

**Where these buyers already are.** The searches they run, where they look before they search, the marketplaces and auction sites in this category, the forums and associations. Name the real competitors who show up when they look, say what each is good at, and say where the gap is that reLink can stand in.

**What usually works, and what reliably does not.** For this category specifically. Be blunt about the second part.

**Likely economics.** Rough expectations for search volume, competition and cost in this category, clearly marked as market judgement rather than reLink figures, plus what you would verify in Keyword Planner before anyone commits budget.

Stop after this section.`,
  },
  2: {
    label: "the idea",
    tokens: 1500,
    ask: `Write ONLY these two sections, building directly on the market read above. The trigger and competitor gap you identified there should be visible in the idea — if the idea would work equally well for any company selling any equipment, it is not the idea.

## The idea
The campaign in one sentence, then the thinking behind it. What is the angle? Why does it land now, given the timing you described? What is the single message everything hangs off? Give it a working name.

## Who you're actually talking to
The buying situation, not a persona sheet. What is happening in their week that makes this relevant. Who searches, who specifies, who signs, and what each of them needs to hear. The two or three objections that kill these deals and how the campaign pre-empts each. Where lead data in the brief tells you something about where these people come from, use it; where it does not, use what you know about the category.

Stop after those two sections.`,
  },
  3: {
    label: "the offer and channel plan",
    tokens: 1500,
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
  4: {
    label: "the copy",
    tokens: 1500,
    ask: `Write ONLY this section, using the campaign idea and the three-touch LinkedIn sequence already established above.

## Copy
Google RSA: 8 headlines at 30 characters or fewer, 4 descriptions at 90 or fewer, character count in brackets after each.

LinkedIn: write the three posts in full, one per touch in the sequence. Each is a complete caption ready to paste — opening line that earns the scroll-stop, body with line breaks where they fall, a clear ask, and 3 to 5 hashtags. Label them Touch 1, Touch 2, Touch 3 and say what each is doing. No placeholders, nothing left to fill in.

Email: 5 subject lines with preheaders, each subject under 50 characters.

Organic social: 2 complete captions for the LinkedIn company page.

Stop after this section.`,
  },
  5: {
    label: "the keywords",
    tokens: 1500,
    ask: `Write ONLY this section.

## Keywords

**Already converting** — a table of keywords that appear in the evidence with conversions: Keyword | Spend | Conv | CPL | Action. If the evidence contains none that relate to this focus, write one short line saying so and move straight on. Do not pad it.

**Worth adding** — this is the part that matters and you must always write it, at length, whether or not there was any evidence above. Propose 12 to 15 keywords from your own understanding of how this equipment gets bought and how these buyers search. Group them under intent headings:

- *Ready to transact* — someone looking to buy or sell this specific thing now
- *Comparing options* — evaluating, pricing, checking condition or specification
- *Problem-led* — searching the situation rather than the product, before they know reLink exists

Table per group: Keyword | Match type | Why this buyer types it | Ad group.

Cover the ground deliberately: manufacturer and model terms people actually use, the words a biomed says versus the words a purchasing manager says, refurbished and used variants, the removal or disposal framing as well as the buying framing, and long-tail phrasing that signals a real situation rather than research.

Then **Add as negatives** — from the evidence where terms are spending with no conversions, and from your own reading of which of your proposals will attract the wrong intent.

Close with one short paragraph: these proposals are hypotheses, they need volume and competition checking in Google Keyword Planner before budget goes near them, and name the three you would test first and why.

Stop after this section.`,
  },
  6: {
    label: "the landing page",
    tokens: 1500,
    ask: `Write ONLY these two sections.

## Landing page
Target URL slug under relinkmedical.com, H1, section-by-section outline with the point each section makes, primary CTA, proof points, 3 FAQs, and which existing reLink pages should link to it.

## How you'll know it worked
Three or four numbers to watch, what good looks like for each given what the brief shows about current performance, and the point at which you would stop and rethink. Include a two-week checkpoint.

Stop after those two sections.`,
  },
  7: {
    label: "the emails",
    tokens: 1500,
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

An SBU leader has told you what they want to promote. You are writing the campaign they will run. Most of what makes it good comes from your own knowledge: how this category of equipment actually gets bought, who is in the room, what triggers a purchase, who else competes for the same attention, when in the year the money appears, what works in this market and what reliably fails. Bring all of it. The performance data you are given is a useful check on what reLink has already tried. It is not the campaign, and it is usually incomplete.

HOW TO HANDLE NUMBERS

Figures you present as reLink's own performance — their spend, conversions, cost per lead, lead counts, open rates — must come from the brief. Never invent one, never round one into a different number.

Everything else is open. Market norms, typical benchmarks for this category, competitor behaviour, how a buying cycle usually runs, roughly what a keyword costs — bring these freely and mark them as market judgement rather than reLink data, so a reader can tell the two apart at a glance. A campaign built only from what reLink has already done can never propose anything reLink has not already done.

HOW TO HANDLE THIN DATA

Never open a section by describing what the evidence lacks. "There is no history for this" is a preamble, not an insight. If there is no precedent, make the call anyway, say plainly that it is a hypothesis, and give the two-week test that would prove or kill it. An SBU leader wants a recommendation they can act on, not a description of the gaps in their own reporting.

The plan is written in passes. You get the brief, everything written so far, and the sections to write now. Write only what is asked for, continue the campaign already established rather than restarting it, never repeat a section that exists.

No clinical or regulatory claims about equipment condition, safety or certification beyond what the brief states.

Write plainly. No "unlock", "leverage", "elevate", "game-changing", "in today's fast-paced". Short sentences. Say the thing.

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

  /* A continuation picks up an unfinished section rather than restarting it. */
  const resuming = Boolean(body.resume);
  const ask = resuming
    ? `The section above stops mid-flow because it ran out of room. Continue from exactly where it stops. Do not repeat anything already written, do not restart the section, do not re-introduce it, and do not add a heading. Pick up mid-sentence if that is where it broke off, and finish the section properly.`
    : stage.ask;

  /* Later passes see the earlier ones so the campaign stays one campaign.
     Trimmed from the front if it grows: the recent sections matter most
     for continuity, and the brief is sent in full every time regardless. */
  let prior = String(body.prior || "");
  if (prior.length > MAX_PRIOR) prior = "\u2026" + prior.slice(-MAX_PRIOR);

  const userMessage = prior
    ? `${brief}\n\n---\n\n# The plan so far\n\n${prior}\n\n---\n\n${ask}`
    : `${brief}\n\n---\n\n${ask}`;

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

  /* When a pass comes back with nothing, the browser can only say "empty",
     which is true and useless. Count what actually arrived from the API and,
     if no text ever came, say so in the response itself. A run that fails
     should explain itself rather than needing a log dive. */
  let frames = 0, deltas = 0, textChars = 0, sawStop = "", firstFrame = "";

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
            frames++;
            if (!firstFrame) firstFrame = raw.slice(0, 160);
            try {
              const ev = JSON.parse(raw);
              if (ev.type === "message_delta" && ev.delta?.stop_reason) sawStop = ev.delta.stop_reason;
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
                if (alive) { alive = false; clearInterval(beat); }
                deltas++; textChars += ev.delta.text.length;
                controller.enqueue(encoder.encode(ev.delta.text));
              }
              /* Hit the ceiling mid-section. Flag it for the browser, which
                 asks for the rest rather than leaving a sentence hanging.
                 Guessing token budgets per section was never going to hold —
                 a long keyword table blows through any number I pick. */
              if (ev.type === "message_delta" && ev.delta?.stop_reason === "max_tokens")
                controller.enqueue(encoder.encode("\n<!--MORE-->"));
              if (ev.type === "error")
                controller.enqueue(encoder.encode(`\n\n> The API stopped early: ${ev.error?.message || "unknown error"}\n`));
            } catch (e) { /* partial frame, wait for the rest */ }
          }
        }
      } catch (e) {
        try { controller.enqueue(encoder.encode("\n\n> The connection dropped before the plan finished.\n")); } catch (e2) { /* closed */ }
      }
      if (textChars === 0) {
        const why = frames === 0
          ? "The API accepted the request but sent nothing back before the connection ended. That usually means the function was cut off at its time limit."
          : `The API sent ${frames} event${frames === 1 ? "" : "s"} but no text.${sawStop ? ` It stopped with reason: ${sawStop}.` : ""}${firstFrame ? ` First event: ${firstFrame}` : ""}`;
        try { controller.enqueue(encoder.encode(`\n> **This pass produced no text.** ${why}\n`)); } catch (e) { /* closed */ }
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
