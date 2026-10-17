#!/usr/bin/env python3
"""Unit tests for the Langlands R3 Python reference engine."""

from __future__ import annotations

import json
import math
import unittest
from copy import deepcopy
from pathlib import Path

import engine as E
from engine import (
    CATALOGUE,
    EQUAL,
    GREEN,
    ROUNDS,
    SECTORS,
    Submission,
    Town,
    apply_drift,
    canonical_state,
    ecology_index,
    final_score,
    play,
    play_interactive,
    play_weights,
    sat,
    state_hash,
    step_round,
)


def balanced_choose(round_no, town, available):
    return Submission({k: available * 0.125 for k in SECTORS}, [])


class BoundsTests(unittest.TestCase):
    def test_indices_stay_in_unit_interval(self):
        result = play([None] * 6)
        town = result["town"]
        for key in E.INDEX_FIELDS:
            value = getattr(town, key)
            self.assertGreaterEqual(value, 0.0, key)
            self.assertLessEqual(value, 100.0, key)
        self.assertGreaterEqual(town.population, 42_000.0)
        self.assertLessEqual(town.population, 56_000.0)

    def test_sat_diminishing_returns(self):
        self.assertLess(sat(800), sat(400) + sat(400) - 1e-9)


class BudgetTests(unittest.TestCase):
    def test_conservation_silent_team(self):
        town = Town()
        result = step_round(town, 1, None)
        self.assertAlmostEqual(
            result.project_cost + result.sector_spend["_spent"] + result.unspent,
            result.available,
            places=6,
        )
        self.assertEqual(result.accepted_starts, [])
        self.assertAlmostEqual(result.unspent, result.available, places=6)

    def test_overspend_is_scaled(self):
        town = Town()
        huge = {k: 10_000.0 for k in SECTORS}
        result = step_round(town, 1, Submission(huge, []))
        self.assertLessEqual(result.sector_spend["_spent"], result.available + 1e-9)
        self.assertAlmostEqual(result.sector_spend["_spent"] + result.unspent, result.available, places=6)

    def test_starts_charged_before_sectors(self):
        town = Town()
        result = step_round(town, 1, Submission(EQUAL, ["GRID"]))
        self.assertIn("GRID", result.accepted_starts)
        self.assertAlmostEqual(result.project_cost, 200.0, places=6)
        self.assertAlmostEqual(
            result.project_cost + result.sector_spend["_spent"] + result.unspent,
            result.available,
            places=6,
        )


class ProjectLimitTests(unittest.TestCase):
    def test_third_start_dropped(self):
        town = Town()
        result = step_round(town, 1, Submission({}, ["RIVER", "CLINICS", "WATER_TREAT"]))
        self.assertEqual(result.accepted_starts, ["RIVER", "CLINICS"])
        self.assertTrue(any(d["code"] == "WATER_TREAT" and d["reason"] == "max_starts" for d in result.dropped))

    def test_unknown_code_dropped(self):
        town = Town()
        result = step_round(town, 1, Submission({}, ["NOT_A_PROJECT"]))
        self.assertEqual(result.accepted_starts, [])
        self.assertEqual(result.dropped[0]["reason"], "unknown")

    def test_prereq_blocks_coal_without_grid(self):
        town = Town()
        result = step_round(town, 1, Submission({}, ["COAL"]))
        self.assertEqual(result.accepted_starts, [])
        self.assertTrue(result.dropped[0]["reason"].startswith("prereq"))

    def test_grid_then_coal_same_round_rejects_coal(self):
        town = Town()
        result = step_round(town, 1, Submission({}, ["GRID", "COAL"]))
        self.assertEqual(result.accepted_starts, ["GRID"])
        self.assertTrue(any(d["code"] == "COAL" for d in result.dropped))

    def test_mutex_energy(self):
        def choose(round_no, town, available):
            if round_no == 1:
                return Submission({k: 0.0 for k in SECTORS}, ["GRID", "CLINICS"])
            if round_no == 2:
                return Submission({k: 0.0 for k in SECTORS}, ["COAL", "RENEWABLES"])
            return Submission({k: available * 0.125 for k in SECTORS}, [])

        result = play_interactive(choose)
        self.assertIn("COAL", result["started"])
        self.assertNotIn("RENEWABLES", result["started"])
        self.assertTrue(any(d["code"] == "RENEWABLES" for d in result["dropped"]))

    def test_mutex_agri(self):
        town = Town()
        result = step_round(town, 1, Submission({}, ["INTENSE_AG", "REGEN_AG"]))
        self.assertEqual(result.accepted_starts, ["INTENSE_AG"])
        self.assertTrue(any(d["reason"] == "mutex" for d in result.dropped))


