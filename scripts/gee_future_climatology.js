// Run at https://code.earthengine.google.com/
// Computes future hazard frequency rasters from CMIP6 ensemble (NASA/GDDP-CMIP6).
// Uses SAME thresholds as baseline (gee_climatology.js) for delta-change.
// Exports: historical ref (1995-2014) + 4 future sets (SSP245/585 × 2030/2050)

var india = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'India'));
var aoi = india.geometry();
var bounds = aoi.bounds();

// ═══ Model ensemble (5 CMIP6 models for robustness) ═══
var MODELS = ['ACCESS-CM2', 'MPI-ESM1-2-HR', 'EC-Earth3', 'MRI-ESM2-0', 'GFDL-ESM4'];

// ═══ Periods ═══
var PERIODS = {
  'hist_ref':    {start: '1995-01-01', end: '2015-01-01', years: 20},
  'ssp245_2030': {start: '2021-01-01', end: '2041-01-01', years: 20, scenario: 'ssp245'},
  'ssp245_2050': {start: '2041-01-01', end: '2061-01-01', years: 20, scenario: 'ssp245'},
  'ssp585_2030': {start: '2021-01-01', end: '2041-01-01', years: 20, scenario: 'ssp585'},
  'ssp585_2050': {start: '2041-01-01', end: '2061-01-01', years: 20, scenario: 'ssp585'},
};

// ═══ Thresholds — MUST match baseline gee_climatology.js exactly ═══
var FLOOD_THRESH = 50;       // mm/day
var EXTREME_RAIN_THRESH = 100;
var HEAT_THRESH_C = 40;      // °C (tasmax in K in CMIP6, subtract 273.15)
var SEVERE_HEAT_THRESH_C = 45;
var WET_BULB_THRESH_C = 28;

// ═══ Function: compute frequencies for a period ═══
function computeFreqs(periodKey) {
  var period = PERIODS[periodKey];
  var scenario = period.scenario || 'historical';
  var years = period.years;

  // Build ensemble collection
  var collections = MODELS.map(function(model) {
    return ee.ImageCollection('NASA/GDDP-CMIP6')
      .filter(ee.Filter.eq('model', model))
      .filter(ee.Filter.eq('scenario', scenario))
      .filterDate(period.start, period.end)
      .filterBounds(aoi);
  });

  var ensemble = ee.ImageCollection(collections[0])
    .merge(collections[1]).merge(collections[2])
    .merge(collections[3]).merge(collections[4]);

  // Flood: days with pr > threshold (pr is in kg/m²/s → mm/day = pr × 86400)
  var flood_days = ensemble.map(function(img) {
    return img.select('pr').multiply(86400).gt(FLOOD_THRESH).rename('flood');
  }).sum().divide(years * MODELS.length).clip(aoi);

  var extreme_days = ensemble.map(function(img) {
    return img.select('pr').multiply(86400).gt(EXTREME_RAIN_THRESH).rename('extreme');
  }).sum().divide(years * MODELS.length).clip(aoi);

  // Heat: tasmax in K → °C
  var heat_days = ensemble.map(function(img) {
    return img.select('tasmax').subtract(273.15).gt(HEAT_THRESH_C).rename('heat');
  }).sum().divide(years * MODELS.length).clip(aoi);

  var severe_heat_days = ensemble.map(function(img) {
    return img.select('tasmax').subtract(273.15).gt(SEVERE_HEAT_THRESH_C).rename('severe_heat');
  }).sum().divide(years * MODELS.length).clip(aoi);

  // Wet bulb: simplified Tw ≈ T - (T-Td)/3; use huss (specific humidity) as proxy
  // For CMIP6, use simplified: if tasmax > 35 and high humidity → Tw > 28
  // Actually use near-surface temp + humidity: Tw ≈ tasmax × 0.7 + dewpoint × 0.3
  // Simpler: just count tasmax > 35 AND hurs (if available) > 70
  // NASA/GDDP-CMIP6 has tasmax but not always hurs; use tasmin as dewpoint proxy
  var wb_days = ensemble.map(function(img) {
    var t = img.select('tasmax').subtract(273.15);
    var tn = img.select('tasmin').subtract(273.15);
    // Simplified wet-bulb: Tw ≈ T - (T - Tn)/3
    var tw = t.subtract(t.subtract(tn).divide(3));
    return tw.gt(WET_BULB_THRESH_C).rename('wb');
  }).sum().divide(years * MODELS.length).clip(aoi);

  return {
    flood: flood_days,
    extreme_rain: extreme_days,
    heat: heat_days,
    severe_heat: severe_heat_days,
    wet_bulb: wb_days,
  };
}

// ═══ Compute and export for each period ═══
var METRICS = ['flood', 'extreme_rain', 'heat', 'severe_heat', 'wet_bulb'];

Object.keys(PERIODS).forEach(function(periodKey) {
  print('Computing: ' + periodKey);
  var freqs = computeFreqs(periodKey);

  METRICS.forEach(function(metric) {
    var name = periodKey + '_' + metric + '_freq';
    Export.image.toDrive({
      image: freqs[metric].toFloat(),
      description: name,
      folder: 'ClimResWASH/climatology_future',
      fileNamePrefix: name,
      region: bounds,
      scale: 25000,  // ~25km (CMIP6 native resolution)
      maxPixels: 1e13,
    });
  });
});

// Preview (historical reference heat)
var hist = computeFreqs('hist_ref');
Map.centerObject(aoi, 5);
Map.addLayer(hist.heat, {min: 0, max: 60, palette: ['white','orange','red']}, 'Hist ref: heat days/yr >40°C');

print('Export tasks ready. Go to Tasks tab → Run each one.');
print('Total: ' + (Object.keys(PERIODS).length * METRICS.length) + ' rasters');
