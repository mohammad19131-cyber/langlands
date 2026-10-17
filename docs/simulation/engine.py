#!/usr/bin/env python3
"""Langlands R3 Python reference engine (Phase 1).

Pedagogical game model, not a scientific Earth-system model.
Canonical specs: docs/simulation-model.md, scoring-system.md,
interventions-catalogue.md, environmental-events.md, game-rules.md.

This file is the Phase 1 source of truth for later TypeScript comparison.
It does not overwrite score_lab.py or official_score.py.

Frozen contradiction resolutions (also in balance-report.md):
- Charge order: intervention starts (listed order), then sector spend, then reserve.
- Prerequisites/mutex use completed+building after this round's delayed landings,
  excluding this round's new starts (so GRID+COAL in one list rejects COAL).
- Maintenance begins the round after a start, including while still building.
- Ongoing effects begin the round after completion, not the completion round.
- Event multipliers apply only if the project is already completed.
- Mix '+' magnitudes below are documented assumptions, not extra bonuses.

Catalogue revision A-CAT-1.1 (py-ref-1.1.0): restoration/resilience/green-industry
effects, costs, delays and maintenance retuned so flagship projects can beat a
300-credit operating buffer. Scoring weights, floors, events and sat() are
unchanged. See interventions-catalogue.md and balance-report.md.
"""

from __future__ import annotations

import hashlib
import json
import math
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

ENGINE_VERSION = "py-ref-1.1.0"
ROUNDS = 6
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
STARTING_RESERVE = 220.0
IDEAL_RESERVE = 300.0
SAT_SCALE = 340.0
SAT_MAGNITUDE = 12.0
NEGLECT_SHARE = 0.16
EVENT_SCALE = 1.0  # sensitivity hook only; live value is 1.0
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
MAX_STARTS = 2

# Mix deltas for catalogue '+' fields (assumption A-MIX-1).
MIX_COAL_DIRTY_IMMEDIATE = 0.25
MIX_COAL_DIRTY_ONGOING = 0.05
MIX_RENEW_GREEN = 0.40
MIX_REGEN = 0.30
MIX_INTENSE_IMMEDIATE = 0.30
MIX_INTENSE_ONGOING = 0.05
MIX_FACTORIES_INTENSITY = 0.20
MIX_GREEN_INTENSITY = -0.15  # A-CAT-1.1: conversion lowers plant intensity

INDEX_FIELDS = (
    "air",
    "water_q",
    "soil",
    "bio",
    "pollution",
    "health",
    "services",
    "jobs",
    "economy",
    "fiscal",
    "energy",
    "infra",
    "prep",
    "buffer",
)


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def sat(spend: float, scale: float | None = None, mag: float | None = None) -> float:
    use_scale = SAT_SCALE if scale is None else scale
    use_mag = SAT_MAGNITUDE if mag is None else mag
    return use_mag * (1.0 - math.exp(-max(spend, 0.0) / use_scale))


def reserve_score(reserve: float) -> float:
    return 100.0 * math.exp(-((reserve - IDEAL_RESERVE) ** 2) / (2.0 * 160.0 ** 2))


def apply_field(town: "Town", key: str, delta: float) -> None:
    if key == "dirty_energy":
        town.dirty_energy = clamp(town.dirty_energy + delta, 0.0, 1.5)
    elif key == "green_energy":
        town.green_energy = clamp(town.green_energy + delta, 0.0, 1.5)
    elif key == "intensive_ag":
        town.intensive_ag = clamp(town.intensive_ag + delta, 0.0, 1.2)
    elif key == "regenerative_ag":
        town.regenerative_ag = clamp(town.regenerative_ag + delta, 0.0, 1.2)
    elif key == "industrial_intensity":
        town.industrial_intensity = clamp(town.industrial_intensity + delta, 0.1, 1.4)
    elif key in INDEX_FIELDS:
        setattr(town, key, clamp(getattr(town, key) + delta))
    else:
        raise KeyError(f"unknown town field {key}")


