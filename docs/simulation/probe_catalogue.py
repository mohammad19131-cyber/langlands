#!/usr/bin/env python3
"""In-memory catalogue probes. Does not write engine.py."""

from __future__ import annotations

from copy import deepcopy

import engine as E
from engine import CATALOGUE, SECTORS, Submission, play_interactive

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
RESTORE_E = {
    "restoration": 0.26,
    "pollution_control": 0.22,
    "water": 0.18,
    "energy": 0.08,
    "agriculture": 0.06,
    "industry": 0.04,
    "infrastructure": 0.10,
    "public_services": 0.06,
}
GROW_L = {
    "restoration": 0.10,
    "pollution_control": 0.10,
    "water": 0.10,
    "energy": 0.14,
    "agriculture": 0.12,
    "industry": 0.18,
    "infrastructure": 0.14,
    "public_services": 0.12,
}
WELFARE = {
    "restoration": 0.06,
    "pollution_control": 0.08,
    "water": 0.16,
    "energy": 0.08,
    "agriculture": 0.12,
    "industry": 0.04,
    "infrastructure": 0.10,
    "public_services": 0.36,
}
INDUSTRY = {
    "restoration": 0.00,
    "pollution_control": 0.04,
    "water": 0.04,
    "energy": 0.22,
    "agriculture": 0.08,
    "industry": 0.42,
    "infrastructure": 0.14,
    "public_services": 0.06,
}


def make_sub(weights, available, starts, min_operating=520.0):
    cost = sum(CATALOGUE[c].cost for c in starts)
    leftover = max(0.0, available - cost)
    keep = min(E.IDEAL_RESERVE, max(0.0, leftover - min_operating))
    spendable = leftover - keep
    return Submission({k: spendable * weights[k] for k in SECTORS}, list(starts))


def legal(town, code, starts):
    if code in town.started or code in starts:
        return False
    p = CATALOGUE[code]
    if any(x not in town.completed for x in p.prerequisites):
        return False
    if p.mutex_group and E._mutex_taken(town, p.mutex_group, starts):
        return False
    return True


def runner(w_fn, plan_fn):
    def choose(n, t, a):
        starts = []
        remaining = a
        for code in plan_fn(n, t):
            if len(starts) >= 2:
                break
            if not legal(t, code, starts):
                continue
            if CATALOGUE[code].cost > remaining:
                continue
            starts.append(code)
            remaining -= CATALOGUE[code].cost
        return make_sub(w_fn(n, t), a, starts)

    return choose


def rtg(n, t):
    return RESTORE_E if n <= 3 else GROW_L


def score(name, w_fn, plan_fn):
    r = play_interactive(runner(w_fn, plan_fn))
    last = r["categories"]
    return {
        "name": name,
        "score": r["score"],
        "E": round(last["ecology"], 2),
        "W": round(last["welfare"], 2),
        "Y": round(last["economy"], 2),
        "R": round(last["resilience"], 2),
        "F": round(last["efficiency"], 2),
        "pen": round(last["penalty"], 2),
        "dmg": round(r["mean_damage"], 2),
        "done": sorted(r["completed"]),
    }


STRATS = [
    ("prudent_buffer", lambda n, t: PRUDENT_W, lambda n, t: []),
    ("rtg_only", rtg, lambda n, t: []),
    ("green_only", lambda n, t: GREEN, lambda n, t: []),
    ("welfare_only", lambda n, t: WELFARE, lambda n, t: []),
    ("prudent+WETLAND", lambda n, t: PRUDENT_W, lambda n, t: ["WETLAND"] if n == 1 else []),
    ("rtg+WETLAND", rtg, lambda n, t: ["WETLAND"] if n == 1 else []),
    ("rtg+habitat", rtg, lambda n, t: ["WETLAND", "REFOREST"] if n == 1 else []),
    ("rtg+WETLAND+RIVER", rtg, lambda n, t: ["WETLAND", "RIVER"] if n == 1 else []),
    ("prudent+flood", lambda n, t: PRUDENT_W, lambda n, t: ["WETLAND", "FLOOD_WALL"] if n == 1 else []),
    ("prudent+WASTEWATER", lambda n, t: PRUDENT_W, lambda n, t: ["WASTEWATER"] if n == 1 else []),
    ("rtg+WASTEWATER", rtg, lambda n, t: ["WASTEWATER"] if n == 1 else []),
    (
        "green_mfg_path",
        lambda n, t: GREEN,
        lambda n, t: {1: ["GRID", "EMISSIONS"], 2: ["FACTORIES"], 3: ["GREEN_MFG"]}.get(n, []),
    ),
    (
        "green_mfg+renew",
        lambda n, t: GREEN,
        lambda n, t: {
            1: ["GRID", "EMISSIONS"],
            2: ["FACTORIES"],
            3: ["GREEN_MFG"],
            4: ["RENEWABLES"],
        }.get(n, []),
    ),
    ("coal_rush", lambda n, t: INDUSTRY, lambda n, t: {1: ["GRID"], 2: ["COAL"]}.get(n, [])),
    ("prudent+RIVER", lambda n, t: PRUDENT_W, lambda n, t: ["RIVER"] if n == 1 else []),
    ("prudent+WATER_TREAT", lambda n, t: PRUDENT_W, lambda n, t: ["WATER_TREAT"] if n == 1 else []),
    ("prudent+CLINICS", lambda n, t: PRUDENT_W, lambda n, t: ["CLINICS"] if n == 1 else []),
    (
        "reactive_flood",
        lambda n, t: PRUDENT_W,
        lambda n, t: ["FLOOD_WALL"] if n == 3 else (["WATER_TREAT"] if n == 2 else []),
    ),
]


