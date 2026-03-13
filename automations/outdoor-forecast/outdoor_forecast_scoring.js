/**
 * Outdoor Work Forecast — Scoring Engine
 * Native Roots PA | Halifax, PA 17032
 * Version: 1.0 — March 2026
 *
 * PURPOSE:
 * Scores each day in a 14-day Open-Meteo forecast against configurable
 * outdoor work criteria. Returns a scored array of day objects for
 * downstream email or calendar rendering.
 *
 * INPUT DEPENDENCIES:
 * - Config node (n8n Set node) providing weights and monthly_temp_ranges
 * - Open-Meteo API response with these daily fields:
 *     temperature_2m_max
 *     apparent_temperature_max
 *     apparent_temperature_min
 *     precipitation_probability_max
 *     precipitation_sum (mm)
 *     precipitation_hours
 *     windspeed_10m_max (mph)
 *     relative_humidity_2m_max
 *     uv_index_max
 *
 * SCORING WEIGHTS (stored in Config node, editable without code changes):
 *   precip:   0.35
 *   temp:     0.30
 *   wind:     0.20
 *   humidity: 0.15
 *
 * BAND DEFINITIONS:
 *   Prime:    80-100  — Ideal conditions, get outside
 *   Good:     60-79   — Solid outdoor work day
 *   Marginal: 40-59   — Doable but not ideal
 *   Indoor:   0-39    — Stay inside, plan/admin day
 *
 * HARD CAPS (applied after weighted score, in priority order):
 *   1. Precip veto: rain > 0.3in OR precip hours > 4 → score = 0, Indoor
 *   2. Monthly feels-like floor (see table below) → cap at 25 (Indoor)
 *   3. Feels-like below 32°F → cap at 59 (Marginal max)
 *   4. Feels-like below 40°F → cap at 79 (Good max, no Prime)
 *   5. Summer heat above 95°F → cap at 59 (Marginal max)
 *   6. Summer heat above 103°F → cap at 35 (Indoor max)
 *   7. Wind > 25mph → cap at 25 (Indoor)
 *   8. Wind > 20mph → cap at 45 (Marginal max)
 *   9. Wind 16-20mph → cap at 65 (Good max, lower end)
 *  10. Combined cold+wind veto:
 *        May-Oct: wind > 18mph AND feels-like < 45°F → cap at 35
 *        Mar-Apr: wind > 22mph AND feels-like < 45°F → cap at 35
 *
 * MONTHLY FEELS-LIKE FLOORS (minimum apparent temp to work outside):
 *   Jan/Feb:  25°F
 *   Mar/Apr:  28°F
 *   May/Jun:  40°F
 *   Jul/Aug:  55°F
 *   Sep/Oct:  35°F
 *   Nov/Dec:  28°F
 *
 * MONTHLY COMFORTABLE TEMP RANGES (for scoring, not hard caps):
 *   Jan: 30-55   Feb: 32-58   Mar: 38-72   Apr: 45-78
 *   May: 50-82   Jun: 58-88   Jul: 62-90   Aug: 65-92
 *   Sep: 55-85   Oct: 45-78   Nov: 38-68   Dec: 30-55
 *
 * PORTABILITY NOTES:
 * - In n8n: paste into a Code node (JavaScript mode)
 * - Standalone: replace the Config/input references at the top
 *   with direct variable assignments
 * - Open-Meteo endpoint (no API key required):
 *   GET https://api.open-meteo.com/v1/forecast
 *   ?latitude=40.4672&longitude=-76.9253
 *   &timezone=America/New_York
 *   &forecast_days=14
 *   &temperature_unit=fahrenheit
 *   &wind_speed_unit=mph
 *   &daily=temperature_2m_max,apparent_temperature_max,apparent_temperature_min,
 *          precipitation_probability_max,precipitation_sum,precipitation_hours,
 *          windspeed_10m_max,relative_humidity_2m_max,uv_index_max
 */

// ─── INPUT WIRING (n8n context) ───────────────────────────────────────────────
// When running outside n8n, replace these two lines with direct data assignment
const config = $("Config").first().json;
const weather = $input.first().json;
// ─────────────────────────────────────────────────────────────────────────────

const weights = config.weights;
const monthlyRanges = config.monthly_temp_ranges;
const scoredDays = [];

