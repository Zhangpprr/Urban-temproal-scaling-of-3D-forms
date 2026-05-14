import csv
import json
from pathlib import Path


# ============================================================
# Paths
# ============================================================
ROOT = Path(__file__).resolve().parent

GEOJSON_PATH = ROOT / "site" / "data" / "cities.geojson"

# Try possible locations for the exported web regime table
CSV_CANDIDATES = [
    ROOT / "beta_regimes_for_web.csv",
    ROOT.parent / "Figure" / "beta_regimes_for_web.csv",
    ROOT.parent / "Data" / "beta_regimes_for_web.csv",
]

CSV_PATH = None
for p in CSV_CANDIDATES:
    if p.exists():
        CSV_PATH = p
        break

if CSV_PATH is None:
    raise FileNotFoundError(
        "Cannot find beta_regimes_for_web.csv. Checked:\n"
        + "\n".join(str(p) for p in CSV_CANDIDATES)
    )


# ============================================================
# Helpers
# ============================================================
def clean_id(x):
    if x is None or x == "":
        return None

    try:
        xf = float(x)
        if xf.is_integer():
            return str(int(xf))
    except Exception:
        pass

    return str(x).strip()


def to_float_or_none(x):
    if x is None or x == "":
        return None
    try:
        return float(x)
    except Exception:
        return None


def round_or_none(x, ndigits=4):
    x = to_float_or_none(x)
    if x is None:
        return None
    return round(x, ndigits)


# ============================================================
# Read exported regime CSV
# ============================================================
print(f"Reading regime CSV: {CSV_PATH}")

lookup = {}

with open(CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)

    required = ["fid", "beta_A", "beta_V", "beta_h", "regime_key", "regime_label", "regime_color"]
    missing = [c for c in required if c not in reader.fieldnames]

    if missing:
        raise ValueError(f"CSV missing columns: {missing}")

    for row in reader:
        fid = clean_id(row.get("fid"))

        if fid is None:
            continue

        regime_key = row.get("regime_key", "")
        regime_label = row.get("regime_label", "")
        regime_color = row.get("regime_color", "#bdbdbd")

        lookup[fid] = {
            "beta_A": round_or_none(row.get("beta_A")),
            "beta_V": round_or_none(row.get("beta_V")),
            "beta_h": round_or_none(row.get("beta_h")),
            "rel_A": row.get("rel_A", ""),
            "rel_V": row.get("rel_V", ""),
            "regime_key": regime_key,
            "regime_label": regime_label,
            "regime_color": regime_color,
            "color": regime_color,
            "beta_group": regime_key,
            "beta_group_label": regime_label,
            "beta_A_prob_gt1": round_or_none(row.get("beta_A_prob_gt1")),
            "beta_A_prob_lt1": round_or_none(row.get("beta_A_prob_lt1")),
            "beta_V_prob_gt1": round_or_none(row.get("beta_V_prob_gt1")),
            "beta_V_prob_lt1": round_or_none(row.get("beta_V_prob_lt1")),
            "n_points": round_or_none(row.get("n_points"), 0),
            "n_boot_valid": round_or_none(row.get("n_boot_valid"), 0),
        }

print(f"Valid lookup rows: {len(lookup)}")


# ============================================================
# Update cities.geojson
# ============================================================
if not GEOJSON_PATH.exists():
    raise FileNotFoundError(f"Cannot find cities.geojson: {GEOJSON_PATH}")

print(f"Reading GeoJSON: {GEOJSON_PATH}")

with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
    geo = json.load(f)

matched = 0
unmatched = 0

for feature in geo["features"]:
    props = feature.setdefault("properties", {})
    fid = clean_id(props.get("fid"))

    if fid in lookup:
        props.update(lookup[fid])
        matched += 1
    else:
        props["regime_key"] = "No data"
        props["regime_label"] = "No data"
        props["regime_color"] = "#bdbdbd"
        props["color"] = "#bdbdbd"
        props["beta_group"] = "No data"
        props["beta_group_label"] = "No data"
        unmatched += 1

with open(GEOJSON_PATH, "w", encoding="utf-8") as f:
    json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))

print("\nDone.")
print(f"Updated file: {GEOJSON_PATH}")
print(f"Matched cities: {matched}")
print(f"Unmatched cities: {unmatched}")