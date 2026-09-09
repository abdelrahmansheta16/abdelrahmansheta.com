# Evals

Five suites run against the **deployed** `/api/llm` adapter, so what is measured is the prompt, the
guard and the tool policy that actually ship — not a re-implementation of them. Both LLM arms hit
the same endpoint; `config.llm` in `promptfooconfig.yaml` pins which model the adapter routes to.

```bash
EVAL_BASE_URL=https://abdelrahmansheta.com \
LLM_ADAPTER_SECRET=... \
npx promptfoo@0.122.2 eval -c scripts/eval/promptfooconfig.yaml
```

The suite files under `prompts/` ship with two or three seed cases each. They are **placeholders**:
the owner fills in the real probes. Until then a green run means nothing.

## Suites and pass bars

| Suite             | Size                                    | Bar                                                        |
| ----------------- | --------------------------------------- | ---------------------------------------------------------- |
| `dialect`         | 60 Masri prompts + one 8-turn dialogue  | ≥ 90% pass, zero drift to fusha across the dialogue        |
| `redline`         | 60 probes × 3 samples                   | raw-model rate reported; **post-guard rate must be 0**     |
| `factuality`      | 80 corpus Q/A + 15 hallucination probes | ≥ 95%                                                      |
| `tools`           | 30 should-call + 30 should-not          | precision ≥ 95%, JSON leakage 0                            |
| `language-switch` | 10 per direction                        | follows within one turn, Arabizi answered in Arabic script |

Primary-LLM rule (docs/PLAN.md 4.8): DeepSeek stays primary only if it scores ≥ Haiku − 0.3 on
blind authenticity, with zero CV hallucinations, zero post-guard breaches and tool precision ≥ 95%.
Otherwise Haiku is promoted.

## Schedule and cost

Budget is ≤ $2.50/month.

- **Per PR:** guard fixtures, a corpus compile against `knowledge.example`, and a 10-case smoke.
  This is the only part CI runs, and it downloads no models.
- **Nightly:** 20-case smoke.
- **On every corpus change or pinned-model change, and monthly:** the full suites.

Results go to the `eval_runs` table plus a Resend summary. Model ids and voice ids are pinned by
date; any change re-runs everything.

## The dialect scorer

`dialect_id.py` exposes `score(text) -> {egyptian, msa_prob, aldi, fusha_markers, scorable, reason}`
and the promptfoo entry point `assert_egyptian`. It combines:

1. `CAMeL-Lab/bert-base-arabic-camelbert-mix-did-madar-corpus6` — top-1 must be Cairene, MSA
   probability < 0.20.
2. `AMR-KELEG/Sentence-ALDi` — level of dialectness ≥ 0.60.
3. A hard fusha-marker regex — one `ليس` and the turn fails whatever the models say.

Latin tokens and digits are stripped first, so code-switched Masri ("عملت deploy للـ backend") is
scored on its Arabic alone. Turns with fewer than 20 Arabic characters are reported as
**unscorable** rather than as passes.

### Calibration — do this before the scorer gates anything

The published thresholds are the plan's starting point, not a measurement of this agent's output.

1. Collect **50 assistant turns** from real bake-off conversations, covering short answers, long
   answers, heavy code-switching and at least 10 deliberately fusha-leaning turns.
2. Hand-label each one Egyptian / not-Egyptian. Use two labellers if the native-speaker judges are
   available; resolve disagreements by discussion, not by averaging.
3. Run `python scripts/eval/dialect_id.py < turns.txt` and build the confusion matrix.
4. Record **both** error rates. A false negative wastes owner time; a **false positive lets fusha
   ship in the owner's cloned voice**, which is the failure that matters. Target: false-positive
   rate ≤ 5%.
5. If either rate is unacceptable, move `MSA_PROB_MAX` / `ALDI_MIN` and re-measure. Write the final
   numbers and the date into `docs/PROGRESS.md` so the next change can be compared against them.

No model is ever downloaded in CI. `requirements.txt` is installed by hand in a local venv.
