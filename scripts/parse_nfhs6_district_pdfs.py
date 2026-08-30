"""
Parses the 36 NFHS-6 (2023-24) State/District Compendium PDFs the user placed in
~/UNICEF RAJASTHAN/climreswash/nhfs 6/ into a single long-format JSON:
one row per (state, district, indicator) with NFHS-6 and NFHS-5 values side by
side -- exactly as printed in each district's 3-page "Key Indicators" fact sheet.

These compendiums are NOT the same as the state-only fact sheets already hand-
extracted into data/nfhs6_state_key_indicators.json (7 indicators). They contain
~90+ indicators per district, NFHS-6 vs NFHS-5, but still do NOT publish
sanitation, cooking fuel, handwashing, or anaemia (confirmed absent from every
sampled district table) -- NFHS-6 fact sheets structurally omit these across the
board, state and district alike. Any indicator involving those stays NFHS-5-only
elsewhere in the platform; this parser does not fabricate NFHS-6 values for them.

Requires poppler's pdftotext (installed via `brew install poppler` for this run).

Output (both a machine-friendly JSON and a plain CSV per level -- the CSV is
the one to open directly in Excel/Sheets; the JSON is what
compute_nfhs6_district_trends.py and the Phase 2 grid actually read):
  data/nfhs6_district_all_indicators.json / .csv
      one row per (state, district, indicator): NFHS-6 + NFHS-5 side by side,
      exactly as printed in each district's 3-page "Key Indicators" fact sheet
      -- 697 districts x ~93 indicators.
  data/nfhs6_state_all_indicators.csv (bundled inside the same JSON's
      "state_rows") -- the full ~101-indicator state-level table on the same
      PDFs, richer than nfhs6_state_key_indicators.json's hand-picked 7.

These compendiums are NOT the same as the state-only fact sheets already hand-
extracted into data/nfhs6_state_key_indicators.json (7 indicators). They contain
~90+ indicators per district, NFHS-6 vs NFHS-5, but still do NOT publish
sanitation, cooking fuel, handwashing, or anaemia (confirmed absent from every
sampled district table) -- NFHS-6 fact sheets structurally omit these across the
board, state and district alike. Any indicator involving those stays NFHS-5-only
elsewhere in the platform; this parser does not fabricate NFHS-6 values for them.

Run: python scripts/parse_nfhs6_district_pdfs.py
"""
import csv
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = Path("/Users/adityajain/UNICEF RAJASTHAN/climreswash/nhfs 6")
OUT = ROOT / "data/nfhs6_district_all_indicators.json"
OUT_DISTRICT_CSV = ROOT / "data/nfhs6_district_all_indicators.csv"
OUT_STATE_CSV = ROOT / "data/nfhs6_state_all_indicators.csv"

DISTRICT_HEADER = re.compile(r"^\s*(.+?),\s*(.+?)\s*-\s*Key Indicators\s*$")
STATE_HEADER = re.compile(r"^\s*(.+?)\s*-\s*Key Indicators\s*$")
NUM_LINE = re.compile(r"^\s*(\d+)\.\s+(.*)$")
# Trailing pair of values: each is a plain number, "*" (suppressed, n<25), or
# "(number)" (caution, n=25-49 unweighted cases -- kept but flagged).
VAL = r"(\*|\(?-?[\d]+\.?[\d]*\)?)"
TRAILING_VALUES = re.compile(rf"^(.*?)\s+{VAL}\s+{VAL}\s*$")
# State pages are 4-column (Urban, Rural, Total-NFHS6, Total-NFHS5) vs district
# pages' 2-column (Total-NFHS6, Total-NFHS5) -- try the 4-value shape first so
# the label doesn't retain the urban/rural pair, fall back to 2-value for state
# rows that have no urban/rural split (a few indicators are reported total-only).
STATE_TRAILING_VALUES = re.compile(rf"^(.*?)\s+{VAL}\s+{VAL}\s+{VAL}\s+{VAL}\s*$")
UNIT_RE = re.compile(r"\(([^()]*)\)\s*$")  # last parenthetical on the label = unit, when present


def parse_value(tok: str) -> tuple[float | None, bool]:
    """Returns (value, small_sample_flag)."""
    tok = tok.strip()
    if tok == "*":
        return None, True
    small = tok.startswith("(") and tok.endswith(")")
    if small:
        tok = tok[1:-1]
    try:
        return float(tok), small
    except ValueError:
        return None, False