class DelayTests(unittest.TestCase):
    def test_reforest_air_not_immediate(self):
        town = Town()
        air0 = town.air
        apply_drift(town)
        # isolate project: skip by using step and measuring air vs a no-project twin
        twin = Town()
        with_p = step_round(Town(), 1, Submission({}, ["REFOREST"]))
        without = step_round(Town(), 1, Submission({}, []))
        # air should match operating-empty aside from drift identity; both empty sectors
        self.assertAlmostEqual(with_p.snapshot["ecology"], without.snapshot["ecology"], places=4)

        def choose(round_no, town, available):
            starts = ["REFOREST"] if round_no == 1 else []
            return Submission({k: 0.0 for k in SECTORS}, starts)

        def silent(round_no, town, available):
            return Submission({k: 0.0 for k in SECTORS}, [])

        r1 = play_interactive(choose)
        r0 = play_interactive(silent)
        # After 6 rounds reforest should have landed T+1 and T+2.
        self.assertGreater(r1["town"].bio, r0["town"].bio)
        self.assertGreater(r1["town"].air, r0["town"].air)

    def test_river_immediate_before_event(self):
        a = step_round(Town(), 1, Submission({}, ["RIVER"]))
        b = step_round(Town(), 1, Submission({}, []))
        self.assertGreater(a.snapshot["ecology"], b.snapshot["ecology"])

    def test_green_mfg_cannot_finish_from_final_round(self):
        def choose(round_no, town, available):
            if round_no == 1:
                return Submission({}, ["GRID", "EMISSIONS"])
            if round_no == 2:
                return Submission({}, ["FACTORIES"])
            if round_no == 6:
                return Submission({}, ["GREEN_MFG"])
            return Submission({k: available * 0.1 for k in SECTORS}, [])

        result = play_interactive(choose)
        self.assertIn("GREEN_MFG", result["started"])
        self.assertNotIn("GREEN_MFG", result["completed"])

    def test_green_mfg_from_round_5_can_complete_after_acat11(self):
        def choose(round_no, town, available):
            if round_no == 1:
                return Submission({}, ["GRID", "EMISSIONS"])
            if round_no == 2:
                return Submission({}, ["FACTORIES"])
            if round_no == 5:
                return Submission({}, ["GREEN_MFG"])
            return Submission({k: available * 0.1 for k in SECTORS}, [])

        result = play_interactive(choose)
        self.assertIn("GREEN_MFG", result["completed"])


