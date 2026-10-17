#!/usr/bin/env python3
"""Decompose why prudent_buffer beats catalogue paths. Read-only diagnostics."""

from __future__ import annotations

import json
from copy import deepcopy

import engine as E
from engine import SECTORS, Submission, play_interactive

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
RESTORE = {
    "restoration": 0.26,
    "pollution_control": 0.22,
    "water": 0.18,
    "energy": 0.08,
    "agriculture": 0.06,
    "industry": 0.04,
    "infrastructure": 0.10,
    "public_services": 0.06,
}


def alloc(weights, available, keep=0.0):
    held = min(max(0.0, keep), available)
    spendable = max(0.0, available - held)
    return {k: spendable * weights[k] for k in SECTORS}


def rundown(name, choose):
    result = play_interactive(choose)
    rows = []
    for r in result["rounds"]:
        snap = r.snapshot
        rows.append(
            {
                "round": r.round_index,
                "income": round(r.income, 1),
                "maint": round(r.maintenance, 1),
                "available": round(r.available, 1),
                "projects": r.accepted_starts,
                "pcost": round(r.project_cost, 1),
                "sectors": round(r.sector_spend["_spent"], 1),
                "reserve": round(r.unspent, 1),
                "F": round(snap["efficiency"], 2),
                "E": round(snap["ecology"], 2),
                "W": round(snap["welfare"], 2),
                "Y": round(snap["economy"], 2),
                "R": round(snap["resilience"], 2),
                "pen": round(snap["penalty"], 2),
                "snap": round(snap["snapshot"], 2),
                "F_pts": round(0.10 * snap["efficiency"], 2),
                "E_pts": round(0.40 * snap["ecology"], 2),
                "damage": round(r.damage, 2),
            }
        )
    return {
        "name": name,
        "score": result["score"],
        "completed": sorted(result["completed"]),
        "mean_damage": round(result["mean_damage"], 2),
        "final": {k: round(result["categories"][k], 2) for k in result["categories"]},
        "rounds": rows,
    }


def prudent(n, t, a, plan=()):
    keep = min(E.IDEAL_RESERVE, max(0.0, a - 520.0))
    starts = []
    remaining = a
    for code in plan:
        if code in t.started or code in [s for s in starts]:
            continue
        proj = E.CATALOGUE.get(code)
        if proj is None:
            continue
        if any(p not in t.completed for p in proj.prerequisites):
            continue
        if proj.mutex_group and E._mutex_taken(t, proj.mutex_group, starts):
            continue
        if proj.cost > remaining - keep:
            continue
        if len(starts) >= 2:
            break
        starts.append(code)
        remaining -= proj.cost
    return Submission(alloc(PRUDENT_W, a, keep=keep), starts)


def main():
    reports = []
    reports.append(rundown("prudent_buffer", lambda n, t, a: prudent(n, t, a)))
    reports.append(
        rundown(
            "prudent_plus_wetland_r1",
            lambda n, t, a: prudent(n, t, a, ("WETLAND",) if n == 1 else ()),
        )
    )
    reports.append(
        rundown(
            "prudent_plus_wetland_if_fits",
            lambda n, t, a: prudent(n, t, a, ("WETLAND",)),
        )
    )

    def habitat(n, t, a):
        keep = min(E.IDEAL_RESERVE, max(0.0, a - 520.0))
        plan = []
        if n == 1:
            plan = ["WETLAND", "REFOREST"]
        return prudent(n, t, a, tuple(plan))

    reports.append(rundown("prudent_habitat_r1", habitat))

    def restore_wetland(n, t, a):
        w = RESTORE if n <= 3 else GREEN
        starts = ["WETLAND", "REFOREST"] if n == 1 else []
        return Submission(alloc(w, a), starts)

    reports.append(rundown("restore_habitat_no_buffer", restore_wetland))

    def green_path(n, t, a):
        if n == 1:
            starts = ["GRID", "EMISSIONS"]
        elif n == 2:
            starts = ["FACTORIES"]
        elif n == 3:
            starts = ["GREEN_MFG"]
        elif n == 4:
            starts = ["RENEWABLES"]
        else:
            starts = []
        return Submission(alloc(GREEN, a), starts)

    reports.append(rundown("green_path", green_path))

    def flood_pack(n, t, a):
        starts = ["WETLAND", "FLOOD_WALL"] if n == 1 else []
        keep = min(E.IDEAL_RESERVE, max(0.0, a - 520.0))
        return prudent(n, t, a, tuple(starts) if n == 1 else ())

    reports.append(rundown("prudent_flood_r1", flood_pack))

    # Efficiency math at typical reserves
    def F_only(reserve, spent_each=80.0):
        spend = {k: spent_each for k in SECTORS}
        spend["_spent"] = spent_each * 8
        town = E.Town()
        town.reserve = reserve
        return round(E.efficiency_index(town, spend), 2)

    eff_table = {r: F_only(r) for r in (0, 100, 200, 300, 400, 700, 1600)}

    base = reports[0]
    print(
        json.dumps(
            {
                "efficiency_F_by_reserve": eff_table,
                "F_weight_in_snapshot": 0.10,
                "delta_F_0_vs_300": round(F_only(300) - F_only(0), 2),
                "delta_score_pts_0_vs_300_per_round": round(0.10 * (F_only(300) - F_only(0)), 2),
                "runs": reports,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
