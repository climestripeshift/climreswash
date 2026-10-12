"""Read-only data layer: allowlisted file access, checksums, a compact
district cache, and a gazetteer.

The district cache aggregates the large hex files ONCE (population-weighted
means, the same convention as scripts/retrospective_validation.py
district_hazard_profile) so runtime memory on an 8 GB machine stays small. The
cache records the SHA-256 of each source and is rebuilt when a source changes.
"""
from __future__ import annotations

import csv
import difflib
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from .config import check_readable

HAZARD_FIELDS = ("flood_risk", "heat_risk", "cyclone_risk", "drought_risk", "wetbulb_risk",
                 "landslide_risk", "coldwave_risk", "flashflood_risk", "sealevel_risk", "fire_risk",
                 "pollution_risk", "hex_risk")
WASH_FIELDS = ("wash_water_pct", "wash_sanitation_pct", "wash_stunting_pct", "wash_diarrhoea_pct",
               "wash_anaemia_pct", "wash_wasting_pct", "wash_vaccination_pct", "jjm_fhtc_pct",
               "adaptive_capacity")
HIST_FIELDS = ("rainfall_mean_mm", "rainfall_trend_mm_decade", "rainfall_cv", "temp_mean_c",
               "temp_trend_c_decade", "recent_vs_baseline_rainfall_pct", "recent_vs_baseline_temp_c")
# common spelling variants -> canonical district name used in the grid (exact, after normalisation)
ALIASES = {"dholpur": "Dhaulpur", "jalore": "Jalor", "jhunjhunu": "Jhunjhunun", "chittorgarh": "Chittaurgarh",
           "srigangananagar": "Ganganagar", "sriganganagar": "Ganganagar", "sawaimadhopur": "Sawai Madhopur",
           "banswada": "Banswara", "jaisalamer": "Jaisalmer", "ganganagar": "Ganganagar"}
CACHE_VERSION = 2   # 2: full-precision aggregates (v1 rounded to 3 dp, causing 2-dp display drift)
FORECAST_HAZARD_NAMES = ("flood", "heat", "cyclone", "drought", "wetbulb", "landslide", "coldwave",
                         "flashflood", "sealevel", "fire", "pollution")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


RESTRICTED_KEYS = {"monsoon_year", "monsoon_desc", "flood_labels", "flood_features", "flood_lgd"}   # CHIRPS / IFI / LGD derived


class DataStore:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.paths = cfg["paths"]
        self._sha: dict[str, str] = {}
        self._csv: dict[str, list[dict]] = {}
        self._cache: dict | None = None
        self._gaz: dict | None = None

    # ---- raw files ---------------------------------------------------------
    @property
    def cloud(self) -> bool:
        return self.cfg.get("deployment_profile") == "cloud_beta"

    def path(self, key: str) -> Path:
        if key not in self.paths:
            raise KeyError(f"unknown data key {key!r}")
        if self.cloud and (key in RESTRICTED_KEYS or key == "forecast"):
            raise PermissionError(f"data key {key!r} is not available in the cloud_beta deployment profile")
        return check_readable(self.paths[key])

    def exists(self, key: str) -> bool:
        try:
            return self.path(key).exists()
        except KeyError:
            return False

    def sha(self, key: str) -> str:
        if key not in self._sha:
            self._sha[key] = sha256_file(self.path(key))
        return self._sha[key]

    def provenance(self, key: str, role: str, **extra) -> dict:
        p = self.path(key)
        try:
            rel = str(p.relative_to(self.cfg["_root"].parents[1]))
        except ValueError:
            rel = p.name
        return {"file": rel, "sha256": self.sha(key), "role": role, **extra}

    def csv_rows(self, key: str) -> list[dict]:
        if key not in self._csv:
            with open(self.path(key), encoding="utf-8", newline="") as fh:
                self._csv[key] = list(csv.DictReader(fh))
        return self._csv[key]

    # ---- district cache ------------------------------------------------------
    def cache(self) -> dict:
        if self._cache is None:
            self._cache = ensure_cache(self)
        return self._cache

    def coverage(self) -> dict:
        """Coverage constants that deterministic limitation statements may cite (configured years; forecast window length)."""
        c = self.cfg.get("coverage", {})
        days = 0
        try:
            days = len(self.cache().get("forecast_meta", {}).get("days", []))
        except Exception:  # noqa: BLE001 - coverage must never break an answer
            days = 0
        return {"records_year_from": int(c.get("records_year_from", 2000)),
                "records_year_to": int(c.get("records_year_to", 2023)),
                "forecast_days": days or int(c.get("forecast_days", 7))}

    def gazetteer(self) -> dict:
        if self._gaz is None:
            d = self.cache()["districts"]
            by_norm = defaultdict(list)
            for k, v in d.items():
                by_norm[norm(v["district"])].append(k)
            states = sorted({v["state"] for v in d.values()})
            self._gaz = {"by_norm": dict(by_norm), "states": states,
                         "state_norm": {norm(s): s for s in states}}
        return self._gaz

    def resolve(self, district: str | None, state: str | None = None) -> dict:
        """-> {status: ok|ambiguous|not_found|not_found_state, matches:[keys], fuzzy:bool}"""
        g = self.gazetteer()
        if not district or not norm(district):
            return {"status": "not_found", "matches": [], "fuzzy": False}
        st_name = None
        if state:
            st_name = g["state_norm"].get(norm(state))
            if st_name is None:
                close = difflib.get_close_matches(norm(state), list(g["state_norm"]), n=1, cutoff=0.8)
                if close:
                    st_name = g["state_norm"][close[0]]
                else:
                    return {"status": "not_found_state", "matches": [], "fuzzy": False}
        keys = g["by_norm"].get(norm(district), [])
        fuzzy = False
        if not keys and norm(district) in ALIASES:
            keys = list(g["by_norm"].get(norm(ALIASES[norm(district)]), []))
        if not keys:
            close = difflib.get_close_matches(norm(district), list(g["by_norm"]), n=3, cutoff=0.84)
            keys = [k for c in close for k in g["by_norm"][c]]
            fuzzy = bool(keys)
        if st_name:
            keys = [k for k in keys if self.cache()["districts"][k]["state"] == st_name]
        if not keys:
            return {"status": "not_found", "matches": [], "fuzzy": False}
        status = "ok" if len(keys) == 1 else "ambiguous"
        return {"status": status, "matches": sorted(keys), "fuzzy": fuzzy}


