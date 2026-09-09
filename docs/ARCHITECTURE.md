# Architecture

A portfolio site whose only living element is a voice agent in the owner's own cloned voice, speaking
Egyptian Arabic and English, grounded in a private corpus, that cannot leak a phone number even if the
model wants to, and runs for under $30 a month.

Section numbers are stable: source comments cite them (`docs/ARCHITECTURE.md 4.3`), so sections are
added rather than renumbered.

## 1. Why it is built this way

Three constraints drove every decision.

**Egyptian Arabic is the hard part, and it is a speech-recognition problem before it is a synthesis
problem.** On the one independent benchmark of conversational Egyptian-Arabic/English code-switching
(arXiv 2605.19069, May 2026), ElevenLabs Scribe v2 reached 13.1% word error rate against roughly 41%
for OpenAI, 55% for Azure and 60% for Google. Models with an explicit `ar-EG` locale are monolingual:
they cannot handle "عملت deploy للـ backend", which is how the dialect is actually spoken about
technical work. That single fact chose the voice platform.

**No vendor exposes a dialect control.** Arabic is one `ar` code everywhere. Dialect fidelity comes
from two places instead: recording the clone speaking spontaneous Masri rather than reading Modern
Standard Arabic, and having the model write Egyptian orthography with numbers spelled out. Blanket
diacritisers are trained on MSA and push the text back toward fusha, so they are not used.

**Voice minutes cost money and the budget is a hard ceiling.** Caps are database rows, not process
memory, so a cold start or a second instance cannot double-spend.

## 2. Shape

One Next.js deploy. The site is server-rendered and works with JavaScript disabled; the agent is a
client island over it. A hosted platform owns the real-time audio path, because WebRTC, echo
cancellation, turn-taking and mobile reliability are not where this project's value is. Everything
that decides what the agent *says* is in this repository.

```
browser ──WebRTC──> voice platform (ASR, turn-taking, TTS with the cloned voice)
                          │
                          └── custom LLM (OpenAI-compatible SSE) ──> /api/llm ──> model provider
                                                                        │
browser ──HTTP────────────────────────────────────> /api/chat ──────────┘
                                                        │
                                                   Postgres (caps, transcripts, spend)
```

The same brain module serves both paths, with byte-identical prompt bytes, so the persona cannot drift
between voice and text.

## 3. Invariants

Ten properties hold regardless of what the model does. They live in `CLAUDE.md`, each has a test in
`tests/guardrails/`, and the suite must pass before deploy. In short: no phone number or unlisted
e-mail address; no salary figures; nothing about employers beyond the compiled corpus; caps enforced
in SQL; no paid token before a live microphone track exists; every side effect behind a human click on
a fixed-recipient form; a byte-stable prompt with dynamic context in a trailing message; audio never
stored; and an AI disclosure that is spoken, shown, and repeated if the greeting did not play.

## 4. Components

### 4.1 Voice agent

One private agent, token authentication with an empty hostname allowlist (the platform documents the
two as mutually exclusive). Streaming ASR with keyword biasing for the proper nouns that recur.
Text-to-speech on the fast model, because the professional voice clone's identity is not preserved on
the newer conversational model. Language detection runs as a system tool so the visitor can switch
mid-call. Audio saving off, retention 30 days, four-minute cap, barge-in on. The configuration is
versioned JSON pushed by `scripts/push-agent-config.ts` and never hand-edited in a dashboard; a
guardrail reads it back and asserts the privacy flags.

### 4.2 Corpus

A private repository of facts, project deep-dives, story cards, opinions, a recruiter FAQ, red-line
policy and few-shot exchanges. `scripts/compile-corpus.ts` validates it with zod, lints it, and renders
one byte-stable system prompt in a fixed 15-section order ending with a content-derived canary marker.
The prompt contains no date, no visitor data and no environment strings, so its bytes change only when
the content does. The build fails above 45,000 tokens.

The build lint is deliberately narrower than the runtime guard. At runtime the guard judges what the
agent *says*, so "I'm actively looking" must be blocked. At build time it judges a document that has to
*quote* the phrases it forbids: the policy file carries the refusal templates, the few-shots demonstrate
them, and the topics file names the deflected subjects precisely so the agent deflects them. It also
runs line by line with a narrower phone check, because the runtime loose-digit heuristic is meant for
one spoken sentence and trips on a dense CV bullet. One shared function (`createCorpusLint`) is used by
both the compiler and the guardrails; duplicating it is what let the two drift apart once already.

### 4.3 One voice turn

Inside the tap handler, in order: classify the browser (in-app browsers are recorded, never blocked),
request the microphone, and only on success unlock audio and mint a session token. A crawler that never
gets a microphone can never spend a second of the budget. The mint route runs a bot check, a
same-origin check, a signed visitor cookie and a SQL reservation before it talks to the platform.

