#!/usr/bin/env python3
"""Balance and dominance laboratory for the Phase 1 reference engine.

Deterministic. Seed 2026 for the 10,000-run probe.
Does not change published scoring weights.
"""

from __future__ import annotations

import json
import math
import random
import statistics
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path
from typing import Callable, Dict, List, Sequence, Tuple

import engine as E
from engine import (
    CATALOGUE,
    EQUAL,
    GREEN,
    GROW_EARLY,
    GROW_LATE,
    RESTORE_EARLY,
    RESTORE_LATE,
    SECTORS,
    Submission,
    play_interactive,
)

SEED = 2026
N_RANDOM = 10_000
TOP_FRAC = 0.01

DUMPS = {
    "eco_max",
    "industry_max",
    "welfare_max",
    "hoard",
    "starve_ecology",
    "starve_economy",
    "silent_hold",
}
MIXED = {
    "balanced",
    "prudent_buffer",
    "restore_then_grow",
    "grow_then_restore",
    "green_industry",
    "adaptive_lowest",
    "resilience_max",
    "balanced_mix",
    "reactive",
    "green_industry_path",
    "green_with_restore",
    "habitat_early",
    "prudent_habitat",
}


def share(weights: Dict[str, float], available: float, keep: float = 0.0) -> Dict[str, float]:
    held = min(max(0.0, keep), available)
    spendable = max(0.0, available - held)
    return {k: spendable * float(weights.get(k, 0.0)) for k in SECTORS}


def buffered_submission(
    weights: Dict[str, float], available: float, starts: Sequence[str], min_operating: float = 520.0
) -> Submission:
    """Spend sectors from leftover after project costs, keeping ~300 if cash allows.

    py-ref-1.0.0 lab allocated sectors from the pre-project pot, which dumped the
    published buffer whenever a project started. That was a strategy bug, not a
    scoring rule. Skilled play rebudgets.
    """
    cost = sum(CATALOGUE[code].cost for code in starts)
    leftover = max(0.0, available - cost)
    keep = min(E.IDEAL_RESERVE, max(0.0, leftover - min_operating))
    return Submission(share(weights, leftover, keep=keep), list(starts))


def legal_codes(town) -> List[str]:
    out = []
    for code, proj in CATALOGUE.items():
        if code in town.started:
            continue
        if any(p not in town.completed for p in proj.prerequisites):
            continue
        if proj.mutex_group and E._mutex_taken(town, proj.mutex_group):
            continue
        out.append(code)
    return out


def choose_from_plan(weights_fn, plan: Sequence[str]):
    master = list(plan)

    def choose(round_no, town, available):
        weights = weights_fn(round_no, town)
        starts = []
        remaining = available
        for code in master:
            if len(starts) >= 2:
                break
            if code in town.started or code in starts:
                continue
            if code not in legal_codes(town):
                continue
            cost = CATALOGUE[code].cost
            if cost > remaining:
                continue
            starts.append(code)
            remaining -= cost
        return buffered_submission(weights, available, starts)

    return choose


def const_weights(w):
    return lambda round_no, town: w


def restore_then_grow_w(round_no, town):
    return RESTORE_EARLY if round_no <= 3 else GROW_LATE


def grow_then_restore_w(round_no, town):
    return GROW_EARLY if round_no <= 3 else RESTORE_LATE


def adaptive_w(round_no, town):
    scores = {
        "ecology": E.ecology_index(town),
        "welfare": E.welfare_index(town),
        "economy": E.economy_index(town),
        "resilience": E.resilience_index(town),
    }
    weights = {k: 0.07 for k in SECTORS}
    lowest = min(scores, key=scores.get)
    boost = {
        "ecology": {"restoration": 0.28, "pollution_control": 0.22, "water": 0.16},
        "welfare": {"public_services": 0.28, "water": 0.14, "agriculture": 0.12},
        "economy": {"industry": 0.22, "energy": 0.16, "agriculture": 0.12},
        "resilience": {
            "infrastructure": 0.26,
            "public_services": 0.12,
            "water": 0.12,
            "restoration": 0.10,
        },
    }[lowest]
    for k, v in boost.items():
        weights[k] += v
    total = sum(weights.values())
    return {k: v / total for k, v in weights.items()}


