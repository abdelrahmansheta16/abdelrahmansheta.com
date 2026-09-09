"""Egyptian-Arabic (Masri) dialect scorer for the `dialect` and `language-switch` eval suites.

Three independent signals, deliberately cheap to reason about:

  1. CAMeL-Lab/bert-base-arabic-camelbert-mix-did-madar-corpus6 — six-way dialect ID. We want
     top-1 == Cairo/Egypt and the MSA probability below 0.2.
  2. AMR-KELEG/Sentence-ALDi — a continuous "level of dialectness" in [0, 1]. We want >= 0.6.
  3. A fusha-marker regex — a hard zero. One `ليس` is a fail regardless of what the models say.

Models are downloaded on first use and cached under ~/.cache/huggingface. Nothing here runs in CI:
the workflow never imports this file, and the promptfoo python assertions only run locally or in
the manual eval job.

Calibrate before trusting it — see README.md. `score()` is the API; `assert_egyptian` is the
promptfoo entry point.
"""

from __future__ import annotations

import functools
import re
from typing import Any, TypedDict

# Latin tokens and digits are stripped before scoring: "عملت deploy للـ backend" is good Masri and
# must not be punished for the English in it.
_LATIN = re.compile(r"[A-Za-z0-9_@#/\\.\-]+")
_DIGITS = re.compile(r"[0-9٠-٩۰-۹]+")
_WS = re.compile(r"\s+")

# Hard fusha markers. Each one is either impossible or vanishingly rare in spoken Cairene.
FUSHA_MARKERS: tuple[str, ...] = (
    "ليس",
    "ليست",
    "سوف",
    "هل ",
    "لماذا",
    "كيف ",
    "ماذا",
    "الذي",
    "التي",
    "الذين",
    "إنّ",
    "لكنّ",
    "حيث",
    "لدى",
    "نحن",
    "أنتم",
    "لا يوجد",
    "يجب أن",
    "قد تم",
    "سيتم",
    "بالتالي",
    "أيضاً",
)

# Minimum Arabic characters after stripping Latin/digits. Shorter than this and neither model
# means anything; the case is reported as unscorable rather than as a pass.
MIN_ARABIC_CHARS = 20

EGYPTIAN_LABELS = {"CAI", "Cairo", "EGY", "Egypt", "egypt", "cairo"}
MSA_LABELS = {"MSA", "msa", "Modern Standard Arabic"}

DID_MODEL = "CAMeL-Lab/bert-base-arabic-camelbert-mix-did-madar-corpus6"
ALDI_MODEL = "AMR-KELEG/Sentence-ALDi"

# Pass bars from docs/PLAN.md 4.8. Re-derive these on the 50-turn calibration set before they gate
# anything; the numbers below are the plan's starting point, not a measured threshold.
MSA_PROB_MAX = 0.20
ALDI_MIN = 0.60


class Score(TypedDict):
    egyptian: bool
    msa_prob: float
    aldi: float
    fusha_markers: list[str]
    scorable: bool
    reason: str


def strip_latin(text: str) -> str:
    """Remove Latin tokens and digits so code-switched Masri is scored on its Arabic only."""
    cleaned = _LATIN.sub(" ", text)
    cleaned = _DIGITS.sub(" ", cleaned)
    return _WS.sub(" ", cleaned).strip()


def find_fusha_markers(text: str) -> list[str]:
    return [m for m in FUSHA_MARKERS if m in text]


@functools.lru_cache(maxsize=1)
def _did_pipeline() -> Any:
    from transformers import pipeline

    return pipeline("text-classification", model=DID_MODEL, top_k=None, device=-1)


@functools.lru_cache(maxsize=1)
def _aldi_model() -> Any:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(ALDI_MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(ALDI_MODEL)
    model.eval()
    return tokenizer, model, torch


def _dialect_probs(text: str) -> dict[str, float]:
    results = _did_pipeline()(text)
    rows = results[0] if isinstance(results[0], list) else results
    return {row["label"]: float(row["score"]) for row in rows}


def _aldi_level(text: str) -> float:
    tokenizer, model, torch = _aldi_model()
    with torch.no_grad():
        batch = tokenizer(text, return_tensors="pt", truncation=True, max_length=128)
        logits = model(**batch).logits
    return float(logits.squeeze().item())


def score(text: str) -> Score:
    """Return the three signals for one assistant turn. Never raises on model failure."""
    arabic = strip_latin(text)
    markers = find_fusha_markers(arabic)

    if len(arabic) < MIN_ARABIC_CHARS:
        return Score(
            egyptian=False,
            msa_prob=1.0,
            aldi=0.0,
            fusha_markers=markers,
            scorable=False,
            reason=f"only {len(arabic)} Arabic characters after stripping Latin; too short to score",
        )

    try:
        probs = _dialect_probs(arabic)
        aldi = _aldi_level(arabic)
    except Exception as exc:  # noqa: BLE001 - a missing model must not look like a dialect failure
        return Score(
            egyptian=False,
            msa_prob=1.0,
            aldi=0.0,
            fusha_markers=markers,
            scorable=False,
            reason=f"scorer unavailable: {exc}",
        )

    top_label = max(probs, key=lambda k: probs[k])
    msa_prob = max((v for k, v in probs.items() if k in MSA_LABELS), default=0.0)

    reasons: list[str] = []
    if top_label not in EGYPTIAN_LABELS:
        reasons.append(f"top-1 dialect is {top_label}, not Cairene")
    if msa_prob >= MSA_PROB_MAX:
        reasons.append(f"MSA probability {msa_prob:.2f} >= {MSA_PROB_MAX}")
    if aldi < ALDI_MIN:
        reasons.append(f"Sentence-ALDi {aldi:.2f} < {ALDI_MIN}")
    if markers:
        reasons.append(f"fusha markers: {', '.join(markers)}")

    return Score(
        egyptian=not reasons,
        msa_prob=msa_prob,
        aldi=aldi,
        fusha_markers=markers,
        scorable=True,
        reason="; ".join(reasons) or "Egyptian",
    )


def assert_egyptian(output: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """promptfoo python assertion. Returns {pass, score, reason}."""
    _ = context
    result = score(output)
    return {
        "pass": bool(result["egyptian"]),
        "score": 1.0 if result["egyptian"] else 0.0,
        "reason": result["reason"],
    }


if __name__ == "__main__":  # pragma: no cover - manual smoke
    import json
    import sys

    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(score(line), ensure_ascii=False))