The platform then posts to `/api/llm` for each turn. The adapter authenticates a shared header, swaps a
placeholder for the compiled corpus, appends session context as the *last* message so the cache prefix
stays stable, sanitises the visitor's text, and streams the reply back sentence by sentence through the
guard and the speech normaliser. Barge-in closes the request, which aborts the upstream call so tokens
stop being billed.

### 4.4 One text turn

The same brain with a text profile: longer replies, markdown allowed, digits left as digits. It never
mints a token, and it keeps working when voice is capped or the database is unreachable.

### 4.5 Tools

One zod catalogue generates both the chat tools and the agent configuration, so the names cannot drift.
Every tool only changes what the page shows. Nothing the model can call has a side effect: e-mails,
leads and downloads happen after a human submits a form whose recipient is fixed server-side, so a
prompt injection through speech has nothing to hijack. The one route that mails a visitor-supplied
address is the conversation summary, which the visitor asks for; it is gated on explicit consent, once
per session, a global daily cap, and only a hash of the address is retained.

### 4.6 Data

Postgres with row-level security on every table and no policies at all, so a leaked anonymous key reads
nothing. Sessions, transcript turns, model calls, guard events, spend events, daily budgets, leads,
messages, probes and evaluation runs. Retention is a generated column, purged on a schedule.
`reserve_voice_session` books a reservation and rejects in one transaction; `settle_voice_session` hands
back the unused seconds when the call ends. Migrations are append-only and their hashes are pinned.

### 4.7 Guard

Pure functions, no I/O, running on every assistant sentence before it reaches speech or the browser.
One normal form handles Arabic-Indic and extended Arabic-Indic digits, tatweel, diacritics and letter
variants, so an evasion written in another script is the same string. Rules cover phone numbers
(including spelled-out digits and accumulation across turns), e-mail addresses (including spoken "at"
and "dot"), salary (a money token near a salary term, in either language), job-seeking phrasings,
denylisted strings, the prompt canary, deflected topics, and tool-call JSON leaking into speech.

It errs toward dropping a sentence rather than leaking one. Public CV figures are allowlisted, so
ordinary answers survive.

### 4.8 Evaluation

Dialect scoring on every Arabic turn against a classifier plus a fusha-marker regex, a red-line probe
suite whose post-guard violation count must be zero, factuality against the corpus, tool precision, and
latency and cost. The dialect scorer is calibrated on hand-labelled turns before it gates anything,
because the public models were trained on travel and news text, not code-switched technical talk.

### 4.9 Model routing and residency

The primary is DeepSeek V4 Flash and the backup is Qwen, both served from Alibaba Cloud Model Studio's
international region. Running DeepSeek there rather than through its own API keeps visitor speech out
of the PRC, which was the site's largest legal exposure with EU visitors; measured from Cairo it costs
about half a second of time-to-first-token and no measurable cache quality (turn-two prefix hits stay
near 98%). Reasoning is disabled explicitly on every request to both providers — left on it takes Qwen
from 1.4 s to 27.6 s to first token and, under a 220-token budget, consumes the whole allowance so the
visitor gets nothing.

The two slots are configured by role rather than by vendor, because they currently share one account
and key and differ only in model. Adapter names stay model-specific, since they drive cost attribution.

### 4.10 Cost control

Every external call is logged before it is made, so a crash still shows what it cost. A daily job sums
spend and tightens the cap as it approaches the ceiling, then turns voice off entirely at the limit.
Text chat continues at a fraction of the cost, so the site never simply breaks.

## 5. Making the dialect convincing

Three levers, in order of impact. The clone's training audio, recorded speaking spontaneous Masri with
English technical terms embedded, because that is the code-switching prior the voice needs. The model's
text: the Arabic sections of the prompt are written *in* Masri, with an explicit forbidden-fusha list
and verbatim example exchanges, since research shows frontier models understand dialect but default to
MSA unless primed. Then normalisation: digits to Egyptian number words before speech, a curated
diacritics map for genuinely ambiguous words only, and Latin-only pronunciation aliases so one entry
works inside both Arabic and English sentences.

## 6. What is deliberately not here

No tracking pixels, no analytics on conversations beyond what the owner can read. No audio retention.
No retrieval in the request path: at this corpus size the whole thing fits in a cached prompt, and
retrieval would add latency plus a surface that visitor text could probe.

## 7. Verification

`pnpm test` runs the unit suite and the guardrails; `pnpm guard` runs the guardrails alone. The SQL cap
functions have integration tests that run against a real Postgres and skip cleanly without one. The
production build, typecheck and lint all gate CI, alongside secret scanning.

## 8. Known unknowns

Several platform behaviours are assumed and marked in the code where they matter: whether client tools
are forwarded to a custom model and how their results come back, whether mid-call language switching
keeps the cloned voice, whether the greeting is audible on every mobile browser, and the exact shape of
the token-mint response. Each is a short probe against the live platform rather than something more
reading can settle, and each has a documented fallback.

The dialect quality of a cloned voice is unverified for every vendor, because no independent benchmark
exists. The plan for it is a blind listening test with native speakers and a stated pass bar, before
any money is spent on the professional clone.
