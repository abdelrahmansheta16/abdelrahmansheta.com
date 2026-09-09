# Intake — how the corpus gets written

The agent can only say what is in the corpus. Everything it knows arrives through this loop:

```
questionnaire  ->  voice memo  ->  transcript  ->  draft cards  ->  owner edit  ->  guard lint  ->  commit
```

The point of recording the answers rather than typing them is that the same audio does double duty:
it becomes Professional-Voice-Clone training material (see `docs/RECORDING.md`) **and** it produces
prose in the owner's actual register, which is what makes the Masri sound like a person.

Everything below happens in the **private** `portfolio-corpus` repo. Nothing from it — not a
sentence, not a metric, not a client name — is ever pasted into this public repo or a PR.

---

## 1. The questionnaire

`intake/questionnaire.md` in the private repo. It is grouped so one sitting produces one card type:

| Group             | Produces                  | Notes                                                             |
| ----------------- | ------------------------- | ----------------------------------------------------------------- |
| Profile and roles | `facts/profile.json`      | Titles, dates, stack, location. Dry, factual.                     |
| Proof points      | `facts/proof_points.json` | One claim + one metric each. First person. `verified: true` only. |
| Projects          | `projects/*.md`           | Frontmatter carries `public_level` and per-metric `public`.       |
| Stories           | `stories/*.yaml`          | STAR cards: situation, stakes, action, trade-off, result, lesson. |
| Opinions          | `opinions/*.md`           | Hot takes. These are what make the agent worth talking to.        |
| Logistics         | `facts/logistics.yaml`    | Markets, sponsorship, overlap, engagement type, notice period.    |
| FAQ               | `faq/recruiter.yaml`      | Each entry is `answer`, `deflect` or `refuse`.                    |

`intake/gaps/` holds the questions the agent has been asked that the corpus could not answer. Work
that folder down before adding new topics — a real visitor already told you what is missing.

**Two rules that are enforced by the schema, not by discipline:**

- `logistics.yaml` is a `.strict()` schema with no `salary` key. Adding one is a build failure.
- Every proof point needs a metric containing a digit and `verified: true`. An unverifiable claim
  does not go in.

---

## 2. Voice memos

Answer out loud, in one take, in whichever language the answer naturally comes out. Roughly five
minutes per topic.

- Speak, don't read. A read answer produces prose the agent cannot say convincingly.
- Code-switch normally: "عملت deploy للـ backend" is the target register, not a mistake.
- Say numbers you are willing to publish. Anything you hesitate over, say "skip" and move on — the
  hesitation is the signal.
- Record to the same setup as `docs/RECORDING.md` so the take is usable as clone audio.

Files land in `intake/recordings/`, indexed by `intake/recordings/index.yaml`
(topic, date, language mix, duration, whether the take is clone-quality).

---

## 3. Transcription

`tools/transcribe.py` in the private repo runs Scribe v2 **batch** (not the realtime endpoint) over
the memos and writes a transcript next to each recording.

- Transcripts are working material. They are never committed to the public repo.
- Proper nouns come back wrong more often than words do. Fix them by hand and add each correction
  to `glossary/pronunciation.yaml` — the same dictionary the TTS uses.
- Arabizi in, Arabic script out. If the transcriber produces Latin-script Arabic, rewrite it.

---

## 4. Card drafting

`tools/cardify.py` turns a transcript into draft cards of the right shape — a proof point, a story,
an FAQ entry — and leaves every field the owner must decide **blank**: `public_level`,
`metrics[].public`, `verified`, `privacy_notes`, `followup_risk`.

The draft is a starting point, never a commit. The owner edits every card. In particular:

- **`public_level: summary_only`** means the body is dropped at compile time. Use it whenever the
  detail is interesting but the employer would not want it published.
- **`privacy_notes`** on a story records what must _not_ be said if a follow-up question digs.
- **`followup_risk: high`** means the story invites a question you cannot answer safely. Either add
  the safe answer or cut the story.

---

## 5. Guard lint before commit

The same `lib/brain/guard.ts` that runs on every spoken sentence runs at build time over every
corpus field, and should be run over intake transcripts **before** anything is committed:

```bash
KNOWLEDGE_DIR=../portfolio-corpus pnpm compile:corpus
```

A hit is a build failure, not a warning. It catches phone numbers and personal addresses that crept
in from a memo, salary figures said out loud in passing, denylisted client names, and digits in
`spoken_ar` / `spoken_en` (voice answers say numbers in words).

The compiler also cross-checks every proper noun in `stories/` against `policy/allowlist.txt`, so a
company you mentioned once in a memo cannot reach the agent without a deliberate decision.

---

## 6. Where it ends up

`pnpm compile:corpus` validates, lints, renders the fifteen prompt sections in fixed order, counts
tokens (build fails above 45k — Arabic tokenises badly, so check `usage.prompt_tokens` too) and
emits `lib/corpus/corpus.generated.ts`.

That file is **gitignored** and CI asserts it stays untracked. The public repo never contains the
corpus, only the schema that validates it.