def apply_deltas(town: "Town", deltas: Mapping[str, float]) -> None:
    for key, delta in deltas.items():
        apply_field(town, key, delta)


@dataclass
class Project:
    code: str
    name: str
    sector: str
    cost: int
    build_rounds: int
    maintenance: int
    prerequisites: Tuple[str, ...] = ()
    mutex_group: Optional[str] = None
    immediate: Dict[str, float] = field(default_factory=dict)
    delayed: Dict[int, Dict[str, float]] = field(default_factory=dict)
    ongoing: Dict[str, float] = field(default_factory=dict)
    event_mult: Dict[str, float] = field(default_factory=dict)


def _catalogue() -> Dict[str, Project]:
    items = [
        Project(
            "WETLAND",
            "Wetland restoration",
            "restoration",
            280,
            1,
            6,
            delayed={1: {"water_q": 7, "bio": 10, "soil": 3, "buffer": 8}},
            ongoing={"water_q": 0.35, "bio": 0.30, "buffer": 0.20},
            event_mult={"FLOOD": 0.85},
        ),
        Project(
            "REFOREST",
            "Reforestation",
            "restoration",
            280,
            2,
            6,
            delayed={1: {"air": 5}, 2: {"bio": 11, "soil": 6, "buffer": 6}},
            ongoing={"air": 0.25, "bio": 0.25, "soil": 0.15},
        ),
        Project(
            "RIVER",
            "River cleanup",
            "restoration",
            240,
            0,
            6,
            immediate={"water_q": 5, "pollution": -4},
            ongoing={"pollution": -0.55},
        ),
        Project(
            "EMISSIONS",
            "Industrial emissions control",
            "pollution_control",
            260,
            1,
            10,
            delayed={1: {"pollution": -8, "air": 4}},
            ongoing={"pollution": -0.9, "economy": -0.2},
        ),
        Project(
            "WASTEWATER",
            "Wastewater upgrade",
            "pollution_control",
            300,
            1,
            8,
            delayed={1: {"water_q": 7, "pollution": -7, "health": 5}},
            event_mult={"CONTAMINATION": 0.90},
        ),
        Project(
            "WATER_TREAT",
            "Emergency water treatment",
            "water",
            200,
            0,
            10,
            immediate={"water_q": 6, "health": 2},
            event_mult={"DROUGHT": 0.90},
        ),
        Project(
            "GRID",
            "Grid repairs",
            "energy",
            200,
            0,
            8,
            immediate={"energy": 6, "infra": 2},
        ),
        Project(
            "COAL",
            "Emergency thermal restart",
            "energy",
            280,
            0,
            18,
            prerequisites=("GRID",),
            mutex_group="ENERGY_BASELOAD",
            immediate={
                "energy": 8,
                "economy": 4,
                "pollution": 7,
                "air": -4,
                "dirty_energy": MIX_COAL_DIRTY_IMMEDIATE,
            },
            ongoing={"dirty_energy": MIX_COAL_DIRTY_ONGOING, "pollution": 0.8},
        ),
        Project(
            "RENEWABLES",
            "Wind and solar park",
            "energy",
            360,
            2,
            10,
            prerequisites=("GRID",),
            mutex_group="ENERGY_BASELOAD",
            delayed={2: {"energy": 7, "pollution": -3, "buffer": 2, "green_energy": MIX_RENEW_GREEN}},
        ),
        Project(
            "REGEN_AG",
            "Regenerative farming",
            "agriculture",
            260,
            1,
            9,
            mutex_group="AGRI_PUSH",
            immediate={"regenerative_ag": MIX_REGEN},
            delayed={1: {"soil": 5, "bio": 3, "economy": 2}},
        ),
        Project(
            "INTENSE_AG",
            "Intensive yield push",
            "agriculture",
            240,
            0,
            11,
            mutex_group="AGRI_PUSH",
            immediate={
                "economy": 5,
                "jobs": 4,
                "soil": -3,
                "water_q": -3,
                "pollution": 3,
                "intensive_ag": MIX_INTENSE_IMMEDIATE,
            },
            ongoing={"intensive_ag": MIX_INTENSE_ONGOING},
        ),
        Project(
            "FACTORIES",
            "Repair factories",
            "industry",
            240,
            1,
            12,
            prerequisites=("GRID",),
            delayed={
                1: {
                    "economy": 5,
                    "jobs": 4,
                    "pollution": 2,
                    "industrial_intensity": MIX_FACTORIES_INTENSITY,
                }
            },
        ),
        Project(
            "GREEN_MFG",
            "Green manufacturing conversion",
            "industry",
            280,
            1,
            10,
            prerequisites=("EMISSIONS", "FACTORIES"),
            delayed={
                1: {
                    "economy": 6,
                    "pollution": -10,
                    "jobs": 4,
                    "air": 4,
                    "industrial_intensity": MIX_GREEN_INTENSITY,
                }
            },
            ongoing={"pollution": -0.70, "economy": 0.30},
            event_mult={"CONTAMINATION": 0.90},
        ),
        Project(
            "FLOOD_WALL",
            "Flood defences",
            "infrastructure",
            300,
            1,
            8,
            immediate={"infra": 5, "prep": 6},
            delayed={1: {"buffer": 7}},
            event_mult={"FLOOD": 0.75},
        ),
        Project(
            "CLINICS",
            "Clinics and emergency services",
            "public_services",
            240,
            0,
            12,
            immediate={"health": 6, "prep": 3},
            ongoing={"health": 0.4},
            event_mult={"CONTAMINATION": 0.85},
        ),
    ]
    return {p.code: p for p in items}