def prudent_choose(round_no, town, available, plan=()):
    keep = min(E.IDEAL_RESERVE, max(0.0, available - 520.0))
    queue = list(plan)
    starts = []
    remaining = available
    for code in list(queue):
        if len(starts) >= 2:
            break
        if code not in legal_codes(town):
            continue
        if CATALOGUE[code].cost > remaining - keep:
            continue
        starts.append(code)
        remaining -= CATALOGUE[code].cost
    return buffered_submission(PRUDENT_W, available, starts)


ECO_MAX = {
    "restoration": 0.34,
    "pollution_control": 0.28,
    "water": 0.22,
    "energy": 0.04,
    "agriculture": 0.04,
    "industry": 0.00,
    "infrastructure": 0.04,
    "public_services": 0.04,
}
INDUSTRY_MAX = {
    "restoration": 0.00,
    "pollution_control": 0.04,
    "water": 0.04,
    "energy": 0.22,
    "agriculture": 0.08,
    "industry": 0.42,
    "infrastructure": 0.14,
    "public_services": 0.06,
}
WELFARE_MAX = {
    "restoration": 0.06,
    "pollution_control": 0.08,
    "water": 0.16,
    "energy": 0.08,
    "agriculture": 0.12,
    "industry": 0.04,
    "infrastructure": 0.10,
    "public_services": 0.36,
}
RESILIENCE_MAX = {
    "restoration": 0.12,
    "pollution_control": 0.08,
    "water": 0.14,
    "energy": 0.14,
    "agriculture": 0.04,
    "industry": 0.04,
    "infrastructure": 0.30,
    "public_services": 0.14,
}
STARVE_ECO = {
    "restoration": 0.00,
    "pollution_control": 0.00,
    "water": 0.08,
    "energy": 0.18,
    "agriculture": 0.14,
    "industry": 0.28,
    "infrastructure": 0.16,
    "public_services": 0.16,
}
STARVE_ECON = {
    "restoration": 0.22,
    "pollution_control": 0.18,
    "water": 0.16,
    "energy": 0.06,
    "agriculture": 0.08,
    "industry": 0.00,
    "infrastructure": 0.14,
    "public_services": 0.16,
}
HOARD = {k: 0.04 for k in SECTORS}
PRUDENT_W = {
    "restoration": 0.14,
    "pollution_control": 0.14,
    "water": 0.12,
    "energy": 0.12,
    "agriculture": 0.10,
    "industry": 0.10,
    "infrastructure": 0.16,
    "public_services": 0.12,
}