def _mean(vals):
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


def ensure_cache(store: DataStore) -> dict:
    cache_path = store.paths["district_cache"]
    keys = ("hex_props", "hist_climate") if store.cloud else ("hex_props", "forecast", "hist_climate")
    sources = {k: store.sha(k) for k in keys}
    if cache_path.exists():
        try:
            c = json.loads(cache_path.read_text(encoding="utf-8"))
            if c.get("source_sha256") == sources and c.get("cache_version") == CACHE_VERSION:
                return c
        except (json.JSONDecodeError, OSError):
            pass
    c = build_cache(store, sources)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache_path.with_suffix(".json.part")
    tmp.write_text(json.dumps(c, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    tmp.replace(cache_path)
    return c


def build_cache(store: DataStore, sources: dict) -> dict:
    props = json.loads(store.path("hex_props").read_text(encoding="utf-8"))
    fc = ({"generated_at": None, "days": [], "risk": {}, "dominant": {}} if store.cloud
          else json.loads(store.path("forecast").read_text(encoding="utf-8")))
    hist = json.loads(store.path("hist_climate").read_text(encoding="utf-8"))
    fc_risk, fc_dom = fc["risk"], fc["dominant"]
    n_days = len(fc["days"])
    groups = defaultdict(list)
    for p in props:
        groups[(p["state"], p["district_name"])].append(p)
    districts = {}
    for (state, name), hexes in groups.items():
        pop = sum((h.get("population") or 0) for h in hexes)

        def wmean(field):
            vals = [(h.get(field), h.get("population") or 0) for h in hexes if h.get(field) is not None]
            if not vals:
                return None
            if pop > 0:
                w = sum(p_ for _, p_ in vals)
                if w > 0:
                    return sum(v * p_ for v, p_ in vals) / w
            return sum(v for v, _ in vals) / len(vals)

        haz = {f: wmean(f) for f in HAZARD_FIELDS}
        ten = {k: v for k, v in haz.items() if k not in ("hex_risk", "pollution_risk") and v is not None}
        dominant = max(ten, key=ten.get) if ten else None
        # district-level survey values are constant across a district's hexes: take the mean of non-null
        wash = {f: _mean([h.get(f) for h in hexes]) for f in WASH_FIELDS}
        zero_diarrhoea = all((h.get("wash_diarrhoea_pct") in (0, 0.0)) for h in hexes)
        hh = [hist.get(h["h3_id"]) for h in hexes if h["h3_id"] in hist]
        histagg = {f: _mean([x.get(f) for x in hh]) for f in HIST_FIELDS}
        # forecast: population-weighted per-day risk and the most frequent dominant hazard
        per_day, dom_counts = [], [Counter() for _ in range(n_days)]
        for d in range(n_days):
            num = den = 0.0
            vals = []
            for h in hexes:
                r = fc_risk.get(h["h3_id"])
                if r is None:
                    continue
                w = h.get("population") or 0
                num += r[d] * w
                den += w
                vals.append(r[d])
                dom_counts[d][fc_dom[h["h3_id"]][d]] += max(w, 1)
            per_day.append(round(num / den, 6) if den > 0 else (round(sum(vals) / len(vals), 6) if vals else None))
        districts[f"{state}|{name}"] = {
            "state": state, "district": name, "n_hexes": len(hexes), "population": pop,
            "hazards": {k: (None if v is None else round(v, 6)) for k, v in haz.items()},
            "dominant_hazard": dominant,
            "wash": {k: (None if v is None else round(v, 2)) for k, v in wash.items()},
            "diarrhoea_zero_coded": bool(zero_diarrhoea),
            "hist": {k: (None if v is None else round(v, 6)) for k, v in histagg.items()},
            "hist_hexes": len(hh),
            "forecast_risk_by_day": per_day,
            "forecast_dominant_by_day": [c.most_common(1)[0][0] if c else None for c in dom_counts],
        }
    return {
        "cache_version": CACHE_VERSION,
        "built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_sha256": sources,
        "forecast_meta": {"generated_at": fc["generated_at"], "days": fc["days"]},
        "aggregation": "population-weighted mean of hex values; simple mean when district population is 0",
        "districts": dict(sorted(districts.items())),
    }
