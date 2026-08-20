// Run at https://code.earthengine.google.com/
// Computes 7 hazard frequency rasters from 30 years of CHIRPS + ERA5 data.
// Exports 7 GeoTIFFs to Drive/ClimResWASH/climatology/

var india = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'India'));
var aoi = india.geometry();
var bounds = aoi.bounds();

var START = '1991-01-01';
var END   = '2021-01-01';
var YEARS = 30;

// ═══════════════════════════════════════════════════════════════════
// 1. FLOOD FREQUENCY — days/yr with rainfall > 50mm (CHIRPS)
// ═══════════════════════════════════════════════════════════════════
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterDate(START, END)
  .filterBounds(aoi);

var flood_days = chirps.map(function(img) {
  return img.select('precipitation').gt(50).rename('flood_day');
}).sum().divide(YEARS).clip(aoi);

var extreme_days = chirps.map(function(img) {
  return img.select('precipitation').gt(100).rename('extreme_day');
}).sum().divide(YEARS).clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// 2. DROUGHT FREQUENCY — fraction of months with rain < 50% of mean (CHIRPS)
// ═══════════════════════════════════════════════════════════════════
var monthly_rain = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterDate(START, END)
  .filterBounds(aoi);

// Compute monthly sums
var months = ee.List.sequence(0, YEARS * 12 - 1);
var monthly_sums = ee.ImageCollection(months.map(function(m) {
  var start = ee.Date(START).advance(m, 'month');
  var end = start.advance(1, 'month');
  return chirps.filterDate(start, end).sum()
    .set('month_of_year', start.get('month'))
    .set('system:time_start', start.millis());
}));

// Climatological monthly means
var clim_means = ee.ImageCollection(ee.List.sequence(1, 12).map(function(mon) {
  return monthly_sums.filter(ee.Filter.eq('month_of_year', mon)).mean()
    .set('month_of_year', mon);
}));

// Count months below 50% of climatological mean
var drought_count = monthly_sums.map(function(img) {
  var mon = img.get('month_of_year');
  var clim = clim_means.filter(ee.Filter.eq('month_of_year', mon)).first();
  return img.lt(clim.multiply(0.5)).rename('drought_month');
}).sum();

var drought_freq = drought_count.divide(YEARS * 12).clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// 3. HEAT FREQUENCY — days/yr with T_max > 40°C and > 45°C (ERA5-Land)
// ═══════════════════════════════════════════════════════════════════
var era5 = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
  .filterDate(START, END)
  .filterBounds(aoi);

var heat_days = era5.map(function(img) {
  return img.select('temperature_2m_max').subtract(273.15).gt(40).rename('heat_day');
}).sum().divide(YEARS).clip(aoi);

var severe_heat_days = era5.map(function(img) {
  return img.select('temperature_2m_max').subtract(273.15).gt(45).rename('severe_heat_day');
}).sum().divide(YEARS).clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// 4. HIGH WIND FREQUENCY — days/yr with wind > 60 km/h (ERA5)
// ═══════════════════════════════════════════════════════════════════
var era5_wind = ee.ImageCollection('ECMWF/ERA5/DAILY')
  .filterDate(START, END)
  .filterBounds(aoi)
  .select(['u_component_of_wind_10m', 'v_component_of_wind_10m']);

var wind_days = era5_wind.map(function(img) {
  var u = img.select('u_component_of_wind_10m');
  var v = img.select('v_component_of_wind_10m');
  var speed_kmh = u.pow(2).add(v.pow(2)).sqrt().multiply(3.6);
  return speed_kmh.gt(60).rename('wind_day');
}).sum().divide(YEARS).clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// 5. WET-BULB FREQUENCY — days/yr with T_wb > 35°C (ERA5-Land)
//    Simplified: T_wb ≈ T when RH is very high; use dewpoint approach
//    35°C = human-survivability limit (Raymond et al. 2020), matching the
//    score=10 endpoint of the live wet_bulb_score() formula in
//    scripts/risk/formulas.py. Was wrongly 28°C (that formula's ZERO point,
//    not its dangerous cutoff) -- inflated this frequency raster and, via
//    gee_future_climatology.js which mirrors this threshold for delta-change,
//    the 2030/2050 wet-bulb day-count projections too.
// ═══════════════════════════════════════════════════════════════════
var wb_days = era5.map(function(img) {
  var t = img.select('temperature_2m_max').subtract(273.15);
  var td = img.select('dewpoint_temperature_2m').subtract(273.15);
  // Simple wet-bulb approximation: Tw ≈ T × atan(0.152 × sqrt(RH+8.3)) + ...
  // For frequency counting, use simplified: Tw ≈ T - (T-Td)/3
  var tw = t.subtract(t.subtract(td).divide(3));
  return tw.gt(35).rename('wb_day');
}).sum().divide(YEARS).clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// Preview
// ═══════════════════════════════════════════════════════════════════
Map.centerObject(aoi, 5);
Map.addLayer(flood_days, {min: 0, max: 15, palette: ['white','blue','darkblue']}, 'Flood freq (days/yr >50mm)');
Map.addLayer(heat_days, {min: 0, max: 60, palette: ['white','orange','red']}, 'Heat freq (days/yr >40°C)');
Map.addLayer(drought_freq, {min: 0, max: 0.5, palette: ['white','yellow','brown']}, 'Drought freq');

// ═══════════════════════════════════════════════════════════════════
// Export all 7 rasters
// ═══════════════════════════════════════════════════════════════════
var exports = [
  {img: flood_days,        name: 'flood_freq',         scale: 5000},
  {img: extreme_days,      name: 'extreme_rain_freq',  scale: 5000},
  {img: heat_days,         name: 'heat_freq',          scale: 11000},
  {img: severe_heat_days,  name: 'severe_heat_freq',   scale: 11000},
  {img: drought_freq,      name: 'drought_freq',       scale: 5000},
  {img: wind_days,         name: 'high_wind_freq',     scale: 11000},
  {img: wb_days,           name: 'wet_bulb_freq',      scale: 11000},
];

exports.forEach(function(j) {
  Export.image.toDrive({
    image: j.img.toFloat(),
    description: j.name,
    folder: 'ClimResWASH/climatology',
    fileNamePrefix: j.name,
    region: bounds,
    scale: j.scale,
    maxPixels: 1e13
  });
});