class EventTests(unittest.TestCase):
    def test_pack_a_order(self):
        result = play([None] * 6)
        codes = [r.event_code for r in result["rounds"]]
        self.assertEqual(codes, [None, "HEATWAVE", "DROUGHT", "FLOOD", "CONTAMINATION", None])
        self.assertEqual(result["rounds"][0].damage, 0.0)
        self.assertEqual(result["rounds"][5].damage, 0.0)
        for i in (1, 2, 3, 4):
            self.assertGreater(result["rounds"][i].damage, 0.0)

    def test_flood_modifiers_stack(self):
        def wall_wetland(round_no, town, available):
            if round_no == 1:
                return Submission({k: available * 0.1 for k in SECTORS}, ["WETLAND", "FLOOD_WALL"])
            return Submission({k: available * 0.1 for k in SECTORS}, [])

        def none(round_no, town, available):
            return Submission({k: available * 0.1 for k in SECTORS}, [])

        stacked = play_interactive(wall_wetland)
        base = play_interactive(none)
        self.assertIn("WETLAND", stacked["completed"])
        self.assertIn("FLOOD_WALL", stacked["completed"])
        self.assertLess(stacked["rounds"][3].damage, base["rounds"][3].damage)
        # Published stack 0.75 * 0.85 = 0.6375 vs unmodified, not an exact ratio
        # because state also diverges, but damage must be lower.

    def test_water_treat_same_round_drought(self):
        def treat(round_no, town, available):
            starts = ["WATER_TREAT"] if round_no == 3 else []
            return Submission({k: available * 0.1 for k in SECTORS}, starts)

        def none(round_no, town, available):
            return Submission({k: available * 0.1 for k in SECTORS}, [])

        a = play_interactive(treat)
        b = play_interactive(none)
        self.assertLess(a["rounds"][2].damage, b["rounds"][2].damage)


class ScoreTests(unittest.TestCase):
    def test_weights_sum_to_one(self):
        self.assertAlmostEqual(sum(E.WEIGHTS.values()), 1.0, places=9)

    def test_floors_unchanged(self):
        self.assertEqual(E.DYS_ECOLOGY, 36.0)
        self.assertEqual(E.DYS_WELFARE, 40.0)
        self.assertEqual(E.DYS_ECONOMY, 40.0)
        self.assertEqual(E.DYS_PREP_INFRA, 32.0)

    def test_score_bounds(self):
        result = play_interactive(balanced_choose)
        self.assertGreater(result["score"], 0.0)
        self.assertLess(result["score"], 100.0)
        self.assertEqual(result["score"], final_score(result["snaps"]))

    def test_industry_dump_worse_than_balanced(self):
        def industry(round_no, town, available):
            w = {
                "restoration": 0.00,
                "pollution_control": 0.04,
                "water": 0.04,
                "energy": 0.22,
                "agriculture": 0.08,
                "industry": 0.42,
                "infrastructure": 0.14,
                "public_services": 0.06,
            }
            return Submission({k: available * w[k] for k in SECTORS}, [])

        self.assertGreater(play_interactive(balanced_choose)["score"], play_interactive(industry)["score"])

    def test_tie_break_order(self):
        a = play_interactive(balanced_choose)
        key_seat1 = E.tie_break_tuple(a["town"], a["snaps"], 1)
        key_seat2 = E.tie_break_tuple(a["town"], a["snaps"], 2)
        self.assertLess(key_seat1, key_seat2)


class SilentAndReproTests(unittest.TestCase):
    def test_twenty_identical_silent_teams(self):
        hashes = [play([None] * 6)["hash"] for _ in range(20)]
        self.assertEqual(len(set(hashes)), 1)

    def test_replay_byte_stable(self):
        a = play_interactive(balanced_choose)
        b = play_interactive(balanced_choose)
        self.assertEqual(a["hash"], b["hash"])
        self.assertEqual(a["score"], b["score"])
        self.assertEqual(canonical_state(a["town"]), canonical_state(b["town"]))

    def test_deepcopy_independence(self):
        r = play_interactive(balanced_choose)
        t1 = deepcopy(r["town"])
        t1.air = 0.0
        self.assertNotEqual(r["town"].air, 0.0)

    def test_engine_version_in_canonical_state(self):
        town = Town()
        blob = canonical_state(town)
        self.assertEqual(blob["engine_version"], E.ENGINE_VERSION)
        self.assertEqual(len(state_hash(town)), 64)


