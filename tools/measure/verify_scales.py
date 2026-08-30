#!/usr/bin/env python3
"""Cross-language verification for the PPL scale profile ecosystem.

Reads the SAME golden fixture as the TypeScript side
(test-fixtures/ppl-color.golden.json) and asserts that this Python
implementation of the canonical interpolation algorithm produces identical
output. Also validates the built-in profile documents against the generated
JSON Schema (docs/schemas/ppl-scale-v1.schema.json).

Usage:
    python tools/measure/verify_scales.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLDEN = REPO_ROOT / "test-fixtures" / "ppl-color.golden.json"
SCHEMA = REPO_ROOT / "docs" / "schemas" / "ppl-scale-v1.schema.json"

# Mirrors BUILTIN_PROFILES in packages/core/src/scale.ts (kept in sync by hand).
BUILTIN_PROFILES = [
    {
        "schemaVersion": 1,
        "id": "zh-default-2026",
        "name": "中文默认",
        "scope": "中文通用文本(zh, general text)",
        "tags": ["zh", "general"],
        "scale": {
            "mode": "linear",
            "stops": [
                {"ppl": 12, "color": "#22c55e"},
                {"ppl": 18, "color": "#eab308"},
                {"ppl": 50, "color": "#ef4444"},
                {"ppl": 100, "color": "#7f1d1d"},
            ],
        },
        "guideline": {"aiLikePplMax": 18, "humanLikePplMin": 35, "hardPplMin": 50},
    },
    {
        "schemaVersion": 1,
        "id": "en-default-2026",
        "name": "English default",
        "scope": "General English prose (en, general text)",
        "tags": ["en", "general"],
        "scale": {
            "mode": "linear",
            "stops": [
                {"ppl": 4, "color": "#22c55e"},
                {"ppl": 6, "color": "#eab308"},
                {"ppl": 16.67, "color": "#ef4444"},
                {"ppl": 33.33, "color": "#7f1d1d"},
            ],
        },
        "guideline": {"aiLikePplMax": 6, "humanLikePplMin": 18, "hardPplMin": 25},
    },
]


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """'#rrggbb' -> (r, g, b); invalid input falls back to gray (as TS does)."""
    import re

    m = re.match(r"^#?([0-9a-f]{6})$", hex_color.strip(), re.IGNORECASE)
    if not m:
        return (128, 128, 128)
    n = int(m.group(1), 16)
    return ((n >> 16) & 255, (n >> 8) & 255, n & 255)


def rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    """Round each channel like JS Math.round (floor(x + 0.5) for x >= 0), clamped to 0..255."""

    def h(v: float) -> str:
        r = int(math.floor(v + 0.5))
        r = min(255, max(0, r))
        return f"{r:02x}"

    return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2])


def color_for_ppl(ppl: float, stops: list[dict]) -> str:
    """Endpoint clamp + linear interpolation in sRGB (see docs/ppl-scale-format.md)."""
    if not stops:
        return "#999999"
    ordered = sorted(stops, key=lambda s: s["ppl"])
    if ppl <= ordered[0]["ppl"]:
        return ordered[0]["color"]
    last = ordered[-1]
    if ppl >= last["ppl"]:
        return last["color"]
    for a, b in zip(ordered, ordered[1:]):
        if a["ppl"] <= ppl <= b["ppl"]:
            t = 0.0 if b["ppl"] == a["ppl"] else (ppl - a["ppl"]) / (b["ppl"] - a["ppl"])
            ca = hex_to_rgb(a["color"])
            cb = hex_to_rgb(b["color"])
            return rgb_to_hex(
                (
                    ca[0] + (cb[0] - ca[0]) * t,
                    ca[1] + (cb[1] - ca[1]) * t,
                    ca[2] + (cb[2] - ca[2]) * t,
                )
            )
    return last["color"]


def verify_golden() -> list[str]:
    """Run every golden case against this Python implementation."""
    import copy

    fixture = json.loads(GOLDEN.read_text(encoding="utf-8"))
    slots = fixture["slots"]
    failures = []
    for case in fixture["cases"]:
        stops = slots[case["slot"]]["stops"]
        try:
            got = color_for_ppl(case["ppl"], copy.deepcopy(stops))
        except Exception as exc:  # noqa: BLE001 - report any crash as a failure
            failures.append(f"{case['name']}: crashed ({exc})")
            continue
        if got != case["expected"]:
            failures.append(
                f"{case['name']}: got {got}, expected {case['expected']}"
            )
    return failures


def verify_profiles() -> list[str]:
    """Validate the built-in profiles against the generated JSON Schema."""
    try:
        import jsonschema
    except ImportError as exc:  # pragma: no cover - environment dependent
        return [f"jsonschema not installed: {exc}"]

    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(schema)
    failures = []
    for profile in BUILTIN_PROFILES:
        for err in sorted(validator.iter_errors(profile), key=lambda e: list(e.path)):
            failures.append(f"{profile['id']}: {err.message}")
    # A few negative checks: the schema must reject broken documents.
    bad = [
        ("empty scope", {**BUILTIN_PROFILES[0], "scope": ""}),
        (
            "bad stop color",
            {
                **BUILTIN_PROFILES[0],
                "scale": {"mode": "linear", "stops": [{"ppl": 1, "color": "red"}]},
            },
        ),
        ("missing guideline", {k: v for k, v in BUILTIN_PROFILES[0].items() if k != "guideline"}),
    ]
    for name, doc in bad:
        if jsonschema.Draft202012Validator(schema).is_valid(doc):
            failures.append(f"schema accepted {name} (expected rejection)")
    return failures


def main() -> int:
    golden_failures = verify_golden()
    profile_failures = verify_profiles()

    golden_total = len(json.loads(GOLDEN.read_text(encoding="utf-8"))["cases"])
    for f in golden_failures:
        print("  FAIL [golden]", f)
    for f in profile_failures:
        print("  FAIL [profile]", f)

    print(f"golden cases: {golden_total - len(golden_failures)}/{golden_total} match")
    print(f"profile schema: {'ok' if not profile_failures else 'FAIL'}")

    return 1 if golden_failures or profile_failures else 0


if __name__ == "__main__":
    sys.exit(main())