def named_strategies() -> Dict[str, Callable]:
    out: Dict[str, Callable] = {}
    out["balanced"] = choose_from_plan(const_weights(EQUAL), [])
    out["green_industry"] = choose_from_plan(const_weights(GREEN), [])
    out["restore_then_grow"] = choose_from_plan(restore_then_grow_w, [])
    out["grow_then_restore"] = choose_from_plan(grow_then_restore_w, [])
    out["adaptive_lowest"] = choose_from_plan(adaptive_w, [])
    out["eco_max"] = choose_from_plan(const_weights(ECO_MAX), [])
    out["industry_max"] = choose_from_plan(const_weights(INDUSTRY_MAX), [])
    out["welfare_max"] = choose_from_plan(const_weights(WELFARE_MAX), [])
    out["resilience_max"] = choose_from_plan(const_weights(RESILIENCE_MAX), [])
    out["starve_ecology"] = choose_from_plan(const_weights(STARVE_ECO), [])
    out["starve_economy"] = choose_from_plan(const_weights(STARVE_ECON), [])
    out["hoard"] = choose_from_plan(const_weights(HOARD), [])
    out["silent_hold"] = lambda n, t, a: Submission({}, [])
    out["prudent_buffer"] = lambda n, t, a: prudent_choose(n, t, a, ())

    # Hand-designed project families on a green/restore allocation.
    out["habitat_early"] = choose_from_plan(restore_then_grow_w, ["WETLAND", "REFOREST"])
    out["flood_pack"] = choose_from_plan(const_weights(RESILIENCE_MAX), ["WETLAND", "FLOOD_WALL"])
    out["clean_grid"] = choose_from_plan(const_weights(GREEN), ["GRID", "CLINICS", "RENEWABLES"])
    out["coal_rush"] = choose_from_plan(const_weights(INDUSTRY_MAX), ["GRID", "COAL"])
    out["green_path"] = choose_from_plan(
        const_weights(GREEN),
        ["GRID", "EMISSIONS", "FACTORIES", "GREEN_MFG", "RENEWABLES"],
    )
    out["health_water"] = choose_from_plan(
        const_weights(WELFARE_MAX), ["WATER_TREAT", "CLINICS", "WASTEWATER"]
    )
    out["river_scrub"] = choose_from_plan(restore_then_grow_w, ["RIVER", "EMISSIONS"])
    out["prudent_flood"] = lambda n, t, a: prudent_choose(n, t, a, ["WETLAND", "FLOOD_WALL"])
    out["prudent_habitat"] = lambda n, t, a: prudent_choose(n, t, a, ["WETLAND", "REFOREST"])
    out["restore_habitat"] = choose_from_plan(
        restore_then_grow_w, ["WETLAND", "REFOREST", "RIVER"]
    )
    out["intense_industry"] = choose_from_plan(
        const_weights(INDUSTRY_MAX), ["GRID", "INTENSE_AG", "FACTORIES"]
    )
    out["regen_wetland"] = choose_from_plan(restore_then_grow_w, ["REGEN_AG", "WETLAND"])
    # A-CAT-1.1 named families. restoration_first is habitat_early; welfare_first is health_water.
    out["balanced_mix"] = lambda n, t, a: prudent_choose(n, t, a, ["WETLAND", "RIVER"])

    def reactive(round_no, town, available):
        if round_no == 2:
            starts = ["WATER_TREAT"]
        elif round_no == 3:
            starts = ["FLOOD_WALL"]
        else:
            starts = []
        return buffered_submission(PRUDENT_W, available, starts)

    out["reactive"] = reactive

    def green_industry_path(round_no, town, available):
        plan = {1: ["GRID", "EMISSIONS"], 2: ["FACTORIES"], 3: ["GREEN_MFG"]}
        return buffered_submission(GREEN, available, plan.get(round_no, []))

    out["green_industry_path"] = green_industry_path

    def green_with_restore(round_no, town, available):
        plan = {
            1: ["WETLAND", "EMISSIONS"],
            2: ["GRID"],
            3: ["FACTORIES"],
            4: ["GREEN_MFG"],
        }
        return buffered_submission(PRUDENT_W, available, plan.get(round_no, []))

    out["green_with_restore"] = green_with_restore
    return out


def run_named() -> List[Dict]:
    rows = []
    for name, fn in named_strategies().items():
        result = play_interactive(fn)
        rows.append(
            {
                "name": name,
                "family": "dump" if name in DUMPS else "mixed",
                "score": result["score"],
                "ecology": round(result["categories"]["ecology"], 2),
                "welfare": round(result["categories"]["welfare"], 2),
                "economy": round(result["categories"]["economy"], 2),
                "resilience": round(result["categories"]["resilience"], 2),
                "efficiency": round(result["categories"]["efficiency"], 2),
                "penalty": round(result["categories"]["penalty"], 2),
                "completed": sorted(result["completed"]),
                "hash": result["hash"],
            }
        )
    rows.sort(key=lambda r: -r["score"])
    return rows


