"""Keyword-based categorisation into the CartCrush taxonomy (taxonomy.json).

Pure Python. Each deal gets a department + category, a brand guess, an optional gender, and a
source/confidence so a wrong shelf can be traced and fixed. Manual overrides are never touched.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

TAXONOMY_PATH = Path(__file__).with_name("taxonomy.json")

GENDER_RULES = [
    ("women", re.compile(r"\b(women|woman|womens|women's|ladies|girls?|female|her)\b", re.I)),
    ("men", re.compile(r"\b(men|mens|men's|boys?|male|gents)\b", re.I)),
    ("kids", re.compile(r"\b(kids?|children|toddler|infant)\b", re.I)),
]
_GENERIC_FIRST_WORDS = {
    "women", "men", "kids", "boys", "girls", "ladies", "pack", "set", "new", "premium", "original", "best", "pure", "organic", "smart", "pro",
    "portable", "electric", "led", "usb", "hd", "lcd", "ac", "some", "set", "combo", "mini", "super", "ultra", "high", "multi", "2", "3", "4", "5", "digital", "wireless", "men's", "women's", "mens", "womens", "for", "the",
}


@lru_cache(maxsize=1)
def load_taxonomy() -> dict:
    return json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _compiled() -> list[tuple[str, str, re.Pattern, int]]:
    rules: list[tuple[str, str, re.Pattern, int]] = []
    for dep in load_taxonomy()["departments"]:
        for cat in dep["categories"]:
            for kw in cat["keywords"]:
                word = kw.strip().lower()
                if not word:
                    continue
                pat = re.compile(r"(?<![a-z0-9])" + re.escape(word) + r"(?:s|es)?(?![a-z0-9])")
                rules.append((dep["slug"], cat["slug"], pat, len(word)))
    return rules


def _guess_brand(title: str) -> str | None:
    words = re.findall(r"[\w&'.\-]+", title)
    if not words:
        return None
    first = words[0].strip(".-'")
    if len(first) < 2 or first.lower() in _GENERIC_FIRST_WORDS or first.isdigit():
        return None
    return first[:30]


def classify(title: str) -> dict:
    """Return category fields for a product title."""
    text = title.lower()
    scores: dict[tuple[str, str], int] = {}
    for dep, cat, pat, weight in _compiled():
        if pat.search(text):
            scores[(dep, cat)] = scores.get((dep, cat), 0) + weight
    gender = next((g for g, rx in GENDER_RULES if rx.search(title)), None)
    if gender in ("women", "men"):
        # "for Women" / "Men's" is a strong sign of fashion or beauty: a tie with a generic
        # word elsewhere ("set", "box", "mirror work") goes to the wearable reading.
        for key in scores:
            if key[0] in ("fashion", "beauty-personal-care"):
                scores[key] += 4
    out: dict = {"brand": _guess_brand(title), "gender": gender}
    if not scores:
        out.update(
            department="uncategorised", category="uncategorised",
            category_path=["uncategorised"], category_source="rules", category_confidence=0.0,
        )
        return out
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    (dep, cat), best = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0
    confidence = round(min(0.95, 0.5 + 0.05 * best) * (1.0 if best > second else 0.7), 2)
    out.update(
        department=dep, category=cat, category_path=[dep, cat],
        category_source="rules", category_confidence=confidence,
    )
    return out