class MaintenanceTests(unittest.TestCase):
    def test_maintenance_starts_next_round(self):
        r1 = step_round(Town(), 1, Submission({}, ["RIVER"]))
        self.assertEqual(r1.maintenance, 0.0)
        town = Town()
        step_round(town, 1, Submission({}, ["RIVER"]))
        r2 = step_round(town, 2, Submission({}, []))
        self.assertAlmostEqual(r2.maintenance, 6.0, places=6)

    def test_neglect_threshold_edges(self):
        # 16.0% should not fire productive neglect if env also funded.
        def at_share(share):
            rest = 1.0 - share
            env = rest * 0.5
            other = rest * 0.5

            def choose(round_no, town, available):
                w = {
                    "restoration": env / 3,
                    "pollution_control": env / 3,
                    "water": env / 3,
                    "energy": share / 3,
                    "agriculture": share / 3,
                    "industry": share / 3,
                    "infrastructure": other / 2,
                    "public_services": other / 2,
                }
                return Submission({k: available * w[k] for k in SECTORS}, [])

            return play_interactive(choose)

        low = at_share(0.159)
        high = at_share(0.160)
        self.assertGreaterEqual(high["categories"]["economy"], low["categories"]["economy"] - 1e-6)


class OfficialRegressionTests(unittest.TestCase):
    def test_operating_prudent_matches_official_score_lab(self):
        from official_score import play_official
        from score_lab import STRATEGIES

        weights = {
            "restoration": 0.14,
            "pollution_control": 0.14,
            "water": 0.12,
            "energy": 0.12,
            "agriculture": 0.10,
            "industry": 0.10,
            "infrastructure": 0.16,
            "public_services": 0.12,
        }

        def prudent(round_no, town, available):
            keep = min(E.IDEAL_RESERVE, max(0.0, available - 520.0))
            spendable = max(0.0, available - keep)
            return Submission({k: spendable * weights[k] for k in SECTORS}, [])

        engine_score = play_interactive(prudent)["score"]
        official = play_official(STRATEGIES["prudent_buffer"])["score"]
        self.assertEqual(engine_score, official)
        self.assertEqual(engine_score, 58.41)


class GoldenExportTests(unittest.TestCase):
    def test_write_typescript_goldens(self):
        goldens = {
            "engine_version": E.ENGINE_VERSION,
            "weights": E.WEIGHTS,
            "silent": {k: play([None] * 6)[k] for k in ("score", "hash", "snaps", "shock_log")},
            "balanced": {
                k: play_interactive(balanced_choose)[k]
                for k in ("score", "hash", "snaps")
            },
            "grid_then_coal": play_interactive(
                lambda n, t, a: Submission(
                    {k: a * 0.1 for k in SECTORS},
                    ["GRID", "CLINICS"] if n == 1 else (["COAL"] if n == 2 else []),
                )
            ),
        }
        goldens["grid_then_coal"] = {
            k: goldens["grid_then_coal"][k] for k in ("score", "hash", "started", "completed")
        }
        path = Path(__file__).resolve().parent / "goldens" / f"{E.ENGINE_VERSION.replace('.', '_').replace('-', '_')}.json"
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(goldens, indent=2, sort_keys=True) + "\n")
        loaded = json.loads(path.read_text())
        self.assertEqual(loaded["engine_version"], E.ENGINE_VERSION)
        self.assertEqual(loaded["silent"]["hash"], goldens["silent"]["hash"])
        # Pinned after A-CAT-1.1. Operating-only silent town must not drift.
        self.assertEqual(
            loaded["silent"]["hash"],
            "c9dcd90e7e04d4aa45907ec3640f15807276fc91ae2d16d78f202a1294a09f28",
        )
        self.assertEqual(loaded["silent"]["score"], 6.42)