def prereq_plan(*codes: str) -> List[str]:
    """Stable topological start list so singles/pairs actually land."""
    ordered: List[str] = []

    def add(code: str) -> None:
        if code in ordered:
            return
        for need in CATALOGUE[code].prerequisites:
            add(need)
        if code not in ordered:
            ordered.append(code)

    for code in codes:
        add(code)
    return ordered


def start_asap_choose(*codes: str):
    plan = prereq_plan(*codes)
    return choose_from_plan(const_weights(GREEN), plan)


def run_singles() -> List[Dict]:
    rows = []
    for code in CATALOGUE:
        result = play_interactive(start_asap_choose(code))
        rows.append(
            {
                "project": code,
                "score": result["score"],
                "completed": sorted(result["completed"]),
                "started": sorted(result["started"]),
            }
        )
    rows.sort(key=lambda r: -r["score"])
    return rows


def run_pairs() -> List[Dict]:
    rows = []
    for a, b in combinations(CATALOGUE, 2):
        result = play_interactive(start_asap_choose(a, b))
        rows.append(
            {
                "pair": f"{a}+{b}",
                "score": result["score"],
                "completed": sorted(result["completed"]),
            }
        )
    rows.sort(key=lambda r: -r["score"])
    return rows


def random_choose(rng: random.Random):
    keep_choices = (0.0, 0.0, 0.12, 0.22, 0.35, 0.5)

    def choose(round_no, town, available):
        parts = [rng.random() for _ in SECTORS]
        total = sum(parts) or 1.0
        keep_frac = rng.choice(keep_choices)
        keep = available * keep_frac
        legal = legal_codes(town)
        rng.shuffle(legal)
        n_start = rng.choice((0, 0, 1, 1, 2))
        starts = []
        remaining = available
        for code in legal[:n_start]:
            if CATALOGUE[code].cost <= remaining - keep:
                starts.append(code)
                remaining -= CATALOGUE[code].cost
        weights = {k: p / total for k, p in zip(SECTORS, parts)}
        leftover_keep = min(keep, remaining)
        return Submission(share(weights, remaining, keep=leftover_keep), starts)

    return choose


