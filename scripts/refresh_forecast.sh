#!/bin/bash
# Daily forecast refresh — run via cron or Replit scheduled task
# Usage: bash scripts/refresh_forecast.sh
# Cron:  0 6 * * * cd /path/to/climreswash && bash scripts/refresh_forecast.sh >> logs/forecast.log 2>&1

set -e
cd "$(dirname "$0")/.."

echo "$(date): Starting forecast refresh..."
python scripts/compute_forecast.py
echo "$(date): Forecast refresh complete."
echo "$(date): File size: $(du -h client/public/data/forecast_risk.json | cut -f1)"