CATALOGUE: Dict[str, Project] = _catalogue()
assert len(CATALOGUE) == 15


@dataclass
class PendingEffect:
    land_round: int
    deltas: Dict[str, float]
    complete_code: Optional[str] = None


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
    dirty_energy: float = 1.0
    green_energy: float = 0.0
    intensive_ag: float = 0.4
    regenerative_ag: float = 0.1
    industrial_intensity: float = 0.45
    delayed: Dict[str, float] = field(default_factory=dict)
    pending: List[PendingEffect] = field(default_factory=list)
    started: Dict[str, int] = field(default_factory=dict)  # code -> start round
    completed: Dict[str, int] = field(default_factory=dict)  # code -> complete round
    shock_log: List[float] = field(default_factory=list)
    dropped_log: List[Dict[str, str]] = field(default_factory=list)


@dataclass
class Submission:
    allocations: Dict[str, float] = field(default_factory=dict)
    project_starts: List[str] = field(default_factory=list)


@dataclass
class RoundResult:
    round_index: int
    income: float
    maintenance: float
    available: float
    project_cost: float
    accepted_starts: List[str]
    dropped: List[Dict[str, str]]
    sector_spend: Dict[str, float]
    unspent: float
    event_code: Optional[str]
    damage: float
    snapshot: Dict[str, float]


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


def maintenance_due(town: Town, round_no: int) -> float:
    total = 0.0
    for code, started_round in town.started.items():
        if started_round < round_no:
            total += CATALOGUE[code].maintenance
    return total


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


def apply_operating_delayed(town: Town) -> None:
    d = town.delayed
    apply_field(town, "bio", d.pop("bio", 0.0))
    apply_field(town, "soil", d.pop("soil", 0.0))
    apply_field(town, "buffer", d.pop("buffer", 0.0))
    apply_field(town, "air", d.pop("air", 0.0))
    apply_field(town, "economy", d.pop("economy", 0.0))
    apply_field(town, "prep", d.pop("prep", 0.0))
    apply_field(town, "green_energy", d.pop("green_energy", 0.0))