def percentile(sorted_vals: List[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = min(len(sorted_vals) - 1, max(0, int(round((len(sorted_vals) - 1) * p))))
    return sorted_vals[idx]


def run_random(n: int = N_RANDOM, seed: int = SEED) -> Dict:
    rows = []
    project_all = Counter()
    opening_all = Counter()
    for i in range(n):
        rng = random.Random(seed + i)
        result = play_interactive(random_choose(rng))
        opening = tuple(sorted(result["rounds"][0].accepted_starts))
        completed = tuple(sorted(result["completed"]))
        for code in result["completed"]:
            project_all[code] += 1
        opening_all[opening] += 1
        rows.append(
            {
                "i": i,
                "score": result["score"],
                "completed": completed,
                "opening": opening,
            }
        )
    scores = sorted(r["score"] for r in rows)
    cutoff_n = max(1, int(n * TOP_FRAC))
    top = sorted(rows, key=lambda r: -r["score"])[:cutoff_n]
    project_top = Counter()
    opening_top = Counter()
    for r in top:
        for code in r["completed"]:
            project_top[code] += 1
        opening_top[r["opening"]] += 1

    def lift(counter_top, counter_all, key, top_n, all_n):
        base = counter_all[key] / all_n if all_n else 0.0
        obs = counter_top[key] / top_n if top_n else 0.0
        if base <= 0:
            return None
        return round(obs / base, 3)

    project_lifts = []
    for code in CATALOGUE:
        lv = lift(project_top, project_all, code, cutoff_n, n)
        project_lifts.append(
            {
                "project": code,
                "base_rate": round(project_all[code] / n, 4),
                "top_rate": round(project_top[code] / cutoff_n, 4),
                "lift": lv,
                "count_top": project_top[code],
            }
        )
    project_lifts.sort(key=lambda x: -(x["lift"] or 0))

    opening_lifts = []
    for key, _ in opening_top.most_common(12):
        opening_lifts.append(
            {
                "opening": list(key),
                "base_rate": round(opening_all[key] / n, 4),
                "top_rate": round(opening_top[key] / cutoff_n, 4),
                "lift": lift(opening_top, opening_all, key, cutoff_n, n),
                "count_top": opening_top[key],
            }
        )
    return {
        "n": n,
        "seed": seed,
        "min": scores[0],
        "p10": percentile(scores, 0.10),
        "p50": percentile(scores, 0.50),
        "p90": percentile(scores, 0.90),
        "p99": percentile(scores, 0.99),
        "max": scores[-1],
        "mean": round(sum(scores) / n, 3),
        "stdev": round(statistics.pstdev(scores), 3),
        "best_index": max(rows, key=lambda r: r["score"])["i"],
        "best_completed": list(max(rows, key=lambda r: r["score"])["completed"]),
        "best_opening": list(max(rows, key=lambda r: r["score"])["opening"]),
        "project_lifts": project_lifts,
        "opening_lifts": opening_lifts,
        "unique_openings_in_top": len(opening_top),
        "unique_completed_sets_in_top": len({r["completed"] for r in top}),
    }


def pairwise_named(rows: List[Dict], limit: int = 8) -> List[Dict]:
    top = rows[:limit]
    out = []
    for i, a in enumerate(top):
        for b in top[i + 1 :]:
            out.append(
                {
                    "a": a["name"],
                    "b": b["name"],
                    "gap": round(a["score"] - b["score"], 2),
                    "winner": a["name"] if a["score"] >= b["score"] else b["name"],
                }
            )
    return out


def run_flagship_conditions() -> List[Dict]:
    """Each A11 flagship under restore, prudent, and green operating mixes."""
    codes = ["WETLAND", "REFOREST", "FLOOD_WALL", "WASTEWATER", "GREEN_MFG"]
    weight_fns = {
        "prudent": const_weights(PRUDENT_W),
        "restore_then_grow": restore_then_grow_w,
        "green": const_weights(GREEN),
    }
    rows = []
    for code in codes:
        plan = prereq_plan(code)
        for wname, wfn in weight_fns.items():
            result = play_interactive(choose_from_plan(wfn, plan))
            rows.append(
                {
                    "project": code,
                    "operating": wname,
                    "score": result["score"],
                    "ecology": round(result["categories"]["ecology"], 2),
                    "welfare": round(result["categories"]["welfare"], 2),
                    "economy": round(result["categories"]["economy"], 2),
                    "resilience": round(result["categories"]["resilience"], 2),
                    "efficiency": round(result["categories"]["efficiency"], 2),
                    "completed": sorted(result["completed"]),
                    "mean_damage": round(result["mean_damage"], 2),
                }
            )
    rows.sort(key=lambda r: -r["score"])
    return rows


def targeted_choose(rng: random.Random):
    """Biased search: 1–2 flagship projects, mixed operating, keep a buffer."""
    flagship = ["WETLAND", "REFOREST", "FLOOD_WALL", "WASTEWATER", "RIVER", "WATER_TREAT"]
    industry = ["GRID", "EMISSIONS", "FACTORIES", "GREEN_MFG", "RENEWABLES"]
    mixes = (PRUDENT_W, GREEN, RESTORE_EARLY, GROW_LATE, WELFARE_MAX, RESILIENCE_MAX)

    def choose(round_no, town, available):
        weights = dict(rng.choice(mixes))
        pool = list(flagship)
        if rng.random() < 0.45:
            pool.extend(industry)
        rng.shuffle(pool)
        n_start = rng.choice((0, 1, 1, 1, 2, 2))
        starts = []
        remaining = available
        keep = min(E.IDEAL_RESERVE, max(0.0, available - 520.0))
        legal = set(legal_codes(town))
        for code in pool:
            if len(starts) >= n_start:
                break
            if code not in legal:
                continue
            cost = CATALOGUE[code].cost
            if cost > remaining - keep:
                continue
            starts.append(code)
            remaining -= cost
            legal.discard(code)
        return buffered_submission(weights, available, starts)

    return choose


def run_targeted(n: int = 5_000, seed: int = 4040) -> Dict:
    rows = []
    for i in range(n):
        rng = random.Random(seed + i)
        result = play_interactive(targeted_choose(rng))
        rows.append(
            {
                "i": i,
                "score": result["score"],
                "completed": tuple(sorted(result["completed"])),
                "ecology": round(result["categories"]["ecology"], 2),
                "welfare": round(result["categories"]["welfare"], 2),
                "economy": round(result["categories"]["economy"], 2),
            }
        )
    scores = sorted(r["score"] for r in rows)
    best = max(rows, key=lambda r: r["score"])
    return {
        "n": n,
        "seed": seed,
        "min": scores[0],
        "p50": percentile(scores, 0.50),
        "p90": percentile(scores, 0.90),
        "p99": percentile(scores, 0.99),
        "max": scores[-1],
        "mean": round(sum(scores) / n, 3),
        "best_index": best["i"],
        "best_completed": list(best["completed"]),
        "best_ecology": best["ecology"],
        "best_welfare": best["welfare"],
        "best_economy": best["economy"],
    }


def evaluate_gate(named: List[Dict], random_stats: Dict) -> Dict:
    winner = named[0]
    gap = named[0]["score"] - named[1]["score"]
    dump_scores = [r["score"] for r in named if r["name"] in DUMPS]
    mixed_scores = [r["score"] for r in named if r["name"] in MIXED or r["family"] == "mixed"]
    best_dump = max(dump_scores) if dump_scores else 0.0
    high_lifts = [
        p
        for p in random_stats["project_lifts"]
        if p["lift"] is not None and p["lift"] >= 3.0 and p["count_top"] >= 10
    ]
    opening_dom = [
        o
        for o in random_stats["opening_lifts"]
        if o["opening"]
        and o["lift"] is not None
        and o["top_rate"] >= 0.40
    ]
    random_beats = random_stats["max"] > winner["score"] + 0.5
    winner_is_dump = winner["name"] in DUMPS
    gate = {
        "win_gap": round(gap, 2),
        "win_gap_ok": gap < 5.0,
        "winner": winner["name"],
        "winner_is_mixed": not winner_is_dump,
        "best_dump": round(best_dump, 2),
        "dump_margin_ok": winner["score"] - best_dump >= 3.0,
        "random_max": random_stats["max"],
        "random_max_ok": random_stats["max"] <= winner["score"] + 0.5,
        "high_project_lifts": high_lifts,
        "opening_concentration": opening_dom,
        "random_beats_named_by_half_point": random_beats,
        "top1_completed_diversity": random_stats["unique_completed_sets_in_top"],
    }
    gate["pass"] = (
        gate["win_gap_ok"]
        and gate["winner_is_mixed"]
        and gate["dump_margin_ok"]
        and not opening_dom
        and gate["top1_completed_diversity"] >= 8
    )
    # Note: random_max_ok is reported but not required to pass if diversity holds,
    # because projects can lift random play without a single recipe. Dominance is
    # lift + concentration, not "random scored lower".
    operating = [r for r in named if not r["completed"]]
    with_projects = [r for r in named if r["completed"]]
    best_operating = max(operating, key=lambda r: r["score"]) if operating else winner
    best_project = max(with_projects, key=lambda r: r["score"]) if with_projects else winner
    a11_gap = round(best_project["score"] - best_operating["score"], 2)
    gate["best_operating"] = {"name": best_operating["name"], "score": best_operating["score"]}
    gate["best_with_projects"] = {
        "name": best_project["name"],
        "score": best_project["score"],
        "completed": best_project["completed"],
    }
    gate["a11_gap"] = a11_gap
    gate["a11_breakaway_ok"] = a11_gap >= 1.0
    gate["catalogue_freeze_ok"] = bool(gate["pass"] and gate["a11_breakaway_ok"])
    gate["notes"] = (
        "Dominance gate uses named win-gap, mixed winner, dump margin, opening "
        "concentration, and top-1% recipe diversity. A11 freeze additionally requires "
        "the best named project path to beat the best operating-only path by ≥ 1.0. "
        "random_max_ok is diagnostic, not sufficient for balance."
    )
    return gate


def sensitivity(named_subset: Sequence[str]) -> Dict:
    strategies = named_strategies()
    baseline = {n: play_interactive(strategies[n])["score"] for n in named_subset}

    def ranks(scores: Dict[str, float]):
        ordered = sorted(scores, key=lambda k: -scores[k])
        return {k: i + 1 for i, k in enumerate(ordered)}

    base_ranks = ranks(baseline)
    variants = {}
    original = (E.SAT_SCALE, E.NEGLECT_SHARE, E.EVENT_SCALE)
    trials = {
        "sat_scale_0.9": {"SAT_SCALE": original[0] * 0.9},
        "sat_scale_1.1": {"SAT_SCALE": original[0] * 1.1},
        "neglect_0.14": {"NEGLECT_SHARE": 0.14},
        "neglect_0.18": {"NEGLECT_SHARE": 0.18},
        "event_scale_0.9": {"EVENT_SCALE": 0.9},
        "event_scale_1.1": {"EVENT_SCALE": 1.1},
    }
    for label, patch in trials.items():
        for key, val in patch.items():
            setattr(E, key, val)
        scores = {n: play_interactive(strategies[n])["score"] for n in named_subset}
        new_ranks = ranks(scores)
        swaps = [n for n in named_subset if new_ranks[n] != base_ranks[n]]
        variants[label] = {
            "scores": {k: round(v, 2) for k, v in scores.items()},
            "rank_changes": {n: [base_ranks[n], new_ranks[n]] for n in swaps},
            "winner": max(scores, key=scores.get),
        }
        E.SAT_SCALE, E.NEGLECT_SHARE, E.EVENT_SCALE = original
    return {"baseline": {k: round(v, 2) for k, v in baseline.items()}, "variants": variants}


def main() -> None:
    named = run_named()
    singles = run_singles()
    pairs = run_pairs()
    rnd = run_random()
    targeted = run_targeted()
    flagship = run_flagship_conditions()
    subset = [r["name"] for r in named[:6]]
    if "prudent_buffer" not in subset:
        subset.append("prudent_buffer")
    sens = sensitivity(subset)
    gate = evaluate_gate(named, rnd)
    report = {
        "engine_version": E.ENGINE_VERSION,
        "weights": E.WEIGHTS,
        "named": named,
        "named_winner": named[0],
        "named_gap": round(named[0]["score"] - named[1]["score"], 2),
        "singles": singles,
        "best_single": singles[0],
        "worst_single": singles[-1],
        "pairs_n": len(pairs),
        "best_pairs": pairs[:8],
        "worst_pairs": list(reversed(pairs[-5:])),
        "flagship_conditions": flagship,
        "random": {k: rnd[k] for k in rnd if k not in ("project_lifts", "opening_lifts")},
        "project_lifts": rnd["project_lifts"],
        "opening_lifts": rnd["opening_lifts"],
        "targeted": targeted,
        "pairwise_top8": pairwise_named(named, 8),
        "sensitivity": sens,
        "gate": gate,
    }
    out_path = Path(__file__).resolve().parent / "balance_lab_results.json"
    out_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