class CatalogueRevisionTests(unittest.TestCase):
    """A-CAT-1.1 locks. Scoring weights and event multipliers stay published."""

    def test_weights_and_event_mults_unchanged(self):
        self.assertEqual(E.WEIGHTS["ecology"], 0.40)
        self.assertEqual(E.WEIGHTS["welfare"], 0.25)
        self.assertEqual(E.WEIGHTS["economy"], 0.15)
        self.assertEqual(E.WEIGHTS["resilience"], 0.10)
        self.assertEqual(E.WEIGHTS["efficiency"], 0.10)
        self.assertEqual(CATALOGUE["WETLAND"].event_mult["FLOOD"], 0.85)
        self.assertEqual(CATALOGUE["FLOOD_WALL"].event_mult["FLOOD"], 0.75)
        self.assertEqual(CATALOGUE["WATER_TREAT"].event_mult["DROUGHT"], 0.90)
        self.assertEqual(CATALOGUE["CLINICS"].event_mult["CONTAMINATION"], 0.85)

    def test_wetland_is_capital_not_one_year_planting(self):
        w = CATALOGUE["WETLAND"]
        self.assertEqual(w.cost, 280)
        self.assertEqual(w.build_rounds, 1)
        self.assertEqual(w.maintenance, 6)
        self.assertEqual(w.delayed[1]["bio"], 10)
        self.assertGreater(w.ongoing["bio"], 0.0)

    def test_green_mfg_cleans_more_than_factories_dirty(self):
        factories_p = CATALOGUE["FACTORIES"].delayed[1]["pollution"]
        green_p = CATALOGUE["GREEN_MFG"].delayed[1]["pollution"]
        self.assertEqual(factories_p, 2)
        self.assertEqual(green_p, -10)
        self.assertLess(green_p, -factories_p)
        self.assertEqual(CATALOGUE["GREEN_MFG"].build_rounds, 1)
        self.assertEqual(CATALOGUE["GREEN_MFG"].prerequisites, ("EMISSIONS", "FACTORIES"))

    def test_restoration_first_beats_prudent_buffer(self):
        def alloc(weights, available, starts):
            cost = sum(CATALOGUE[c].cost for c in starts)
            leftover = max(0.0, available - cost)
            keep = min(E.IDEAL_RESERVE, max(0.0, leftover - 520.0))
            spendable = leftover - keep
            return Submission({k: spendable * weights[k] for k in SECTORS}, list(starts))

        prudent_w = {
            "restoration": 0.14,
            "pollution_control": 0.14,
            "water": 0.12,
            "energy": 0.12,
            "agriculture": 0.10,
            "industry": 0.10,
            "infrastructure": 0.16,
            "public_services": 0.12,
        }
        restore_e = {
            "restoration": 0.26,
            "pollution_control": 0.22,
            "water": 0.18,
            "energy": 0.08,
            "agriculture": 0.06,
            "industry": 0.04,
            "infrastructure": 0.10,
            "public_services": 0.06,
        }
        grow_l = {
            "restoration": 0.10,
            "pollution_control": 0.10,
            "water": 0.10,
            "energy": 0.14,
            "agriculture": 0.12,
            "industry": 0.18,
            "infrastructure": 0.14,
            "public_services": 0.12,
        }

        def prudent(n, t, a):
            return alloc(prudent_w, a, [])

        def restoration_first(n, t, a):
            w = restore_e if n <= 3 else grow_l
            starts = ["WETLAND", "REFOREST"] if n == 1 else []
            return alloc(w, a, starts)

        def coal(n, t, a):
            starts = ["GRID"] if n == 1 else (["COAL"] if n == 2 else [])
            industry = {
                "restoration": 0.00,
                "pollution_control": 0.04,
                "water": 0.04,
                "energy": 0.22,
                "agriculture": 0.08,
                "industry": 0.42,
                "infrastructure": 0.14,
                "public_services": 0.06,
            }
            return alloc(industry, a, starts)

        p = play_interactive(prudent)
        r = play_interactive(restoration_first)
        c = play_interactive(coal)
        self.assertEqual(p["score"], 58.41)
        self.assertGreater(r["score"], p["score"])
        self.assertGreater(r["score"] - p["score"], 1.0)
        self.assertLess(c["score"], p["score"] - 20.0)
        self.assertIn("WETLAND", r["completed"])
        self.assertIn("REFOREST", r["completed"])


if __name__ == "__main__":
    unittest.main()
