// Run at https://code.earthengine.google.com/
// Monthly climatology V2: exports 12-month rasters for CHIRPS + ERA5.
// Each export is a 12-band image (one band per month Jan-Dec).
// Replaces the seasonal-factor approximation in compute_monthly_climatology.py
// with real per-pixel monthly data.
//
// Exports to Drive/ClimResWASH/monthly_climatology/
// Expected outputs (12-band GeoTIFFs):
//   flood_freq_monthly.tif        — days/month with rainfall > 50mm
//   extreme_rain_freq_monthly.tif — days/month with rainfall > 100mm
//   heat_freq_monthly.tif         — days/month with T_max > 40°C
//   wet_bulb_freq_monthly.tif     — days/month with T_wb > 28°C
//   drought_freq_monthly.tif      — fraction of months dry (by month-of-year)
//   rainfall_mean_monthly.tif     — mean monthly rainfall (mm/month) — for intensity

var india = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'India'));
var aoi = india.geometry();
var bounds = aoi.bounds();

var START = '1991-01-01';
var END   = '2021-01-01';
var YEARS = 30;

var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterDate(START, END).filterBounds(aoi);
var era5   = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
  .filterDate(START, END).filterBounds(aoi);

// ═══════════════════════════════════════════════════════════════════
// Helper: compute monthly climatology for a frequency condition
// Returns 12-band image, one per calendar month (Jan=band 1, Dec=band 12)
// ═══════════════════════════════════════════════════════════════════
function monthlyFreq(collection, condition, unit) {
  var months = ee.List.sequence(1, 12);
  var bands = months.map(function(mon) {
    // Filter to this calendar month across all years
    var filtered = collection.filter(ee.Filter.calendarRange(mon, mon, 'month'));
    // Count days meeting the condition, normalize to per-year
    var freq = filtered.map(function(img) {
      return condition(img).rename('val');
    }).sum().divide(YEARS);
    return freq.rename('month_' + mon);
  });
  return ee.ImageCollection(bands).toBands()
    .rename(ee.List.sequence(1, 12).map(function(m) {
      return ee.String('month_').cat(ee.Number(m).format('%d'));
    }));
}

function monthlyMean(collection, selector, unit) {
  var months = ee.List.sequence(1, 12);
  var bands = months.map(function(mon) {
    var filtered = collection.filter(ee.Filter.calendarRange(mon, mon, 'month'));
    var mean = filtered.select(selector).mean();
    return mean.rename('month_' + mon);
  });
  return ee.ImageCollection(bands).toBands();
}

// ═══════════════════════════════════════════════════════════════════
// 1. Flood frequency: days/month with rainfall > 50mm
// ═══════════════════════════════════════════════════════════════════
var floodFreqMonthly = monthlyFreq(
  chirps,
  function(img) { return img.select('precipitation').gt(50); },
  'days'
).clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// 2. Extreme rain frequency: days/month with rainfall > 100mm
// ═══════════════════════════════════════════════════════════════════
var extremeRainMonthly = monthlyFreq(
  chirps,
  function(img) { return img.select('precipitation').gt(100); },
  'days'
).clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// 3. Mean monthly rainfall (mm/month): for intensity calculation
// ═══════════════════════════════════════════════════════════════════
var months12 = ee.List.sequence(1, 12);
var rainfallMonthly = ee.ImageCollection(months12.map(function(mon) {
  var filtered = chirps.filter(ee.Filter.calendarRange(mon, mon, 'month'));
  // Monthly sum per year, then average across years
  var annualSums = ee.ImageCollection(ee.List.sequence(1991, 2020).map(function(yr) {
    var start = ee.Date.fromYMD(yr, mon, 1);
    var end   = start.advance(1, 'month');
    return chirps.filterDate(start, end).select('precipitation').sum()
      .set('year', yr);
  }));
  return annualSums.mean().rename('month_' + mon);
})).toBands().clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// 4. Heat frequency: days/month with T_max > 40°C
// ═══════════════════════════════════════════════════════════════════
var heatFreqMonthly = monthlyFreq(
  era5,
  function(img) {
    return img.select('temperature_2m_max').subtract(273.15).gt(40);
  },
  'days'
).clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// 5. Wet-bulb frequency: days/month with T_wb > 28°C
//    Approximation: T_wb ≈ T - (T - T_dew) / 3
// ═══════════════════════════════════════════════════════════════════
var wbFreqMonthly = monthlyFreq(
  era5,
  function(img) {
    var t  = img.select('temperature_2m_max').subtract(273.15);
    var td = img.select('dewpoint_temperature_2m').subtract(273.15);
    var tw = t.subtract(t.subtract(td).divide(3));
    return tw.gt(28);
  },
  'days'
).clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// 6. Drought by month: fraction of years where monthly rain < 50% of mean
// ═══════════════════════════════════════════════════════════════════
// First compute climatological monthly means
var climMonthlyMean = ee.ImageCollection(months12.map(function(mon) {
  var filtered = ee.ImageCollection(ee.List.sequence(1991, 2020).map(function(yr) {
    var start = ee.Date.fromYMD(yr, mon, 1);
    var end   = start.advance(1, 'month');
    return chirps.filterDate(start, end).select('precipitation').sum();
  }));
  return filtered.mean().set('month_of_year', mon);
}));