def apply_patch(patch: dict) -> None:
    for code, fields in patch.items():
        proj = CATALOGUE[code]
        for k, v in fields.items():
            setattr(proj, k, v)


def snapshot_catalogue():
    return {
        code: {
            "cost": p.cost,
            "build_rounds": p.build_rounds,
            "maintenance": p.maintenance,
            "immediate": deepcopy(p.immediate),
            "delayed": deepcopy(p.delayed),
            "ongoing": deepcopy(p.ongoing),
            "event_mult": deepcopy(p.event_mult),
        }
        for code, p in CATALOGUE.items()
    }


def restore_catalogue(snap) -> None:
    for code, fields in snap.items():
        apply_patch({code: fields})


def run_all():
    rows = [score(*s) for s in STRATS]
    rows.sort(key=lambda r: -r["score"])
    return rows


def main():
    base_snap = snapshot_catalogue()
    print("=== BASELINE (current catalogue, buffer-aware spend) ===")
    for r in run_all():
        print(f"{r['score']:6.2f} {r['name']:22} E={r['E']:5.1f} W={r['W']:5.1f} Y={r['Y']:5.1f} R={r['R']:5.1f} F={r['F']:5.1f} {r['done']}")

    patches = {
        "v1_habitat_effects_maint": {
            "WETLAND": {
                "maintenance": 6,
                "delayed": {1: {"water_q": 7, "bio": 10, "soil": 3, "buffer": 8}},
                "ongoing": {"water_q": 0.35, "bio": 0.30, "buffer": 0.20},
            },
            "REFOREST": {
                "cost": 280,
                "maintenance": 6,
                "delayed": {1: {"air": 5}, 2: {"bio": 11, "soil": 6, "buffer": 6}},
                "ongoing": {"air": 0.25, "bio": 0.25, "soil": 0.15},
            },
            "RIVER": {"maintenance": 6, "ongoing": {"pollution": -0.55}},
            "WASTEWATER": {
                "cost": 300,
                "maintenance": 8,
                "delayed": {1: {"water_q": 7, "pollution": -7, "health": 5}},
                "event_mult": {"CONTAMINATION": 0.90},
            },
            "FLOOD_WALL": {
                "cost": 300,
                "maintenance": 8,
                "delayed": {1: {"buffer": 7}},
            },
            "FACTORIES": {
                "delayed": {
                    1: {
                        "economy": 4,
                        "jobs": 4,
                        "pollution": 2,
                        "industrial_intensity": E.MIX_FACTORIES_INTENSITY,
                    }
                }
            },
            "GREEN_MFG": {
                "cost": 320,
                "maintenance": 10,
                "delayed": {2: {"economy": 6, "pollution": -8, "jobs": 3, "air": 3}},
                "ongoing": {"pollution": -0.50},
            },
            "GRID": {"cost": 200},
            "EMISSIONS": {"maintenance": 10},
            "RENEWABLES": {"cost": 380, "maintenance": 10},
        }
    }

    for label, patch in patches.items():
        restore_catalogue(base_snap)
        apply_patch(patch)
        print(f"\n=== {label} ===")
        rows = run_all()
        for r in rows:
            print(
                f"{r['score']:6.2f} {r['name']:22} E={r['E']:5.1f} W={r['W']:5.1f} Y={r['Y']:5.1f} R={r['R']:5.1f} F={r['F']:5.1f} {r['done']}"
            )
        restore_catalogue(base_snap)


if __name__ == "__main__":
    main()