def try_resolve(buf_lines: list[str], is_state: bool):
    """If the buffer so far already ends in a valid value pair (or state-page
    value quad), return the match -- used to flush EAGERLY the moment an entry
    completes, so a stray line arriving after it (a category header, page
    furniture) never gets appended and corrupts an otherwise-complete entry."""
    joined = " ".join(l.strip() for l in buf_lines if l.strip())
    joined = re.sub(r"\s+", " ", joined).strip()
    if is_state:
        m = STATE_TRAILING_VALUES.match(joined)
        if m:
            return m
    return TRAILING_VALUES.match(joined)


def flush(buf_num: int | None, buf_lines: list[str], state: str | None, district: str | None,
          district_rows: list, state_rows: list):
    if buf_num is None or not buf_lines:
        return
    m = try_resolve(buf_lines, is_state=district is None)
    if not m:
        return  # header-only / continuation without a resolvable value pair -- skip
    is_state_row = len(m.groups()) == 5
    if is_state_row:
        # State pages carry Urban/Rural for the CURRENT round only (2023-24) --
        # the source table doesn't print NFHS-5's own urban/rural split, only
        # its Total (for the trend comparison). District pages never have this
        # split at all -- NFHS-6's own documentation states district-level
        # rural/urban estimates aren't produced, not a parsing gap.
        label, urban_tok, rural_tok, tok6, tok5 = m.group(1).strip(), m.group(2), m.group(3), m.group(4), m.group(5)
        urban_v, urban_small = parse_value(urban_tok)
        rural_v, rural_small = parse_value(rural_tok)
    else:
        label, tok6, tok5 = m.group(1).strip(), m.group(2), m.group(3)
        urban_v = rural_v = urban_small = rural_small = None
    v6, small6 = parse_value(tok6)
    v5, small5 = parse_value(tok5)
    unit_m = UNIT_RE.search(label)
    unit = unit_m.group(1) if unit_m else None
    row = {
        "state": state, "district": district, "num": buf_num,
        "indicator": label, "unit": unit,
        "nfhs6": v6, "nfhs6_small_sample": small6,
        "nfhs5": v5, "nfhs5_small_sample": small5,
    }
    if is_state_row:
        row["nfhs6_urban"] = urban_v
        row["nfhs6_urban_small_sample"] = urban_small
        row["nfhs6_rural"] = rural_v
        row["nfhs6_rural_small_sample"] = rural_small
    (district_rows if district else state_rows).append(row)


def parse_pdf_text(text: str, district_rows: list, state_rows: list):
    state, district = None, None
    buf_num, buf_lines = None, []

    for raw in text.split("\n"):
        line = raw.rstrip()
        if not line.strip():
            continue

        dm = DISTRICT_HEADER.match(line)
        if dm:
            flush(buf_num, buf_lines, state, district, district_rows, state_rows)
            buf_num, buf_lines = None, []
            district, state = dm.group(1).strip(), dm.group(2).strip()
            continue

        sm = STATE_HEADER.match(line)
        if sm and "," not in line.split(" - Key Indicators")[0]:
            flush(buf_num, buf_lines, state, district, district_rows, state_rows)
            buf_num, buf_lines = None, []
            state, district = sm.group(1).strip(), None
            continue

        nm = NUM_LINE.match(line)
        if nm:
            flush(buf_num, buf_lines, state, district, district_rows, state_rows)
            buf_num, buf_lines = int(nm.group(1)), [nm.group(2)]
            m = try_resolve(buf_lines, is_state=district is None)
            if m:
                flush(buf_num, buf_lines, state, district, district_rows, state_rows)
                buf_num, buf_lines = None, []
            continue

        # Continuation line (wrapped indicator text, or a trailing values-only
        # line) -- only accumulate while we're inside a numbered entry AND the
        # line doesn't look like page furniture (running headers, page numbers,
        # footnotes, TOC noise, or a bare category-section title that happens to
        # follow immediately after an entry that already completed).
        if buf_num is None:
            continue
        if re.match(
            r"^\s*("
            r"NATIONAL FAMILY HEALTH SURVEY|Districts?$|Note:|Suggested citation|International Institute|"
            r"\(?NFHS-6\)?\s*,?\s*2023-24\s*$|"           # repeated report title/date
            r"(Indicators\s+)?NFHS-6.*NFHS-5\s*$|"          # repeated column header row
            r"\(2023-24\)\s+\(2019-21\)\s*$|"               # repeated year sub-header
            r"Total\s+Total\s*$|Urban\s+Rural\s+Total\s*$|" # repeated Urban/Rural/Total sub-header
            r"\d+\s*$"                                       # bare page number
            r")", line,
        ):
            continue
        buf_lines.append(line)
        m = try_resolve(buf_lines, is_state=district is None)
        if m:
            flush(buf_num, buf_lines, state, district, district_rows, state_rows)
            buf_num, buf_lines = None, []

    flush(buf_num, buf_lines, state, district, district_rows, state_rows)