// Then count fraction of years dry per calendar month
var droughtMonthly = ee.ImageCollection(months12.map(function(mon) {
  var clim = climMonthlyMean.filter(ee.Filter.eq('month_of_year', mon)).first();
  var dryYears = ee.ImageCollection(ee.List.sequence(1991, 2020).map(function(yr) {
    var start = ee.Date.fromYMD(yr, mon, 1);
    var end   = start.advance(1, 'month');
    var monthSum = chirps.filterDate(start, end).select('precipitation').sum();
    return monthSum.lt(clim.multiply(0.5)).rename('dry');
  })).sum().divide(YEARS).rename('month_' + mon);
  return dryYears;
})).toBands().clip(aoi);

// ═══════════════════════════════════════════════════════════════════
// Preview
// ═══════════════════════════════════════════════════════════════════
Map.centerObject(aoi, 5);
Map.addLayer(floodFreqMonthly.select('0_month_6'), {min:0, max:5, palette:['white','blue','darkblue']}, 'Flood freq June');
Map.addLayer(floodFreqMonthly.select('0_month_7'), {min:0, max:5, palette:['white','blue','darkblue']}, 'Flood freq July');
Map.addLayer(heatFreqMonthly.select('0_month_5'), {min:0, max:10, palette:['white','orange','red']}, 'Heat freq May');
Map.addLayer(rainfallMonthly.select('0_month_7'), {min:0, max:500, palette:['white','cyan','blue']}, 'Rain mean July');

// ═══════════════════════════════════════════════════════════════════
// Export all (12-band rasters)
// ═══════════════════════════════════════════════════════════════════
var exportList = [
  {img: floodFreqMonthly,    name: 'flood_freq_monthly',         scale: 5000},
  {img: extremeRainMonthly,  name: 'extreme_rain_freq_monthly',  scale: 5000},
  {img: rainfallMonthly,     name: 'rainfall_mean_monthly',      scale: 5000},
  {img: heatFreqMonthly,     name: 'heat_freq_monthly',          scale: 11000},
  {img: wbFreqMonthly,       name: 'wet_bulb_freq_monthly',      scale: 11000},
  {img: droughtMonthly,      name: 'drought_freq_monthly',       scale: 5000},
];

exportList.forEach(function(j) {
  Export.image.toDrive({
    image: j.img.toFloat(),
    description: j.name,
    folder: 'ClimResWASH/monthly_climatology',
    fileNamePrefix: j.name,
    region: bounds,
    scale: j.scale,
    maxPixels: 1e13,
  });
});

// NOTE: After downloading, run:
//   python scripts/compute_monthly_climatology.py --mode=raster
// to use real monthly rasters instead of seasonal distribution factors.
// Real rasters provide per-pixel monthly variation vs. zone-based approximation.
