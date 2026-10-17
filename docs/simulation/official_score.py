#!/usr/bin/env python3
"""Official Langlands R3 scoring overlay (40/25/15/10/10).

Reuses the town engine in score_lab.py. Does not overwrite that file.
This module is the proposed competition score; keep it in lockstep with
docs/scoring-system.md.
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent))

from score_lab import (  # noqa: E402
    ROUNDS,
    SECTORS,
    STRATEGIES,
    Town,
    apply_allocations,
    apply_delayed,
    apply_drift,
    clamp,
    income_for,
    normalize_spend,
    reserve_score,
)

WEIGHTS = {
    "ecology": 0.40,
    "welfare": 0.25,
    "economy": 0.15,
    "resilience": 0.10,
    "efficiency": 0.10,
}

DYS_ECOLOGY = 36.0
DYS_WELFARE = 40.0
DYS_ECONOMY = 40.0
DYS_PREP_INFRA = 32.0


def ecology_index(town: Town) -> float:
    return (
        town.air + town.water_q + town.soil + town.bio + (100.0 - town.pollution)
    ) / 5.0


def welfare_index(town: Town) -> float:
    return (town.health + town.services + town.jobs) / 3.0


def economy_index(town: Town) -> float:
    return (town.economy + town.fiscal + town.energy) / 3.0


def prep_infra_index(town: Town) -> float:
    return 0.5 * town.prep + 0.5 * town.infra


def shock_absorption(town: Town) -> float:
    events = [d for d in town.shock_log if d > 0]
    if not events:
        return prep_infra_index(town)
    return clamp(100.0 - (sum(events) / len(events)))


def resilience_index(town: Town) -> float:
    return 0.50 * prep_infra_index(town) + 0.50 * shock_absorption(town)


def saturation_waste(spend: Dict[str, float]) -> float:
    """Share of credits spent past the useful part of sat() (S > 520)."""
    spent = max(spend.get("_spent", 0.0), 1.0)
    waste = sum(max(0.0, spend.get(k, 0.0) - 520.0) for k in SECTORS)
    return waste / spent


def efficiency_index(town: Town, spend: Dict[str, float]) -> float:
    discipline = reserve_score(town.reserve)
    waste_score = 100.0 * (1.0 - saturation_waste(spend))
    # Reward putting spend where sat() still has slope, without forcing 8-way equality.
    useful = 0.0
    mass = 0.0
    for k in SECTORS:
        s = spend.get(k, 0.0)
        if s <= 0:
            continue
        useful += s * math.exp(-s / 340.0)
        mass += s
    yield_score = 100.0 * (useful / mass) if mass else 50.0
    return clamp(0.40 * discipline + 0.35 * waste_score + 0.25 * yield_score)


def dysfunction_penalty(town: Town) -> float:
    e, w, y = ecology_index(town), welfare_index(town), economy_index(town)
    r = prep_infra_index(town)
    penalty = 0.0
    if e < DYS_ECOLOGY:
        penalty += 0.62 * (DYS_ECOLOGY - e)
    if w < DYS_WELFARE:
        penalty += 0.50 * (DYS_WELFARE - w)
    if y < DYS_ECONOMY:
        penalty += 0.70 * (DYS_ECONOMY - y)
    if r < DYS_PREP_INFRA:
        penalty += 0.35 * (DYS_PREP_INFRA - r)
    if town.population < 47_000:
        penalty += 8.0
    return penalty


def snapshot(town: Town, spend: Dict[str, float]) -> Dict[str, float]:
    cats = {
        "ecology": ecology_index(town),
        "welfare": welfare_index(town),
        "economy": economy_index(town),
        "resilience": resilience_index(town),
        "efficiency": efficiency_index(town, spend),
    }
    raw = sum(WEIGHTS[k] * cats[k] for k in WEIGHTS)
    total = clamp(raw - dysfunction_penalty(town))
    cats["snapshot"] = total
    cats["penalty"] = dysfunction_penalty(town)
    return cats


def final_score(snapshots: List[float]) -> float:
    if not snapshots:
        return 0.0
    last = snapshots[-1]
    mean = sum(snapshots) / len(snapshots)
    return round(clamp(0.62 * last + 0.38 * mean), 2)


def apply_event_pack_a(town: Town, round_no: int) -> float:
    """Canonical scenario pack A. Same event for every team; impact scales with state."""
    if round_no == 2:
        # Heatwave.
        damage = (
            10.0
            + 0.20 * (100.0 - town.water_q)
            + 0.16 * (100.0 - town.bio)
            + 0.18 * (100.0 - town.prep)
            - 0.10 * town.buffer
        )
        town.water_q = clamp(town.water_q - 0.16 * damage)
        town.health = clamp(town.health - 0.14 * damage)
        town.energy = clamp(town.energy - 0.08 * damage)
        town.buffer = clamp(town.buffer - 0.06 * damage)
    elif round_no == 3:
        # Drought.
        damage = (
            11.0
            + 0.24 * (100.0 - town.water_q)
            + 0.16 * (100.0 - town.soil)
            + 0.12 * (100.0 - town.prep)
            - 0.08 * town.buffer
        )
        town.water_q = clamp(town.water_q - 0.20 * damage)
        town.soil = clamp(town.soil - 0.12 * damage)
        town.economy = clamp(town.economy - 0.10 * damage)
        town.bio = clamp(town.bio - 0.08 * damage)
        town.jobs = clamp(town.jobs - 0.06 * damage)
    elif round_no == 4:
        # Flood.
        damage = (
            12.0
            + 0.20 * (100.0 - town.infra)
            + 0.18 * (100.0 - town.buffer)
            + 0.12 * (100.0 - town.soil)
            + 0.10 * (town.pollution - 40.0)
            - 0.10 * town.prep
        )
        town.infra = clamp(town.infra - 0.16 * damage)
        town.soil = clamp(town.soil - 0.10 * damage)
        town.water_q = clamp(town.water_q - 0.14 * damage)
        town.services = clamp(town.services - 0.08 * damage)
        town.economy = clamp(town.economy - 0.07 * damage)
    elif round_no == 5:
        # Pollution / contamination incident.
        damage = (
            9.0
            + 0.24 * (town.pollution - 35.0)
            + 0.16 * (100.0 - town.water_q)
            + 0.12 * (100.0 - town.health)
            - 0.10 * town.prep
        )
        town.health = clamp(town.health - 0.18 * damage)
        town.jobs = clamp(town.jobs - 0.08 * damage)
        town.fiscal = clamp(town.fiscal - 0.06 * damage)
        town.air = clamp(town.air - 0.05 * damage)
    else:
        damage = 0.0
    damage = max(0.0, damage)
    town.shock_log.append(damage)
    return damage


def play_official(strategy) -> Dict[str, object]:
    town = Town()
    snaps: List[float] = []
    categories: List[Dict[str, float]] = []
    last_spend: Dict[str, float] = {k: 0.0 for k in SECTORS}
    last_spend["_spent"] = 0.0
    for round_no in range(1, ROUNDS + 1):
        apply_drift(town)
        apply_delayed(town)
        revenue = income_for(town, round_no)
        available = max(0.0, town.reserve + revenue)
        spend = normalize_spend(strategy(round_no, town, available), available)
        apply_allocations(town, spend)
        apply_event_pack_a(town, round_no)
        town.reserve = spend.get("_unspent", 0.0)
        last_spend = spend
        cat = snapshot(town, spend)
        snaps.append(cat["snapshot"])
        categories.append({k: round(v, 2) for k, v in cat.items()})
    return {
        "score": final_score(snaps),
        "snaps": [round(s, 2) for s in snaps],
        "categories": categories[-1],
        "path": categories,
        "reserve": round(town.reserve, 1),
        "population": round(town.population, 0),
    }


def random_strategy(seed: int):
    rng = random.Random(seed)

    def fn(round_no: int, town: Town, available: float):
        parts = [rng.random() for _ in SECTORS]
        total = sum(parts) or 1.0
        keep = rng.choice([0.0, 0.0, 0.1, 0.2, 0.35, 0.55])
        spendable = available * (1.0 - keep)
        return {k: spendable * (p / total) for k, p in zip(SECTORS, parts)}

    return fn


def named_rows() -> List[Dict[str, object]]:
    rows = []
    for name, fn in STRATEGIES.items():
        result = play_official(fn)
        rows.append({"strategy": name, **result})
    return rows


def random_probe(n: int = 400, seed: int = 2026) -> Dict[str, object]:
    scores = []
    best = ("", -1.0)
    for i in range(n):
        result = play_official(random_strategy(seed + i))
        score = float(result["score"])
        scores.append(score)
        if score > best[1]:
            best = (f"random_{seed + i}", score)
    scores.sort()
    return {
        "n": n,
        "min": round(scores[0], 2),
        "p50": round(scores[n // 2], 2),
        "p90": round(scores[int(n * 0.9)], 2),
        "max": round(scores[-1], 2),
        "best_id": best[0],
        "best_score": round(best[1], 2),
    }


def dominance(rows: List[Dict[str, object]]) -> Dict[str, object]:
    mixed = {
        "balanced",
        "adaptive_lowest_pillar",
        "restore_then_grow",
        "grow_then_restore",
        "even_pair_ecology_economy",
        "green_industry",
        "prudent_buffer",
        "resilience_max",
    }
    dumps = {
        "eco_max",
        "industry_max",
        "welfare_max",
        "hoard",
        "starve_ecology",
        "starve_economy",
    }
    ordered = sorted(rows, key=lambda r: -float(r["score"]))
    top = ordered[0]
    gap = float(top["score"]) - float(ordered[1]["score"])
    mixed_scores = [float(r["score"]) for r in rows if r["strategy"] in mixed]
    dump_scores = [float(r["score"]) for r in rows if r["strategy"] in dumps]
    return {
        "winner": top["strategy"],
        "winner_score": top["score"],
        "win_gap": round(gap, 2),
        "mixed_band": round(max(mixed_scores) - min(mixed_scores), 2),
        "best_dump": round(max(dump_scores), 2),
        "mixed_beats_dumps": min(mixed_scores) > max(dump_scores),
        "no_dominant": gap < 5.0 and top["strategy"] in mixed,
        "ranking": [(r["strategy"], r["score"]) for r in ordered],
    }


def main() -> None:
    rows = named_rows()
    report = {
        "weights": WEIGHTS,
        "dysfunction": {
            "ecology": DYS_ECOLOGY,
            "welfare": DYS_WELFARE,
            "economy": DYS_ECONOMY,
            "prep_infra": DYS_PREP_INFRA,
        },
        "named": [
            {
                "strategy": r["strategy"],
                "score": r["score"],
                **r["categories"],
            }
            for r in rows
        ],
        "dominance": dominance(rows),
        "random": random_probe(),
        "note": "Buffer/cash is scored only in efficiency, not in ecology or resilience.",
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
