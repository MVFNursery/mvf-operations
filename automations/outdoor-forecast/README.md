# MVF Nursery — Outdoor Work Forecast
**Mountain View Farm Nursery | Halifax, PA 17032**

A daily automated workflow that pulls a 14-day weather forecast for Halifax, PA, scores each day against configurable outdoor work criteria, and delivers a color-coded HTML email each morning at 6:00 AM.

Built on n8n. Portable to any platform or self-hosted environment.

---

## What It Does

Every morning, the workflow:
1. Fetches a 14-day forecast from Open-Meteo for Halifax, PA (lat: 40.4672, lon: -76.9253)
2. Scores each day 0–100 using weighted weather signals and hard caps
3. Assigns each day a band: **Prime**, **Good**, **Marginal**, or **Indoor**
4. Sends a single HTML email to the operator with the full forecast table

---

## Repo Structure

```
automations/
  outdoor-forecast/
    outdoor_work_forecast_v1.json   ← n8n workflow export (import to restore)
    outdoor_forecast_scoring.js     ← scoring engine, standalone and documented
    README.md                       ← this file
```

---

## Scoring Logic

### Weighted Signals (0–100 each)

| Signal | Weight | Notes |
|---|---|---|
| Precipitation probability | 35% | Linear. 0% chance = 100pts, 100% chance = 0pts |
| Apparent temperature (feels-like) | 30% | Month-aware range. Penalized outside ideal range. |
| Wind speed | 20% | Stepped thresholds. See caps below. |
| Humidity | 15% | Optimal at 50%. Penalized in both directions. |

### Hard Caps (applied after weighted score)

These are absolute ceilings that override the weighted score regardless of other signals. Applied in this order:

| Condition | Cap |
|---|---|
| Rain > 0.3in OR precip hours > 4 | Score = 0, Indoor (veto) |
| Feels-like below monthly floor (see table) | Max 25, Indoor |
| Feels-like below 32°F | Max 59, Marginal |
| Feels-like below 40°F | Max 79, Good (no Prime) |
| Feels-like above 95°F | Max 59, Marginal |
| Feels-like above 103°F | Max 35, Indoor |
| Wind > 25mph | Max 25, Indoor |
| Wind > 20mph | Max 45, Marginal |
| Wind 16–20mph | Max 65, Good lower end |
| Wind > 22mph AND feels-like < 45°F (Mar–Apr) | Max 35, Indoor |
| Wind > 18mph AND feels-like < 45°F (May–Oct) | Max 35, Indoor |

### Monthly Feels-Like Floors

Minimum apparent temperature to perform outdoor nursery work. Below this threshold the day is capped at Indoor regardless of other conditions.

| Months | Min Feels-Like |
|---|---|
| Jan, Feb | 25°F |
| Mar, Apr | 28°F |
| May, Jun | 40°F |
| Jul, Aug | 55°F |
| Sep, Oct | 35°F |
| Nov, Dec | 28°F |

### Monthly Comfortable Temp Ranges

Used for scoring only (not hard caps). Apparent temp inside range scores 100pts on the temp signal.

| Month | Range (°F) | Month | Range (°F) |
|---|---|---|---|
| Jan | 30–55 | Jul | 62–90 |
| Feb | 32��58 | Aug | 65–92 |
| Mar | 38–72 | Sep | 55–85 |
| Apr | 45–78 | Oct | 45–78 |
| May | 50–82 | Nov | 38–68 |
| Jun | 58–88 | Dec | 30–55 |

### Band Definitions

| Band | Score | Color |
|---|---|---|
| Prime | 80–100 | Green `#C8E6C9` |
| Good | 60–79 | Teal `#B2DFDB` |
| Marginal | 40–59 | Yellow `#FFF9C4` |
| Indoor | 0–39 | Pink `#FFCDD2` |

---

## Configuration

All tunable values live in the **Config node** (n8n Set node). No code changes needed to adjust thresholds — edit the Config node only.

| Parameter | Value |
|---|---|
| Latitude | 40.4672 |
| Longitude | -76.9253 |
| Timezone | America/New_York |
| Forecast days | 14 |
| Weights | precip: 0.35, temp: 0.30, wind: 0.20, humidity: 0.15 |

---

## External Dependencies

| Service | Auth | Notes |
|---|---|---|
| [Open-Meteo](https://open-meteo.com) | None — free, no API key | Public forecast API. Highly reliable. |
| Gmail | Google OAuth2 | Scope: `https://www.googleapis.com/auth/gmail.send` |

---

## n8n Setup

### Import workflow
1. Open n8n (cloud or self-hosted)
2. New workflow → three-dot menu → **Import from file**
3. Select `outdoor_work_forecast_v1.json`
4. Reconnect Gmail credential (OAuth2 → sign in with Google)
5. Verify Config node values
6. Set workflow to **Active**

### Requirements
- n8n Cloud (current) or self-hosted n8n (planned — see Roadmap)
- Google account with Gmail enabled
- No other paid services required

---

## Roadmap

### v2 — Google Calendar Integration
- Color-coded all-day calendar events per day
- First 5 days: solid color (actionable)
- Days 6–14: faded color (informational awareness)
- Deduplication logic to prevent duplicate events on re-run

### v3 — Hourly Data Upgrade
- Switch from daily max values to hourly Open-Meteo data
- Enable AM/PM split detection in notes field
- Example: "Rain clearing by noon, afternoon workable"
- Post-rain ground saturation flag for following day

### v4 — Self-Hosted Migration
- Migrate from n8n Cloud to self-hosted n8n instance
- All workflows portable via JSON export — no rebuild required
- Aligns with broader on-premises tooling goal

### Future Considerations
- Soil moisture signal (`soil_moisture_0_to_1cm`) from Open-Meteo — directly relevant for planting and container work
- UV index warnings for peak summer days
- Task-type sub-bands (heavy labor vs. light tasks) once scoring is well-calibrated

---

## Version History

| Version | Date | Notes |
|---|---|---|
| v1.0 | March 2026 | Initial release. Gmail output. 14-day forecast. Weighted scoring with hard caps. |

---

*MVF Nursery — Mountain View Farm Nursery, Halifax, PA*
*Named for the Mountain View Farm of my wife's grandparents.*