def apply_pending_projects(town: Town, round_no: int) -> None:
    remaining: List[PendingEffect] = []
    for item in town.pending:
        if item.land_round == round_no:
            apply_deltas(town, item.deltas)
            if item.complete_code:
                town.completed[item.complete_code] = round_no
        else:
            remaining.append(item)
    town.pending = remaining


def apply_ongoing(town: Town, round_no: int) -> None:
    for code, completed_round in town.completed.items():
        if completed_round < round_no:
            apply_deltas(town, CATALOGUE[code].ongoing)


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
    town.water_q = clamp(
        town.water_q + 0.92 * w + 0.40 * r_eff + 0.38 * p - 0.24 * a_eff * town.intensive_ag
    )
    town.soil = clamp(
        town.soil + 0.42 * r_eff + 0.50 * a_eff * (0.35 + town.regenerative_ag) - 0.20 * i_eff
    )
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
        town.jobs + 0.48 * i_eff + 0.40 * a_eff + 0.34 * s_eff + 0.20 * n - 0.08 * r_eff
    )
    town.economy = clamp(
        town.economy + 0.72 * i_eff + 0.36 * a_eff + 0.30 * e + 0.22 * n - 0.16 * p - 0.12 * r_eff
    )
    town.fiscal = clamp(
        town.fiscal + 0.24 * i_eff + 0.10 * town.economy / 18.0 - 0.10 * s_eff - 0.05 * r_eff
    )
    town.energy = clamp(town.energy + 0.90 * e + 0.22 * n - 0.10 * i_eff)
    town.infra = clamp(town.infra + 0.98 * n + 0.20 * e + 0.12 * w)
    town.prep = clamp(town.prep + 0.58 * n + 0.48 * s_eff + 0.26 * w + 0.14 * e)
    town.buffer = clamp(town.buffer + 0.38 * r_eff + 0.34 * w + 0.22 * n - 0.16 * i_eff)

    town.dirty_energy = clamp(town.dirty_energy - 0.035 * e * clean_shift + 0.016 * i, 0.0, 1.5)
    town.green_energy = clamp(town.green_energy + 0.030 * e * clean_shift, 0.0, 1.5)
    town.intensive_ag = clamp(
        town.intensive_ag
        + 0.025 * (a if spend["agriculture"] > spend["restoration"] else -0.6 * a),
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
    if prod_share < NEGLECT_SHARE:
        town.economy = clamp(town.economy - 3.4)
        town.jobs = clamp(town.jobs - 2.0)
        town.fiscal = clamp(town.fiscal - 1.6)
    if env_share < NEGLECT_SHARE:
        town.pollution = clamp(town.pollution + 3.2)
        town.bio = clamp(town.bio - 2.2)
        town.air = clamp(town.air - 1.6)


def event_multiplier(town: Town, event_code: str) -> float:
    mult = 1.0
    for code in town.completed:
        mult *= CATALOGUE[code].event_mult.get(event_code, 1.0)
    return mult


def apply_event_pack_a(town: Town, round_no: int) -> Tuple[Optional[str], float]:
    if round_no == 2:
        code = "HEATWAVE"
        damage = (
            10.0
            + 0.20 * (100.0 - town.water_q)
            + 0.16 * (100.0 - town.bio)
            + 0.18 * (100.0 - town.prep)
            - 0.10 * town.buffer
        )
        damage = max(0.0, damage) * event_multiplier(town, code) * EVENT_SCALE
        town.water_q = clamp(town.water_q - 0.16 * damage)
        town.health = clamp(town.health - 0.14 * damage)
        town.energy = clamp(town.energy - 0.08 * damage)
        town.buffer = clamp(town.buffer - 0.06 * damage)
    elif round_no == 3:
        code = "DROUGHT"
        damage = (
            11.0
            + 0.24 * (100.0 - town.water_q)
            + 0.16 * (100.0 - town.soil)
            + 0.12 * (100.0 - town.prep)
            - 0.08 * town.buffer
        )
        damage = max(0.0, damage) * event_multiplier(town, code) * EVENT_SCALE
        town.water_q = clamp(town.water_q - 0.20 * damage)
        town.soil = clamp(town.soil - 0.12 * damage)
        town.economy = clamp(town.economy - 0.10 * damage)
        town.bio = clamp(town.bio - 0.08 * damage)
        town.jobs = clamp(town.jobs - 0.06 * damage)
    elif round_no == 4:
        code = "FLOOD"
        damage = (
            12.0
            + 0.20 * (100.0 - town.infra)
            + 0.18 * (100.0 - town.buffer)
            + 0.12 * (100.0 - town.soil)
            + 0.10 * (town.pollution - 40.0)
            - 0.10 * town.prep
        )
        damage = max(0.0, damage) * event_multiplier(town, code) * EVENT_SCALE
        town.infra = clamp(town.infra - 0.16 * damage)
        town.soil = clamp(town.soil - 0.10 * damage)
        town.water_q = clamp(town.water_q - 0.14 * damage)
        town.services = clamp(town.services - 0.08 * damage)
        town.economy = clamp(town.economy - 0.07 * damage)
    elif round_no == 5:
        code = "CONTAMINATION"
        damage = (
            9.0
            + 0.24 * (town.pollution - 35.0)
            + 0.16 * (100.0 - town.water_q)
            + 0.12 * (100.0 - town.health)
            - 0.10 * town.prep
        )
        damage = max(0.0, damage) * event_multiplier(town, code) * EVENT_SCALE
        town.health = clamp(town.health - 0.18 * damage)
        town.jobs = clamp(town.jobs - 0.08 * damage)
        town.fiscal = clamp(town.fiscal - 0.06 * damage)
        town.air = clamp(town.air - 0.05 * damage)
    else:
        code = None
        damage = 0.0
    town.shock_log.append(damage)
    return code, damage


def ecology_index(town: Town) -> float:
    return (town.air + town.water_q + town.soil + town.bio + (100.0 - town.pollution)) / 5.0


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


def saturation_waste(spend: Mapping[str, float]) -> float:
    spent = max(float(spend.get("_spent", 0.0)), 1.0)
    waste = sum(max(0.0, float(spend.get(k, 0.0)) - 520.0) for k in SECTORS)
    return waste / spent


def efficiency_index(town: Town, spend: Mapping[str, float]) -> float:
    discipline = reserve_score(town.reserve)
    waste_score = 100.0 * (1.0 - saturation_waste(spend))
    useful = 0.0
    mass = 0.0
    for k in SECTORS:
        s = float(spend.get(k, 0.0))
        if s <= 0:
            continue
        useful += s * math.exp(-s / SAT_SCALE)
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


def snapshot(town: Town, spend: Mapping[str, float]) -> Dict[str, float]:
    cats = {
        "ecology": ecology_index(town),
        "welfare": welfare_index(town),
        "economy": economy_index(town),
        "resilience": resilience_index(town),
        "efficiency": efficiency_index(town, spend),
    }
    raw = sum(WEIGHTS[k] * cats[k] for k in WEIGHTS)
    penalty = dysfunction_penalty(town)
    cats["penalty"] = penalty
    cats["snapshot"] = clamp(raw - penalty)
    return cats


def final_score(snapshots: Sequence[float]) -> float:
    if not snapshots:
        return 0.0
    last = snapshots[-1]
    mean = sum(snapshots) / len(snapshots)
    return round(clamp(0.62 * last + 0.38 * mean), 2)


def mean_event_damage(town: Town) -> float:
    events = [d for d in town.shock_log if d > 0]
    if not events:
        return 0.0
    return sum(events) / len(events)


def tie_break_tuple(town: Town, snapshots: Sequence[float], seat: int) -> Tuple[float, float, float, int]:
    """Sort descending via: (-score, -E, mean_damage, seat)."""
    return (-final_score(snapshots), -ecology_index(town), mean_event_damage(town), seat)


def normalize_spend(raw: Mapping[str, float], available: float) -> Dict[str, float]:
    values = {k: max(0.0, float(raw.get(k, 0.0))) for k in SECTORS}
    total = sum(values.values())
    if available <= 0 or total <= 0:
        out = {k: 0.0 for k in SECTORS}
        out["_unspent_ratio"] = 1.0
        out["_spent"] = 0.0
        out["_unspent"] = max(0.0, available)
        return out
    if total > available:
        scale = available / total
        values = {k: v * scale for k, v in values.items()}
        total = available
    unspent = max(0.0, available - total)
    values["_unspent_ratio"] = unspent / available
    values["_spent"] = total
    values["_unspent"] = unspent
    return values


def _mutex_taken(town: Town, group: str, extra: Iterable[str] = ()) -> bool:
    owned = set(town.started) | set(extra)
    for code in owned:
        if CATALOGUE[code].mutex_group == group:
            return True
    return False


def resolve_starts(
    town: Town, starts: Sequence[str], available: float
) -> Tuple[List[str], List[Dict[str, str]], float]:
    dropped: List[Dict[str, str]] = []
    accepted: List[str] = []
    remaining = available
    seen = set()
    for code in list(starts):
        if len(accepted) >= MAX_STARTS:
            dropped.append({"code": code, "reason": "max_starts"})
            continue
        if code in seen:
            dropped.append({"code": code, "reason": "duplicate"})
            continue
        seen.add(code)
        proj = CATALOGUE.get(code)
        if proj is None:
            dropped.append({"code": code, "reason": "unknown"})
            continue
        if code in town.started:
            dropped.append({"code": code, "reason": "already_started"})
            continue
        missing = [p for p in proj.prerequisites if p not in town.completed]
        if missing:
            dropped.append({"code": code, "reason": "prereq:" + ",".join(missing)})
            continue
        if proj.mutex_group and _mutex_taken(town, proj.mutex_group, accepted):
            dropped.append({"code": code, "reason": "mutex"})
            continue
        if proj.cost > remaining + 1e-9:
            dropped.append({"code": code, "reason": "budget"})
            continue
        remaining -= proj.cost
        accepted.append(code)
    return accepted, dropped, remaining


def start_projects(town: Town, codes: Sequence[str], round_no: int) -> float:
    cost = 0.0
    for code in codes:
        proj = CATALOGUE[code]
        cost += proj.cost
        town.started[code] = round_no
        apply_deltas(town, proj.immediate)
        if proj.build_rounds == 0:
            town.completed[code] = round_no
        max_delay = max(proj.delayed) if proj.delayed else proj.build_rounds
        if proj.build_rounds > 0 and not proj.delayed:
            town.pending.append(
                PendingEffect(round_no + proj.build_rounds, {}, complete_code=code)
            )
        for delay, deltas in proj.delayed.items():
            complete = delay == max_delay and delay == proj.build_rounds
            town.pending.append(
                PendingEffect(
                    round_no + delay,
                    dict(deltas),
                    complete_code=code if complete else None,
                )
            )
        if proj.build_rounds > 0 and proj.build_rounds not in proj.delayed:
            town.pending.append(
                PendingEffect(round_no + proj.build_rounds, {}, complete_code=code)
            )
    return cost


def empty_spend() -> Dict[str, float]:
    return normalize_spend({}, 0.0)


def step_round(town: Town, round_no: int, submission: Optional[Submission]) -> RoundResult:
    sub = submission or Submission()
    apply_drift(town)
    apply_pending_projects(town, round_no)
    apply_operating_delayed(town)
    apply_ongoing(town, round_no)

    income = income_for(town, round_no)
    maint = maintenance_due(town, round_no)
    available = max(0.0, town.reserve + income - maint)

    accepted, dropped, after_projects = resolve_starts(town, sub.project_starts, available)
    spend = normalize_spend(sub.allocations, after_projects)
    apply_allocations(town, spend)
    project_cost = start_projects(town, accepted, round_no)
    town.dropped_log.extend(dropped)

    event_code, damage = apply_event_pack_a(town, round_no)
    town.reserve = spend["_unspent"]
    snap = snapshot(town, spend)
    return RoundResult(
        round_index=round_no,
        income=income,
        maintenance=maint,
        available=available,
        project_cost=project_cost,
        accepted_starts=list(accepted),
        dropped=dropped,
        sector_spend=spend,
        unspent=spend["_unspent"],
        event_code=event_code,
        damage=damage,
        snapshot=snap,
    )


def canonical_state(town: Town) -> Dict[str, Any]:
    return {
        "engine_version": ENGINE_VERSION,
        "indices": {k: round(getattr(town, k), 10) for k in INDEX_FIELDS},
        "reserve": round(town.reserve, 10),
        "population": round(town.population, 10),
        "mix": {
            "dirty_energy": round(town.dirty_energy, 10),
            "green_energy": round(town.green_energy, 10),
            "intensive_ag": round(town.intensive_ag, 10),
            "regenerative_ag": round(town.regenerative_ag, 10),
            "industrial_intensity": round(town.industrial_intensity, 10),
        },
        "started": dict(sorted(town.started.items())),
        "completed": dict(sorted(town.completed.items())),
        "shock_log": [round(x, 10) for x in town.shock_log],
    }


def state_hash(town: Town) -> str:
    blob = json.dumps(canonical_state(town), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def play(submissions: Optional[Sequence[Optional[Submission]]] = None) -> Dict[str, Any]:
    """Play six rounds. None or missing submissions are default holds."""
    town = Town()
    rounds: List[RoundResult] = []
    snaps: List[float] = []
    planned = list(submissions or [])
    while len(planned) < ROUNDS:
        planned.append(None)
    for round_no in range(1, ROUNDS + 1):
        result = step_round(town, round_no, planned[round_no - 1])
        rounds.append(result)
        snaps.append(result.snapshot["snapshot"])
    last = rounds[-1].snapshot
    return {
        "engine_version": ENGINE_VERSION,
        "score": final_score(snaps),
        "snaps": [round(s, 6) for s in snaps],
        "categories": {k: round(last[k], 6) for k in last},
        "ecology": ecology_index(town),
        "mean_damage": mean_event_damage(town),
        "reserve": town.reserve,
        "population": town.population,
        "started": dict(town.started),
        "completed": dict(town.completed),
        "dropped": list(town.dropped_log),
        "shock_log": list(town.shock_log),
        "hash": state_hash(town),
        "rounds": rounds,
        "town": town,
    }


def play_weights(
    weights: Mapping[str, float],
    keep: float = 0.0,
    projects_by_round: Optional[Sequence[Sequence[str]]] = None,
) -> Dict[str, Any]:
    """Helper: constant sector shares of (available - keep), plus optional starts."""
    subs: List[Submission] = []
    town_probe = Town()
    # We cannot know available without playing; play interactively.
    town = Town()
    planned = list(projects_by_round or [()] * ROUNDS)
    while len(planned) < ROUNDS:
        planned.append(())
    snaps: List[float] = []
    rounds: List[RoundResult] = []
    for round_no in range(1, ROUNDS + 1):
        # Peek available the same way step_round computes it, without mutating twice.
        probe = deepcopy(town)
        apply_drift(probe)
        apply_pending_projects(probe, round_no)
        apply_operating_delayed(probe)
        apply_ongoing(probe, round_no)
        income = income_for(probe, round_no)
        maint = maintenance_due(probe, round_no)
        available = max(0.0, probe.reserve + income - maint)
        held = min(max(0.0, keep), available)
        spendable = max(0.0, available - held)
        alloc = {k: spendable * float(weights.get(k, 0.0)) for k in SECTORS}
        sub = Submission(alloc, list(planned[round_no - 1]))
        result = step_round(town, round_no, sub)
        rounds.append(result)
        snaps.append(result.snapshot["snapshot"])
        town_probe = town
    last = rounds[-1].snapshot
    return {
        "engine_version": ENGINE_VERSION,
        "score": final_score(snaps),
        "snaps": [round(s, 6) for s in snaps],
        "categories": {k: round(last[k], 6) for k in last},
        "ecology": ecology_index(town),
        "mean_damage": mean_event_damage(town),
        "reserve": town.reserve,
        "population": town.population,
        "started": dict(town.started),
        "completed": dict(town.completed),
        "dropped": list(town.dropped_log),
        "shock_log": list(town.shock_log),
        "hash": state_hash(town),
        "rounds": rounds,
        "town": town,
        "probe": town_probe,
    }


def split_all(available: float, weights: Mapping[str, float]) -> Dict[str, float]:
    return {k: available * float(weights.get(k, 0.0)) for k in SECTORS}


EQUAL = {k: 0.125 for k in SECTORS}
GREEN = {
    "restoration": 0.12,
    "pollution_control": 0.16,
    "water": 0.12,
    "energy": 0.16,
    "agriculture": 0.08,
    "industry": 0.12,
    "infrastructure": 0.14,
    "public_services": 0.10,
}
RESTORE_EARLY = {
    "restoration": 0.26,
    "pollution_control": 0.22,
    "water": 0.18,
    "energy": 0.08,
    "agriculture": 0.06,
    "industry": 0.04,
    "infrastructure": 0.10,
    "public_services": 0.06,
}
GROW_EARLY = {
    "restoration": 0.04,
    "pollution_control": 0.06,
    "water": 0.08,
    "energy": 0.16,
    "agriculture": 0.12,
    "industry": 0.28,
    "infrastructure": 0.16,
    "public_services": 0.10,
}
RESTORE_LATE = {
    "restoration": 0.22,
    "pollution_control": 0.20,
    "water": 0.16,
    "energy": 0.08,
    "agriculture": 0.08,
    "industry": 0.06,
    "infrastructure": 0.10,
    "public_services": 0.10,
}
GROW_LATE = {
    "restoration": 0.10,
    "pollution_control": 0.10,
    "water": 0.10,
    "energy": 0.14,
    "agriculture": 0.12,
    "industry": 0.18,
    "infrastructure": 0.14,
    "public_services": 0.12,
}


def play_interactive(choose) -> Dict[str, Any]:
    """choose(round_no, town_after_upkeep, available) -> Submission."""
    town = Town()
    rounds: List[RoundResult] = []
    snaps: List[float] = []
    for round_no in range(1, ROUNDS + 1):
        probe = deepcopy(town)
        apply_drift(probe)
        apply_pending_projects(probe, round_no)
        apply_operating_delayed(probe)
        apply_ongoing(probe, round_no)
        income = income_for(probe, round_no)
        maint = maintenance_due(probe, round_no)
        available = max(0.0, probe.reserve + income - maint)
        sub = choose(round_no, probe, available)
        result = step_round(town, round_no, sub)
        rounds.append(result)
        snaps.append(result.snapshot["snapshot"])
    last = rounds[-1].snapshot
    return {
        "engine_version": ENGINE_VERSION,
        "score": final_score(snaps),
        "snaps": [round(s, 6) for s in snaps],
        "categories": {k: round(last[k], 6) for k in last},
        "ecology": ecology_index(town),
        "mean_damage": mean_event_damage(town),
        "reserve": town.reserve,
        "population": town.population,
        "started": dict(town.started),
        "completed": dict(town.completed),
        "dropped": list(town.dropped_log),
        "shock_log": list(town.shock_log),
        "hash": state_hash(town),
        "rounds": rounds,
        "town": town,
    }
