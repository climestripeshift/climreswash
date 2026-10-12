import csv
import json
import unittest
from pathlib import Path

import support
from bhoomi_ai.config import AccessError, check_readable
from bhoomi_ai.tools import validate_args
from bhoomi_ai.tools.base import Fact


def _read_csv(p):
    with open(p, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def facts(r):
    return {f.key: f.value for f in r.facts}


class ToolOracleTests(unittest.TestCase):
    """Tool outputs are compared with values read straight from the raw files."""

    @classmethod
    def setUpClass(cls):
        cls.cfg, cls.store, cls.reg, _ = support.env()
        cls.ctx = support.ctx()

    def run_tool(self, name, **args):
        a, errs = self.reg.validate(name, args)
        self.assertEqual(errs, [], errs)
        return self.reg.execute(name, a, self.ctx)

    def test_monsoon_year_matches_raw_csv(self):
        raw = _read_csv(self.cfg["paths"]["monsoon_year"])
        row = next(r for r in raw if r["district"] == "Jaisalmer" and r["year"] == "2009")
        f = facts(self.run_tool("monsoon_indicators", district="Jaisalmer", year=2009))
        self.assertAlmostEqual(f["jjas_total_mm"], float(row["jjas_total_mm"]))
        self.assertAlmostEqual(f["dry_spell_max_days"], float(row["dry_spell_max_days"]))
        self.assertAlmostEqual(f["julaug_share_pct"], float(row["julaug_share_pct"]))

    def test_rainfall_features_match_raw(self):
        labels = _read_csv(self.cfg["paths"]["flood_labels"])
        feats = {r["district_month_id"]: r for r in _read_csv(self.cfg["paths"]["flood_features"])}
        lab = next(r for r in labels if r["district_name"] == "Kota" and r["year"] == "2019" and r["month"] == "8")
        raw = feats[lab["district_month_id"]]
        f = facts(self.run_tool("rainfall_features", district="Kota", year=2019, month=8))
        self.assertAlmostEqual(f["rain_month_total_mm"], float(raw["rain_month_total_mm"]))

    def test_reported_flood_months_match_raw(self):
        labels = _read_csv(self.cfg["paths"]["flood_labels"])
        pos = sorted((int(r["year"]), int(r["month"])) for r in labels
                     if r["district_name"] == "Kota" and r["label_status"] == "reported_positive"
                     and 2015 <= int(r["year"]) <= 2020)
        r = self.run_tool("reported_flood_months", district="Kota", year_from=2015, year_to=2020)
        self.assertEqual(facts(r)["n_reported_months"], len(pos))
        self.assertEqual(r.data["months"], [f"{y}-{m:02d}" for y, m in pos])
        self.assertTrue(any("NOT confirmed" in l for l in r.limitations))

    def test_hazard_profile_matches_hex_aggregation(self):
        rows = json.loads(Path(self.cfg["paths"]["hex_props"]).read_text())
        sel = [r for r in rows if r.get("district_name") == "Jodhpur" and r.get("state") == "Rajasthan"]
        self.assertTrue(sel)
        w = sum(r.get("population") or 0 for r in sel)
        exp = sum(r["hex_risk"] * (r.get("population") or 0) for r in sel if r.get("hex_risk") is not None) / w
        f = facts(self.run_tool("district_hazard_profile", district="Jodhpur", state="Rajasthan"))
        self.assertAlmostEqual(f["hex_risk"], exp, places=1)

    def test_every_numeric_result_declares_semantics_and_provenance(self):
        for name, args in [("district_hazard_profile", {"district": "Jodhpur"}),
                           ("forecast_summary", {"district": "Jaipur"}),
                           ("monsoon_indicators", {"district": "Barmer", "year": 2015}),
                           ("historical_climate", {"district": "Barmer"}),
                           ("wash_context", {"district": "Jodhpur"})]:
            r = self.run_tool(name, **args)
            self.assertIn(r.status, ("ok", "stale"), name)
            for k in ("data_class", "temporal_class", "is_probability", "spatial"):
                self.assertIn(k, r.semantics, f"{name}:{k}")
            self.assertFalse(r.semantics["is_probability"])
            self.assertTrue(r.provenance and all(p.get("sha256") for p in r.provenance), name)
            self.assertTrue(r.limitations, name)

    def test_duplicate_district_name_is_ambiguous(self):
        cache = self.store.cache()["districts"]
        from collections import defaultdict
        by = defaultdict(set)
        for v in cache.values():
            by[v["district"]].add(v["state"])
        dup = next(d for d, s in by.items() if len(s) > 1)
        r = self.run_tool("district_hazard_profile", district=dup)
        self.assertEqual(r.status, "ambiguous")
        self.assertGreaterEqual(len(r.data["candidates"]), 2)
        st = sorted(by[dup])[0]
        r2 = self.run_tool("district_hazard_profile", district=dup, state=st)
        self.assertEqual(r2.status, "ok")
        self.assertEqual(r2.entities["state"], st)

    def test_rajasthan_only_tools_refuse_other_states(self):
        for name, a in [("monsoon_indicators", {"district": "Pune"}),
                        ("reported_flood_months", {"district": "Pune"}),
                        ("rainfall_features", {"district": "Pune", "year": 2015, "month": 7})]:
            r = self.run_tool(name, **a)
            self.assertEqual(r.status, "unsupported", name)
            self.assertFalse(r.facts)

    def test_unknown_district_not_found(self):
        r = self.run_tool("district_hazard_profile", district="Atlantisgarh")
        self.assertEqual(r.status, "not_found")

    def test_forecast_status_follows_clock(self):
        for now, expect in [(support.CLOCK_CURRENT, "current"), (support.CLOCK_STALE, "stale"),
                            (support.CLOCK_EXPIRED, "expired")]:
            r = self.reg.execute("forecast_summary", {"district": "Jaipur"}, support.ctx(now))
            self.assertEqual(facts(r)["forecast_status"], expect)
            self.assertEqual(r.status, "ok" if expect == "current" else "stale")
            if expect != "current":
                self.assertTrue(any("not current guidance" in l for l in r.limitations))

    def test_cv_is_labelled_annual_not_monsoon(self):
        r = self.run_tool("historical_climate", district="Barmer")
        cv = next(f for f in r.facts if f.key == "rainfall_cv")
        self.assertIn("ANNUAL", cv.label)
        self.assertTrue(any("not June-September monsoon reliability" in l for l in r.limitations))

    def test_onset_proxy_limitation_present(self):
        r = self.run_tool("monsoon_indicators", district="Jaisalmer", year=2009)
        self.assertTrue(any("NOT the IMD" in l for l in r.limitations))

    def test_map_link_uses_existing_route(self):
        r = self.run_tool("map_link", view="grid", district="Kota", state="Rajasthan")
        self.assertEqual(r.data["url"], "/grid?state=Rajasthan&district=Kota")

    def test_method_notes_returns_cited_passage(self):
        r = self.run_tool("method_notes", topic="monsoon onset proxy definition")
        self.assertEqual(r.status, "ok")
        self.assertTrue(all(p["file"] and p["line"] for p in r.data["passages"]))

    def test_describe_capabilities_lists_tools(self):
        r = self.run_tool("describe_capabilities")
        keys = {f.key for f in r.facts}
        self.assertIn("monsoon_indicators", keys)
        self.assertNotIn("declare_unsupported", keys)


class ValidationTests(unittest.TestCase):
    def setUp(self):
        _, _, self.reg, _ = support.env()

    def test_unknown_tool(self):
        _, e = self.reg.validate("delete_everything", {})
        self.assertTrue(e and "unknown tool" in e[0])

    def test_missing_required(self):
        _, e = self.reg.validate("district_hazard_profile", {})
        self.assertIn("missing required argument 'district'", e)

    def test_unknown_argument_rejected(self):
        _, e = self.reg.validate("district_hazard_profile", {"district": "Kota", "path": "/etc/passwd"})
        self.assertTrue(any("unknown argument" in x for x in e))

    def test_type_and_range(self):
        _, e = self.reg.validate("monsoon_indicators", {"district": "Kota", "year": 1850})
        self.assertTrue(e)
        a, e = self.reg.validate("monsoon_indicators", {"district": "Kota", "year": "2009"})
        self.assertEqual((a["year"], e), (2009, []))
        _, e = self.reg.validate("monsoon_indicators", {"district": "Kota", "year": "abc"})
        self.assertTrue(e)

    def test_enum(self):
        _, e = self.reg.validate("rank_districts", {"metric": "vibes"})
        self.assertTrue(e)

    def test_arguments_must_be_object(self):
        _, e = self.reg.validate("district_hazard_profile", '{"district": "Kota"')
        self.assertEqual(e, ["arguments must be a JSON object"])

    def test_overlong_string(self):
        _, e = self.reg.validate("district_hazard_profile", {"district": "x" * 500})
        self.assertTrue(e)

    def test_tool_exception_becomes_error_result(self):
        class Boom:
            name = "boom"
            def run(self, a, c):
                raise ValueError("kaput")
        reg = type(self.reg)([Boom()])
        r = reg.execute("boom", {}, support.ctx())
        self.assertEqual(r.status, "error")
        self.assertFalse(r.facts)


class FileAccessTests(unittest.TestCase):
    def test_reads_outside_allowlist_are_denied(self):
        for p in ["/etc/passwd", str(Path.home() / ".ssh" / "id_rsa"),
                  str(support.ROOT / ".." / ".." / "server" / "routes.ts")]:
            with self.assertRaises(AccessError):
                check_readable(p)

    def test_allowlisted_file_is_readable(self):
        cfg, *_ = support.env()
        self.assertTrue(check_readable(cfg["paths"]["forecast"]).exists())

    def test_traversal_is_normalised(self):
        cfg, *_ = support.env()
        p = Path(cfg["paths"]["forecast"]).parent / ".." / ".." / ".." / "package.json"
        with self.assertRaises(AccessError):
            check_readable(p)


class FactDisplayTests(unittest.TestCase):
    def test_units(self):
        self.assertEqual(Fact("a", "a", 126.4, "mm", 1).display(), "126.4 mm")
        self.assertEqual(Fact("a", "a", 3921775, "people", 0).display(), "3,921,775 people")
        self.assertIn("index, 0-10", Fact("a", "a", 4.76, "index_0_10", 2).display())
        self.assertEqual(Fact("a", "a", None, "mm").display(), "not available")


if __name__ == "__main__":
    unittest.main()