for (let i = 0; i < weather.daily.time.length; i++) {
  const date         = weather.daily.time[i];
  const temp         = weather.daily.temperature_2m_max[i];
  const apparentTemp = weather.daily.apparent_temperature_max[i];
  const precip       = weather.daily.precipitation_probability_max[i];
  const precipSum    = weather.daily.precipitation_sum[i];
  const precipHours  = weather.daily.precipitation_hours[i];
  const wind         = weather.daily.windspeed_10m_max[i];
  const humidity     = weather.daily.relative_humidity_2m_max[i];

  // Convert precipitation mm → inches
  const precipInches = precipSum / 25.4;

  // ── HARD CAP 1: Precipitation veto ────────────────────────────────────────
  const precipVeto = precipInches > 0.3 || precipHours > 4;
  if (precipVeto) {
    scoredDays.push({
      date, score: 0, band: 'Indoor',
      temp, apparentTemp, precip,
      precipInches, wind, humidity,
      notes: 'Rain likely most of the day, stay inside'
    });
    continue;
  }

  // ── Get month (1-12) ───────────────────────────────────────────────────────
  const month = new Date(date).getMonth() + 1;
  const [minTemp, maxTemp] = monthlyRanges[month];

  // ── COMPONENT SCORES (0-100 each) ─────────────────────────────────────────

  // Apparent temperature score: 100 if in monthly range, penalized outside it
  let tempScore = 100;
  if (apparentTemp < minTemp) {
    tempScore = Math.max(0, 100 - (minTemp - apparentTemp) * 5);
  } else if (apparentTemp > maxTemp) {
    tempScore = Math.max(0, 100 - (apparentTemp - maxTemp) * 5);
  }

  // Precipitation probability: linear, 100 at 0%, 0 at 100%
  const precipScore = 100 - precip;

  // Wind score: stepped thresholds
  let windScore;
  if (wind <= 10)      windScore = 100;
  else if (wind <= 15) windScore = 70;
  else if (wind <= 20) windScore = 40;
  else if (wind <= 25) windScore = 15;
  else                 windScore = 0;

  // Humidity score: optimal at 50%, penalized in both directions
  const humidityScore = Math.max(0, 100 - Math.abs(humidity - 50) * 2);

  // ── WEIGHTED SCORE ────────────────────────────────────────────────────────
  let score = Math.round(
    tempScore    * weights.temp     +
    precipScore  * weights.precip   +
    windScore    * weights.wind     +
    humidityScore * weights.humidity
  );

  // ── MONTHLY FEELS-LIKE FLOOR ──────────────────────────────────────────────
  let monthlyMinTemp;
  if      (month === 1 || month === 2)  monthlyMinTemp = 25;
  else if (month === 3 || month === 4)  monthlyMinTemp = 28;
  else if (month === 5 || month === 6)  monthlyMinTemp = 40;
  else if (month === 7 || month === 8)  monthlyMinTemp = 55;
  else if (month === 9 || month === 10) monthlyMinTemp = 35;
  else                                  monthlyMinTemp = 28; // Nov/Dec

  // HARD CAP 2: Below monthly floor → Indoor
  if (apparentTemp < monthlyMinTemp) score = Math.min(score, 25);

  // HARD CAP 3: Below freezing → Marginal max
  if (apparentTemp < 32) score = Math.min(score, 59);

  // HARD CAP 4: Below 40°F → Good max (no Prime)
  if (apparentTemp < 40) score = Math.min(score, 79);

  // HARD CAPS 5-6: Summer heat ceiling
  if      (apparentTemp > 103) score = Math.min(score, 35);
  else if (apparentTemp > 95)  score = Math.min(score, 59);

  // HARD CAP 10: Combined cold + wind veto
  if (month >= 5 && month <= 10) {
    if (wind > 18 && apparentTemp < 45) score = Math.min(score, 35);
  } else if (month === 3 || month === 4) {
    if (wind > 22 && apparentTemp < 45) score = Math.min(score, 35);
  }

  // HARD CAPS 7-9: Wind caps
  if      (wind > 25)  score = Math.min(score, 25);
  else if (wind > 20)  score = Math.min(score, 45);
  else if (wind >= 16) score = Math.min(score, 65);

  // ── BAND ASSIGNMENT ───────────────────────────────────────────────────────
  let band;
  if      (score >= 80) band = 'Prime';
  else if (score >= 60) band = 'Good';
  else if (score >= 40) band = 'Marginal';
  else                  band = 'Indoor';

  // ── NARRATIVE NOTES ───────────────────────────────────────────────────────
  let notes;
  if      (apparentTemp > 103)                                          notes = 'Extreme heat, unsafe for outdoor work';
  else if (apparentTemp > 95)                                           notes = 'Very hot, take frequent breaks and hydrate';
  else if (wind > 25)                                                   notes = 'High wind makes outdoor work difficult';
  else if (wind > 20)                                                   notes = 'Strong winds, challenging conditions';
  else if (apparentTemp < monthlyMinTemp)                               notes = 'Too cold for safe outdoor work';
  else if (apparentTemp < 32)                                           notes = 'Freezing temps, limited outdoor work possible';
  else if (wind > 18 && apparentTemp < 45 && month >= 5 && month <= 10) notes = 'Cold and windy, uncomfortable combination';
  else if (wind > 22 && apparentTemp < 45 && (month === 3 || month === 4)) notes = 'Cold and windy, uncomfortable combination';
  else if (apparentTemp < 40)                                           notes = 'Cold but calm and dry, bundle up';
  else if (wind >= 16)                                                  notes = 'Moderate wind, some tasks may be difficult';
  else if (band === 'Prime')                                            notes = 'Ideal conditions, low wind and comfortable temps';
  else if (band === 'Good')                                             notes = 'Good day for outdoor work';
  else if (band === 'Marginal')                                         notes = 'Workable but not ideal conditions';
  else                                                                  notes = 'Indoor work recommended';

  scoredDays.push({
    date, score, band,
    temp, apparentTemp,
    precip, precipInches,
    wind, humidity, notes
  });
}

return scoredDays.map(day => ({ json: day }));
