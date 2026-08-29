#!/bin/bash
# Daily forecast refresh — run via cron or Replit scheduled task
# Usage: bash scripts/refresh_forecast.sh
# Cron:  0 6 * * * cd /path/to/climreswash && bash scripts/refresh_forecast.sh >> logs/forecast.log 2>&1

set -e
cd "$(dirname "$0")/.."

echo "$(date): Starting river discharge refresh..."
python scripts/fetch_river_forecast.py
echo "$(date): River refresh complete. $(du -h client/public/data/river_forecast.json | cut -f1)"

# River forecast must run first: compute_forecast.py fuses river discharge into
# the hex flood score (see fluvial_flood_bonus in compute_forecast.py) and reads
# whatever river_forecast.json is on disk at the time it runs.
echo "$(date): Starting forecast refresh..."
python scripts/compute_forecast.py
echo "$(date): Forecast refresh complete. $(du -h client/public/data/forecast_risk.json | cut -f1)"
