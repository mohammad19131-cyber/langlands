#!/usr/bin/env python3
"""Langlands R3 scoring laboratory.

This is a pedagogical game model, not a scientific Earth-system model.
Every coefficient is an assumption documented in docs/LANGLANDS-R3-PLAN.md.

The engine is deterministic: the same allocations always produce the same
town state and score. Official competition scoring must reimplement these
rules server-side; browsers never compute ranking scores.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Sequence

SECTORS = (
    "restoration",
    "pollution_control",
    "water",
    "energy",
    "agriculture",
    "industry",
    "infrastructure",
    "public_services",
)

ROUNDS = 6
STARTING_RESERVE = 220.0
FLOOR = 32.0
IDEAL_RESERVE = 300.0  # fiscal buffer target; hoarding is not resilience


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def sat(spend: float, scale: float = 340.0) -> float:
    """Diminishing returns. 0 -> 0; 200 -> 5.3; 340 -> 7.6; 800 -> 10.9; 1500 -> 11.9."""
    return 12.0 * (1.0 - math.exp(-max(spend, 0.0) / scale))


def reserve_score(reserve: float) -> float:
    """Gaussian around a working buffer. Excess cash does not farm the score."""
    return 100.0 * math.exp(-((reserve - IDEAL_RESERVE) ** 2) / (2.0 * 160.0 ** 2))


@dataclass
class Town:
    air: float = 32.0
    water_q: float = 38.0
    soil: float = 36.0
    bio: float = 28.0
    pollution: float = 68.0
    health: float = 44.0
    services: float = 48.0
    jobs: float = 46.0
    economy: float = 50.0
    fiscal: float = 52.0
    energy: float = 42.0
    infra: float = 46.0
    prep: float = 30.0
    buffer: float = 26.0
    reserve: float = STARTING_RESERVE
    population: float = 50_000.0
    dirty_energy: float = 1.0  # 1 = default post-disaster diesel/coal mix
    green_energy: float = 0.0
    intensive_ag: float = 0.4
    regenerative_ag: float = 0.1
    industrial_intensity: float = 0.45
    delayed: Dict[str, float] = field(default_factory=dict)
    shock_log: List[float] = field(default_factory=list)
    pillar_history: List[Dict[str, float]] = field(default_factory=list)
    score_history: List[float] = field(default_factory=list)
    budget_history: List[Dict[str, float]] = field(default_factory=list)


def pillars(town: Town) -> Dict[str, float]:
    ecology = (
        town.air
        + town.water_q
        + town.soil
        + town.bio
        + (100.0 - town.pollution)
    ) / 5.0
    welfare = (town.health + town.services + town.jobs) / 3.0
    economy = (town.economy + town.fiscal + town.energy) / 3.0
    resilience = (
        0.30 * town.infra
        + 0.30 * town.prep
        + 0.25 * town.buffer
        + 0.15 * reserve_score(town.reserve)
    )
    return {
        "ecology": ecology,
        "welfare": welfare,
        "economy": economy,
        "resilience": resilience,
    }


def floor_penalty(p: Dict[str, float]) -> float:
    penalty = 0.0
    for value in p.values():
        if value < FLOOR:
            penalty += 0.72 * (FLOOR - value)
    return penalty


def snapshot_score(town: Town) -> float:
    p = pillars(town)
    raw = (
        0.28 * p["ecology"]
        + 0.24 * p["welfare"]
        + 0.24 * p["economy"]
        + 0.24 * p["resilience"]
    )
    return clamp(raw - floor_penalty(p))


def shock_score(town: Town) -> float:
    if not town.shock_log:
        return 70.0
    mean_damage = sum(town.shock_log) / len(town.shock_log)
    return clamp(100.0 - mean_damage)


def final_score(town: Town) -> float:
    if not town.score_history:
        last = snapshot_score(town)
        avg = last
    else:
        last = town.score_history[-1]
        avg = sum(town.score_history) / len(town.score_history)
    score = 0.58 * last + 0.27 * avg + 0.15 * shock_score(town)
    return round(clamp(score), 2)


def income_for(town: Town, round_no: int) -> float:
    grant = 180.0 if round_no == 1 else 0.0
    return (
        180.0
        + grant
        + 8.6 * town.economy
        + 3.2 * town.jobs
        + 1.6 * town.fiscal
        - 0.45 * town.pollution
        - 0.40 * (100.0 - town.health)
        - 0.30 * (100.0 - town.energy)
    )


def apply_drift(town: Town) -> None:
    pollution_push = (
        1.6
        + 0.035 * town.industrial_intensity * town.economy
        + 1.1 * town.dirty_energy
        + 0.8 * town.intensive_ag
        - 0.9 * town.green_energy
        - 0.4 * town.regenerative_ag
    )
    town.pollution = clamp(town.pollution + pollution_push - 0.04 * town.buffer)
    town.air = clamp(town.air - 0.55 * town.dirty_energy - 0.012 * town.pollution + 0.08 * town.bio)
    town.water_q = clamp(town.water_q - 0.35 * town.intensive_ag - 0.01 * town.pollution)
    town.soil = clamp(town.soil - 0.40 * town.intensive_ag + 0.12 * town.regenerative_ag)
    town.bio = clamp(town.bio - 0.50 - 0.012 * town.pollution + 0.06 * town.buffer)
    town.infra = clamp(town.infra - 1.05)
    town.energy = clamp(town.energy - 0.95)
    town.services = clamp(town.services - 0.70)
    town.prep = clamp(town.prep - 0.75)
    town.buffer = clamp(town.buffer - 0.40)
    town.fiscal = clamp(town.fiscal - 0.55)
    town.economy = clamp(town.economy - 1.15 - 0.40 * town.dirty_energy)
    # Health tracks environment and services with lag.
    env = (town.air + town.water_q) / 2.0
    town.health = clamp(
        town.health
        + 0.18 * (env - town.health)
        + 0.08 * (town.services - 50.0) / 10.0
        - 0.04 * (town.pollution - 50.0) / 10.0
    )
    town.jobs = clamp(
        town.jobs + 0.06 * (town.economy - town.jobs) - (0.8 if town.health < 35 else 0.0)
    )
    if town.health < 35:
        town.population = max(42_000.0, town.population * 0.992)
    elif town.jobs > 60 and town.services > 55:
        town.population = min(56_000.0, town.population * 1.004)


def apply_delayed(town: Town) -> None:
    d = town.delayed
    town.bio = clamp(town.bio + d.pop("bio", 0.0))
    town.soil = clamp(town.soil + d.pop("soil", 0.0))
    town.buffer = clamp(town.buffer + d.pop("buffer", 0.0))
    town.air = clamp(town.air + d.pop("air", 0.0))
    town.economy = clamp(town.economy + d.pop("economy", 0.0))
    town.prep = clamp(town.prep + d.pop("prep", 0.0))
    town.green_energy = clamp(town.green_energy + d.pop("green_energy", 0.0), 0.0, 1.5)


def apply_allocations(town: Town, spend: Dict[str, float]) -> None:
    r = sat(spend["restoration"])
    p = sat(spend["pollution_control"])
    w = sat(spend["water"])
    e = sat(spend["energy"])
    a = sat(spend["agriculture"])
    i = sat(spend["industry"])
    n = sat(spend["infrastructure"])
    s = sat(spend["public_services"])

    r_eff = r * (1.0 + 0.05 * p)
    i_eff = i * (0.72 + 0.014 * town.energy + 0.012 * town.infra)
    a_eff = a * (0.68 + 0.007 * town.water_q)
    s_eff = s * (0.78 + 0.005 * town.fiscal)
    clean_shift = 1.0 if spend["energy"] >= spend["industry"] else 0.35

    town.air = clamp(town.air + 0.72 * r_eff + 0.58 * p - 0.32 * i_eff - 0.14 * e * town.dirty_energy)
    town.water_q = clamp(town.water_q + 0.92 * w + 0.40 * r_eff + 0.38 * p - 0.24 * a_eff * town.intensive_ag)
    town.soil = clamp(town.soil + 0.42 * r_eff + 0.50 * a_eff * (0.35 + town.regenerative_ag) - 0.20 * i_eff)
    town.bio = clamp(town.bio + 0.48 * r_eff + 0.22 * w - 0.26 * i_eff - 0.12 * a_eff * town.intensive_ag)
    town.pollution = clamp(
        town.pollution
        - 0.95 * p
        - 0.28 * r_eff
        - 0.28 * w
        + 0.48 * i_eff
        + 0.20 * e * town.dirty_energy
        - 0.22 * e * town.green_energy
    )

    town.delayed["bio"] = town.delayed.get("bio", 0.0) + 0.55 * r_eff
    town.delayed["soil"] = town.delayed.get("soil", 0.0) + 0.38 * r_eff
    town.delayed["buffer"] = town.delayed.get("buffer", 0.0) + 0.42 * r_eff + 0.18 * w
    town.delayed["air"] = town.delayed.get("air", 0.0) + 0.22 * r_eff
    town.delayed["economy"] = town.delayed.get("economy", 0.0) + 0.22 * i_eff + 0.10 * n
    town.delayed["prep"] = town.delayed.get("prep", 0.0) + 0.28 * n
    town.delayed["green_energy"] = town.delayed.get("green_energy", 0.0) + 0.04 * e * clean_shift

    town.health = clamp(town.health + 0.62 * s_eff + 0.34 * w + 0.20 * p + 0.12 * a_eff - 0.10 * i_eff)
    town.services = clamp(town.services + 0.78 * s_eff + 0.46 * n + 0.14 * w)
    town.jobs = clamp(
        town.jobs
        + 0.48 * i_eff
        + 0.40 * a_eff
        + 0.34 * s_eff
        + 0.20 * n
        - 0.08 * r_eff
    )

    town.economy = clamp(
        town.economy
        + 0.72 * i_eff
        + 0.36 * a_eff
        + 0.30 * e
        + 0.22 * n
        - 0.16 * p
        - 0.12 * r_eff
    )
    town.fiscal = clamp(
        town.fiscal
        + 0.24 * i_eff
        + 0.10 * town.economy / 18.0
        - 0.10 * s_eff
        - 0.05 * r_eff
    )
    town.energy = clamp(town.energy + 0.90 * e + 0.22 * n - 0.10 * i_eff)
    town.infra = clamp(town.infra + 0.98 * n + 0.20 * e + 0.12 * w)
    town.prep = clamp(town.prep + 0.58 * n + 0.48 * s_eff + 0.26 * w + 0.14 * e)
    town.buffer = clamp(town.buffer + 0.38 * r_eff + 0.34 * w + 0.22 * n - 0.16 * i_eff)

    town.dirty_energy = clamp(town.dirty_energy - 0.035 * e * clean_shift + 0.016 * i, 0.0, 1.5)
    town.green_energy = clamp(town.green_energy + 0.030 * e * clean_shift, 0.0, 1.5)
    town.intensive_ag = clamp(
        town.intensive_ag + 0.025 * (a if spend["agriculture"] > spend["restoration"] else -0.6 * a),
        0.0,
        1.2,
    )
    town.regenerative_ag = clamp(
        town.regenerative_ag + 0.025 * r + 0.012 * a * (spend["restoration"] > 80),
        0.0,
        1.2,
    )
    town.industrial_intensity = clamp(town.industrial_intensity + 0.030 * i - 0.014 * p, 0.1, 1.4)

    spent = max(spend.get("_spent", 0.0), 1.0)
    prod_share = (spend["industry"] + spend["energy"] + spend["agriculture"]) / spent
    env_share = (spend["restoration"] + spend["pollution_control"] + spend["water"]) / spent
    if prod_share < 0.16:
        town.economy = clamp(town.economy - 3.4)
        town.jobs = clamp(town.jobs - 2.0)
        town.fiscal = clamp(town.fiscal - 1.6)
    if env_share < 0.16:
        town.pollution = clamp(town.pollution + 3.2)
        town.bio = clamp(town.bio - 2.2)
        town.air = clamp(town.air - 1.6)


def apply_event(town: Town, round_no: int) -> float:
    """Published scenario pack A. Same event for every team; impact depends on state."""
    if round_no == 2:
        # Heat and water stress.
        damage = (
            10.0
            + 0.22 * (100.0 - town.water_q)
            + 0.14 * (100.0 - town.bio)
            + 0.18 * (100.0 - town.prep)
            - 0.10 * town.buffer
        )
        town.water_q = clamp(town.water_q - 0.18 * damage)
        town.health = clamp(town.health - 0.12 * damage)
        town.economy = clamp(town.economy - 0.08 * damage)
        town.buffer = clamp(town.buffer - 0.06 * damage)
    elif round_no == 3:
        # Commodity and supply-chain shock.
        damage = (
            8.0
            + 0.20 * town.industrial_intensity * 40.0
            + 0.16 * (100.0 - town.fiscal)
            + 0.10 * (100.0 - town.energy)
            - 0.12 * town.jobs
        )
        town.economy = clamp(town.economy - 0.16 * damage)
        town.fiscal = clamp(town.fiscal - 0.14 * damage)
        town.jobs = clamp(town.jobs - 0.10 * damage)
    elif round_no == 4:
        # Flood / runoff.
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
        # Contamination / public-health scare.
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


Allocations = Dict[str, float]
Strategy = Callable[[int, Town, float], Allocations]


def normalize_spend(raw: Dict[str, float], available: float) -> Dict[str, float]:
    values = {k: max(0.0, float(raw.get(k, 0.0))) for k in SECTORS}
    total = sum(values.values())
    if total <= 0:
        return {k: 0.0 for k in SECTORS} | {"_unspent_ratio": 1.0}
    if total > available:
        scale = available / total
        values = {k: v * scale for k, v in values.items()}
        total = available
    unspent = max(0.0, available - total)
    values["_unspent_ratio"] = unspent / available if available else 1.0
    values["_spent"] = total
    values["_unspent"] = unspent
    return values


def play(strategy: Strategy) -> Town:
    town = Town()
    for round_no in range(1, ROUNDS + 1):
        apply_drift(town)
        apply_delayed(town)
        revenue = income_for(town, round_no)
        available = town.reserve + revenue
        if available < 0:
            town.fiscal = clamp(town.fiscal - 8.0)
            town.services = clamp(town.services - 6.0)
            available = 0.0
        spend = normalize_spend(strategy(round_no, town, available), available)
        apply_allocations(town, spend)
        damage = apply_event(town, round_no)
        town.reserve = spend.get("_unspent", 0.0)
        p = pillars(town)
        town.pillar_history.append(p)
        town.score_history.append(snapshot_score(town))
        town.budget_history.append(
            {
                "round": round_no,
                "available": round(available, 1),
                "spent": round(spend.get("_spent", 0.0), 1),
                "reserve": round(town.reserve, 1),
                "damage": round(damage, 2),
                "snapshot": round(town.score_history[-1], 2),
            }
        )
    return town


def split(weights: Dict[str, float], available: float) -> Allocations:
    return {k: available * weights.get(k, 0.0) for k in SECTORS}


def eco_max(round_no: int, town: Town, available: float) -> Allocations:
    return split(
        {
            "restoration": 0.34,
            "pollution_control": 0.28,
            "water": 0.22,
            "energy": 0.04,
            "agriculture": 0.04,
            "industry": 0.00,
            "infrastructure": 0.04,
            "public_services": 0.04,
        },
        available,
    )


def industry_max(round_no: int, town: Town, available: float) -> Allocations:
    return split(
        {
            "restoration": 0.00,
            "pollution_control": 0.04,
            "water": 0.04,
            "energy": 0.22,
            "agriculture": 0.08,
            "industry": 0.42,
            "infrastructure": 0.14,
            "public_services": 0.06,
        },
        available,
    )


def welfare_max(round_no: int, town: Town, available: float) -> Allocations:
    return split(
        {
            "restoration": 0.06,
            "pollution_control": 0.08,
            "water": 0.16,
            "energy": 0.08,
            "agriculture": 0.12,
            "industry": 0.04,
            "infrastructure": 0.10,
            "public_services": 0.36,
        },
        available,
    )


def resilience_max(round_no: int, town: Town, available: float) -> Allocations:
    return split(
        {
            "restoration": 0.12,
            "pollution_control": 0.08,
            "water": 0.14,
            "energy": 0.14,
            "agriculture": 0.04,
            "industry": 0.04,
            "infrastructure": 0.30,
            "public_services": 0.14,
        },
        available,
    )


def balanced(round_no: int, town: Town, available: float) -> Allocations:
    return split({k: 0.125 for k in SECTORS}, available)


def restore_then_grow(round_no: int, town: Town, available: float) -> Allocations:
    if round_no <= 3:
        return split(
            {
                "restoration": 0.26,
                "pollution_control": 0.22,
                "water": 0.18,
                "energy": 0.08,
                "agriculture": 0.06,
                "industry": 0.04,
                "infrastructure": 0.10,
                "public_services": 0.06,
            },
            available,
        )
    return split(
        {
            "restoration": 0.10,
            "pollution_control": 0.10,
            "water": 0.10,
            "energy": 0.14,
            "agriculture": 0.12,
            "industry": 0.18,
            "infrastructure": 0.14,
            "public_services": 0.12,
        },
        available,
    )


def grow_then_restore(round_no: int, town: Town, available: float) -> Allocations:
    if round_no <= 3:
        return split(
            {
                "restoration": 0.04,
                "pollution_control": 0.06,
                "water": 0.08,
                "energy": 0.16,
                "agriculture": 0.12,
                "industry": 0.28,
                "infrastructure": 0.16,
                "public_services": 0.10,
            },
            available,
        )
    return split(
        {
            "restoration": 0.22,
            "pollution_control": 0.20,
            "water": 0.16,
            "energy": 0.08,
            "agriculture": 0.08,
            "industry": 0.06,
            "infrastructure": 0.10,
            "public_services": 0.10,
        },
        available,
    )


def adaptive_lowest_pillar(round_no: int, town: Town, available: float) -> Allocations:
    p = pillars(town)
    # Map pillars to the sectors that move them most.
    weights = {k: 0.07 for k in SECTORS}
    lowest = min(p, key=p.get)
    boost = {
        "ecology": {"restoration": 0.28, "pollution_control": 0.22, "water": 0.16},
        "welfare": {"public_services": 0.28, "water": 0.14, "agriculture": 0.12},
        "economy": {"industry": 0.22, "energy": 0.16, "agriculture": 0.12},
        "resilience": {"infrastructure": 0.26, "public_services": 0.12, "water": 0.12, "restoration": 0.10},
    }[lowest]
    for k, v in boost.items():
        weights[k] += v
    total = sum(weights.values())
    weights = {k: v / total for k, v in weights.items()}
    return split(weights, available)


def hoard(round_no: int, town: Town, available: float) -> Allocations:
    return split({k: 0.04 for k in SECTORS}, available)  # spends 32%, rest reserved


def starve_ecology(round_no: int, town: Town, available: float) -> Allocations:
    return split(
        {
            "restoration": 0.00,
            "pollution_control": 0.00,
            "water": 0.08,
            "energy": 0.18,
            "agriculture": 0.14,
            "industry": 0.28,
            "infrastructure": 0.16,
            "public_services": 0.16,
        },
        available,
    )


def starve_economy(round_no: int, town: Town, available: float) -> Allocations:
    return split(
        {
            "restoration": 0.22,
            "pollution_control": 0.18,
            "water": 0.16,
            "energy": 0.06,
            "agriculture": 0.08,
            "industry": 0.00,
            "infrastructure": 0.14,
            "public_services": 0.16,
        },
        available,
    )


def even_pair_ecology_economy(round_no: int, town: Town, available: float) -> Allocations:
    return split(
        {
            "restoration": 0.16,
            "pollution_control": 0.14,
            "water": 0.12,
            "energy": 0.12,
            "agriculture": 0.10,
            "industry": 0.14,
            "infrastructure": 0.12,
            "public_services": 0.10,
        },
        available,
    )


def green_industry(round_no: int, town: Town, available: float) -> Allocations:
    return split(
        {
            "restoration": 0.12,
            "pollution_control": 0.16,
            "water": 0.12,
            "energy": 0.16,
            "agriculture": 0.08,
            "industry": 0.12,
            "infrastructure": 0.14,
            "public_services": 0.10,
        },
        available,
    )


def prudent_buffer(round_no: int, town: Town, available: float) -> Allocations:
    keep = min(IDEAL_RESERVE, max(0.0, available - 520.0))
    spendable = max(0.0, available - keep)
    return split(
        {
            "restoration": 0.14,
            "pollution_control": 0.14,
            "water": 0.12,
            "energy": 0.12,
            "agriculture": 0.10,
            "industry": 0.10,
            "infrastructure": 0.16,
            "public_services": 0.12,
        },
        spendable,
    )


STRATEGIES: Dict[str, Strategy] = {
    "balanced": balanced,
    "adaptive_lowest_pillar": adaptive_lowest_pillar,
    "restore_then_grow": restore_then_grow,
    "grow_then_restore": grow_then_restore,
    "even_pair_ecology_economy": even_pair_ecology_economy,
    "green_industry": green_industry,
    "prudent_buffer": prudent_buffer,
    "eco_max": eco_max,
    "industry_max": industry_max,
    "welfare_max": welfare_max,
    "resilience_max": resilience_max,
    "starve_ecology": starve_ecology,
    "starve_economy": starve_economy,
    "hoard": hoard,
}


def summarise(name: str, town: Town) -> Dict[str, object]:
    p = pillars(town)
    return {
        "strategy": name,
        "score": final_score(town),
        "ecology": round(p["ecology"], 2),
        "welfare": round(p["welfare"], 2),
        "economy": round(p["economy"], 2),
        "resilience": round(p["resilience"], 2),
        "shock": round(shock_score(town), 2),
        "mean_damage": round(sum(town.shock_log) / max(len(town.shock_log), 1), 2),
        "reserve": round(town.reserve, 1),
        "history": town.budget_history,
        "pillar_path": [{k: round(v, 2) for k, v in row.items()} for row in town.pillar_history],
    }


def dominance_report(rows: Sequence[Dict[str, object]]) -> Dict[str, object]:
    ordered = sorted(rows, key=lambda r: -float(r["score"]))
    scores = [float(r["score"]) for r in ordered]
    top = ordered[0]
    second = ordered[1]
    gap = float(top["score"]) - float(second["score"])
    spread = scores[0] - scores[-1]
    # A strategy is dominant if it wins by a wide margin AND is a single-pillar dump.
    dump_names = {
        "eco_max",
        "industry_max",
        "welfare_max",
        "resilience_max",
        "hoard",
        "starve_ecology",
        "starve_economy",
    }
    mixed_names = {
        "balanced",
        "adaptive_lowest_pillar",
        "restore_then_grow",
        "grow_then_restore",
        "even_pair_ecology_economy",
        "green_industry",
        "prudent_buffer",
    }
    mixed_scores = [float(r["score"]) for r in ordered if r["strategy"] in mixed_names]
    dump_best = max(float(r["score"]) for r in ordered if r["strategy"] in dump_names)
    return {
        "winner": top["strategy"],
        "winner_score": top["score"],
        "runner_up": second["strategy"],
        "win_gap": round(gap, 2),
        "full_spread": round(spread, 2),
        "mixed_band": round(max(mixed_scores) - min(mixed_scores), 2),
        "best_dump": round(dump_best, 2),
        "mixed_beats_best_dump": min(mixed_scores) > dump_best,
        "no_dominant_strategy": gap < 6.0 and top["strategy"] in mixed_names,
        "ranking": [(r["strategy"], r["score"]) for r in ordered],
    }


def main() -> None:
    import sys

    rows = [summarise(name, play(fn)) for name, fn in STRATEGIES.items()]
    report = {
        "assumptions": {
            "model": "pedagogical game, not empirical science",
            "rounds": ROUNDS,
            "start_identical": True,
            "events": "scenario pack A, deterministic, state-scaled",
            "score": "0.58*final_snapshot + 0.27*mean_snapshot + 0.15*shock_absorption, minus pillar floor penalty",
            "pillar_weights": {"ecology": 0.28, "welfare": 0.24, "economy": 0.24, "resilience": 0.24},
            "floor": FLOOR,
            "ideal_reserve": IDEAL_RESERVE,
        },
        "results": rows,
        "dominance": dominance_report(rows),
    }
    if "--brief" in sys.argv:
        print(json.dumps({"dominance": report["dominance"], "pillars": [
            {k: r[k] for k in ("strategy", "score", "ecology", "welfare", "economy", "resilience", "shock", "reserve")}
            for r in rows
        ]}, indent=2))
        return
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