def main():
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    print(f"Found {len(pdfs)} PDFs in {PDF_DIR}")
    if not pdfs:
        raise SystemExit(f"No PDFs found in {PDF_DIR}")

    district_rows, state_rows = [], []
    for i, pdf in enumerate(pdfs):
        try:
            text = subprocess.run(
                ["pdftotext", "-layout", str(pdf), "-"],
                capture_output=True, text=True, timeout=120, check=True,
            ).stdout
        except Exception as e:
            print(f"  [{i+1}/{len(pdfs)}] FAILED {pdf.name}: {e}")
            continue
        before_d, before_s = len(district_rows), len(state_rows)
        parse_pdf_text(text, district_rows, state_rows)
        n_districts = len({r["district"] for r in district_rows[before_d:]})
        print(f"  [{i+1}/{len(pdfs)}] {pdf.name[:50]:50s} +{len(district_rows)-before_d:5d} district rows "
              f"({n_districts} districts), +{len(state_rows)-before_s} state rows")

    print(f"\nTotal: {len(district_rows)} district-indicator rows, {len(state_rows)} state-indicator rows")
    n_dist = len({(r['state'], r['district']) for r in district_rows})
    n_states = len({r['state'] for r in district_rows})
    print(f"Districts covered: {n_dist} across {n_states} states")

    out = {
        "generated": __import__("datetime").datetime.now().isoformat(),
        "source": "NFHS-6 (2023-24) State and District Fact Sheet Compendiums, IIPS/MoHFW, released August 2026",
        "note": "Sanitation, cooking fuel, handwashing and anaemia are NOT published anywhere in the NFHS-6 "
                "compendiums (state or district level) -- confirmed absent, not an extraction gap. Those "
                "indicators stay NFHS-5-only elsewhere in the platform. '*' = suppressed (<25 unweighted "
                "cases); small_sample=true = shown in parentheses in the source (25-49 unweighted cases, "
                "use with caution).",
        "district_rows": district_rows,
        "state_rows": state_rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"\nSaved {OUT} ({OUT.stat().st_size / 1024 / 1024:.1f}MB)")

    write_csv(OUT_DISTRICT_CSV, district_rows, ["State", "District"])
    print(f"Saved {OUT_DISTRICT_CSV} ({OUT_DISTRICT_CSV.stat().st_size / 1024 / 1024:.1f}MB) -- open directly in Excel/Sheets")
    write_csv(OUT_STATE_CSV, state_rows, ["State"], with_urban_rural=True)
    print(f"Saved {OUT_STATE_CSV} ({OUT_STATE_CSV.stat().st_size / 1024:.0f}KB)")


def write_csv(path: Path, rows: list, id_cols: list[str], with_urban_rural: bool = False):
    """id_cols is ["State", "District"] for district rows, ["State"] for state rows
    (district is always None there, so no District column). with_urban_rural adds
    the NFHS-6 Urban/Rural columns -- state rows only; district tables don't carry
    this split at all (NFHS-6's own documentation: not produced at district level)."""
    id_keys = [c.lower() for c in id_cols]
    extra_cols = ["NFHS 6 Urban", "NFHS 6 Rural"] if with_urban_rural else []
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(id_cols + ["Indicator No.", "Indicator", "Unit",
                               "NFHS 6", "NFHS 6 Small Sample"] + extra_cols +
                    ["NFHS 5", "NFHS 5 Small Sample", "Delta (6-5)"])
        for r in rows:
            delta = round(r["nfhs6"] - r["nfhs5"], 2) if r["nfhs6"] is not None and r["nfhs5"] is not None else ""
            extra_vals = [
                r.get("nfhs6_urban") if r.get("nfhs6_urban") is not None else "",
                r.get("nfhs6_rural") if r.get("nfhs6_rural") is not None else "",
            ] if with_urban_rural else []
            w.writerow(
                [r[k] for k in id_keys] + [
                    r["num"], r["indicator"], r["unit"] or "",
                    r["nfhs6"] if r["nfhs6"] is not None else "",
                    "Y" if r["nfhs6_small_sample"] else "",
                ] + extra_vals + [
                    r["nfhs5"] if r["nfhs5"] is not None else "",
                    "Y" if r["nfhs5_small_sample"] else "",
                    delta,
                ]
            )


if __name__ == "__main__":
    main()
