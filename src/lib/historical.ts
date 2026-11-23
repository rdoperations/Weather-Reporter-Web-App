// Historical weather download: fetches the Open-Meteo archive in chunks (so multi-year ranges
// work) and builds the Excel report in the browser (no server size / time limits).

import {
  buildChartSpecs,
  CHART_H,
  CHART_W,
  compassOf,
  computeSummary,
  monthLabel,
  renderChartPng,
  renderWindRosePng,
  ROSE_H,
  ROSE_W,
  type Thresholds,
} from "./historicalSummary";

const DAY_MS = 86_400_000;
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
/** One request covers at most this many days; longer ranges are fetched chunk by chunk. */
const CHUNK_DAYS = 366;

export type ArchiveSeries = Record<string, (number | null)[]> & { time: string[] };

export interface ArchiveResult {
  hourly: ArchiveSeries;
  timezone?: string;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Split [start, end] (YYYY-MM-DD, inclusive) into consecutive chunks of at most CHUNK_DAYS. */
export function splitRange(start: string, end: string): [string, string][] {
  const out: [string, string][] = [];
  let a = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  while (a <= last) {
    const b = Math.min(a + (CHUNK_DAYS - 1) * DAY_MS, last);
    out.push([iso(a), iso(b)]);
    a = b + DAY_MS;
  }
  return out;
}

async function fetchChunk(params: URLSearchParams): Promise<Response> {
  // Open-Meteo answers 429 when a burst of requests is too heavy: wait and retry a few times.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${ARCHIVE_URL}?${params}`);
    if (res.status !== 429 || attempt >= 3) return res;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

/** Fetch hourly archive data for any range, merging the chunks. Wind is in knots. */
export async function fetchArchive(
  lat: number,
  lon: number,
  start: string,
  end: string,
  variables: string[],
  onProgress?: (done: number, total: number) => void
): Promise<ArchiveResult> {
  const chunks = splitRange(start, end);
  const merged: ArchiveSeries = { time: [] };
  for (const v of variables) merged[v] = [];
  let timezone: string | undefined;

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i, chunks.length);
    const [a, b] = chunks[i];
    const res = await fetchChunk(
      new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        start_date: a,
        end_date: b,
        hourly: variables.join(","),
        wind_speed_unit: "kn",
        timezone: "auto",
      })
    );
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        if (j && typeof j.reason === "string") detail = ` (${j.reason})`;
      } catch {
        /* not JSON */
      }
      throw new Error(`Failed to fetch historical data from Open-Meteo Archive API${detail}.`);
    }
    const data = await res.json();
    const h = data.hourly;
    if (!h || !Array.isArray(h.time)) continue;
    timezone = timezone ?? data.timezone;
    merged.time.push(...h.time);
    for (const v of variables) {
      const col: (number | null)[] = h[v] ?? new Array(h.time.length).fill(null);
      for (const x of col) merged[v].push(x);
    }
  }
  onProgress?.(chunks.length, chunks.length);
  if (merged.time.length === 0) throw new Error("No historical data available for these dates.");
  return { hourly: merged, timezone };
}

// ─── Excel report ────────────────────────────────────────────────────────────

const WMO_EN: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle", 56: "Light freezing drizzle",
  57: "Dense freezing drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain",
  67: "Heavy freezing rain", 71: "Light snow fall", 73: "Moderate snow fall", 75: "Heavy snow fall",
  77: "Snow grains", 80: "Slight showers", 81: "Moderate showers", 82: "Violent showers", 85: "Slight snow showers",
  86: "Heavy snow showers", 95: "Thunderstorm (slight/moderate)", 96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (deg: number | null | undefined) =>
  typeof deg === "number" && Number.isFinite(deg) ? COMPASS[Math.floor(deg / 22.5 + 0.5) % 16] : "";

/** Variables the Excel report needs from the archive. */
export const EXCEL_VARIABLES = [
  "weather_code",
  "temperature_2m",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "precipitation",
  "cloud_cover",
  "pressure_msl",
];

const HEADERS = [
  "Date/Time",
  "Description",
  "Temp (°C)",
  "Humidity (%)",
  "Wind Speed (knots)",
  "Wind Gust (knots)",
  "Wind Dir",
  "Rain (mm)",
  "Cloud Cover (%)",
  "Pressure (hPa)",
];

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function buildHistoricalExcel(opts: {
  locationName: string;
  lat: number;
  lon: number;
  start: string;
  end: string;
  hourly: ArchiveSeries;
  /** Alert thresholds (same as the web app) for the "hours at or above" table. */
  thresholds: Thresholds;
}): Promise<Blob> {
  const { locationName, lat, lon, start, end, hourly } = opts;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Weather Reporter";
  await addSummarySheets(wb, opts);

  const ws = wb.addWorksheet("Historical Data", {
    views: [{ state: "frozen", ySplit: 6 }], // keep the header row visible while scrolling
  });

  const info: [string, string | null][] = [
    ["Historical Weather Report", null],
    ["Location:", locationName],
    ["Coordinates:", `Lat: ${lat}, Lon: ${lon}`],
    ["Period:", `${start} to ${end}`],
  ];
  info.forEach(([a, b], i) => styleInfoRow(ws, i + 1, a, b, 4));

  const header = ws.getRow(6);
  HEADERS.forEach((h, i) => {
    const c = header.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { horizontal: "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E8FA3" } };
  });

  const n = hourly.time.length;
  const rows: (string | number | null)[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const code = num(hourly.weather_code?.[i]);
    rows[i] = [
      hourly.time[i].replace("T", " "),
      code === null ? "" : (WMO_EN[code] ?? "N/A"),
      num(hourly.temperature_2m?.[i]),
      num(hourly.relative_humidity_2m?.[i]),
      num(hourly.wind_speed_10m?.[i]),
      num(hourly.wind_gusts_10m?.[i]),
      compass(hourly.wind_direction_10m?.[i]),
      num(hourly.precipitation?.[i]),
      num(hourly.cloud_cover?.[i]),
      num(hourly.pressure_msl?.[i]),
    ];
  }
  ws.addRows(rows);

  HEADERS.forEach((_, i) => {
    ws.getColumn(i + 1).width = i === 0 ? 22 : 15;
  });
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + n, column: HEADERS.length } };
  if (n > 0) addZebra(ws, `A7:${String.fromCharCode(64 + HEADERS.length)}${6 + n}`, 0); // first data row white

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ─── Summary + Monthly sheets ────────────────────────────────────────────────

type Workbook = import("exceljs").Workbook;

// Logo colours: green labels, orange value cells (orange text-size +2 over the default 11 pt).
const LOGO_GREEN = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF0F9748" } };
const LOGO_ORANGE = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFDB913" } };

/** Title block row (rows 1-4 of Summary and Historical Data): label in A, value in B, orange B:C. */
function styleInfoRow(ws: import("exceljs").Worksheet, row: number, label: string, value: string | null, lastCol = 3) {
  const a = ws.getCell(row, 1);
  a.value = label;
  a.font = { bold: true, color: { argb: "FFFFFFFF" } };
  a.alignment = { horizontal: "center" };
  a.fill = LOGO_GREEN;
  const b = ws.getCell(row, 2);
  if (value !== null) b.value = value.toUpperCase();
  b.font = { bold: true, size: 13 };
  b.fill = LOGO_ORANGE;
  for (let col = 3; col <= lastCol; col++) ws.getCell(row, col).fill = LOGO_ORANGE;
}
const BLUE = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF0E8FA3" } };
// Light cyan for every second data row.
const ZEBRA_ARGB = "FFD9F3F7";
const ZEBRA = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: ZEBRA_ARGB } };

/**
 * Shades even rows below the header with one conditional-format rule: the file stays small
 * (no per-cell styles) and the banding survives sorting and filtering.
 */
function addZebra(ws: import("exceljs").Worksheet, ref: string, shadedParity: 0 | 1) {
  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "expression",
        formulae: [`MOD(ROW(),2)=${shadedParity}`],
        priority: 1,
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: ZEBRA_ARGB } } },
      },
    ],
  });
}

async function addSummarySheets(
  wb: Workbook,
  o: { locationName: string; lat: number; lon: number; start: string; end: string; hourly: ArchiveSeries; thresholds: Thresholds }
) {
  const { stats, months } = computeSummary(o.hourly, o.thresholds);
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

  // ── Summary ──
  const ws = wb.addWorksheet("Summary");
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 26;
  ws.getColumn(4).width = 16;

  const title = (row: number, text: string, value?: string) => styleInfoRow(ws, row, text, value ?? null);
  title(1, "Historical Weather Summary");
  title(2, "Location:", o.locationName);
  title(3, "Coordinates:", `Lat: ${o.lat}, Lon: ${o.lon}`);
  title(4, "Period:", `${o.start} to ${o.end}`);

  let row = 6;
  const section = (name: string, cols: string[]) => {
    cols.forEach((t, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = i === 0 ? name : t;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.alignment = { horizontal: "center" };
      c.fill = BLUE;
    });
    band = 0;
    row++;
  };
  let band = 0; // alternate-row shading, restarted for every table
  const line = (label: string, value: number | string | null, extra: string | number = "", extra2?: string | number) => {
    const cols: (string | number | null)[] = [label, value === null ? "" : value, extra];
    if (extra2 !== undefined) cols.push(extra2);
    cols.forEach((val, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = val;
      c.alignment = { horizontal: i === 1 ? "right" : i >= 2 ? "center" : "left" };
      if (band % 2 === 1) c.fill = ZEBRA;
    });
    band++;
    row++;
  };
  const at = (e: { value: number; time: string; dir?: string } | null) =>
    e ? `at ${e.time}${e.dir ? ` (from ${e.dir})` : ""}` : "";

  section("Key statistics", ["", "Value", "When"]);
  line("Hours of data", stats.hours);
  line("Temperature - average (°C)", r1(stats.temp.avg));
  line("Temperature - maximum (°C)", stats.temp.max?.value ?? null, at(stats.temp.max));
  line("Temperature - minimum (°C)", stats.temp.min?.value ?? null, at(stats.temp.min));
  line("Humidity - average (%)", r1(stats.humidityAvg));
  line("Wind speed - average (knots)", r1(stats.windAvg));
  const wd = stats.windDir;
  line(
    "Wind direction - dominant (from)",
    wd.dominant ? wd.dominant.dir : null,
    wd.dominant ? `${wd.dominant.pct.toFixed(1)} % of windy hours` : ""
  );
  line(
    "Wind direction - vector mean (°)",
    wd.vectorMeanDeg === null ? null : Math.round(wd.vectorMeanDeg),
    wd.vectorMeanDeg === null ? "" : compassOf(wd.vectorMeanDeg)
  );
  line("Wind speed - maximum (knots)", stats.windMax?.value ?? null, at(stats.windMax));
  line("Wind gust - maximum (knots)", stats.gustMax?.value ?? null, at(stats.gustMax));
  line("Rain - total (mm)", r1(stats.rainTotal));
  line("Rain - maximum per hour (mm)", stats.rainMax?.value ?? null, at(stats.rainMax));
  line("Rainy hours (>= 0.1 mm/h)", stats.rainyHours);
  line("Thunderstorm hours", stats.thunderHours);
  line("Pressure - average (hPa)", r1(stats.pressureAvg));

  row++;
  section("Hours at or above alert level", ["", "Hours", "Share of period"]);
  const pct = (n: number) => (stats.hours ? `${((n / stats.hours) * 100).toFixed(1)} %` : "");
  const lvl = (label: string, values: number[], counts: number[], unit: string) =>
    values.forEach((v, k) => line(`${label} level ${k + 1} (>= ${v} ${unit})`, counts[k], pct(counts[k])));
  lvl("Wind", o.thresholds.wind, stats.exceed.wind, "kt");
  lvl("Rain", o.thresholds.rain, stats.exceed.rain, "mm/h");
  lvl("Temperature", o.thresholds.temp, stats.exceed.temp, "°C");

  row++;
  section("Wind direction frequency", ["", "Hours", "Share of windy hours", "Avg speed (kt)"]);
  for (const s of wd.sectors) line(s.dir, s.hours, wd.hours ? `${s.pct.toFixed(1)} %` : "", s.avgSpeed === null ? "" : r1(s.avgSpeed) ?? "");
  line("Windy hours counted (>= 1 kt)", wd.hours);

  row += 1;
  // Chart images (drawn in the browser; absent when generated without a DOM).
  for (const spec of buildChartSpecs(months)) {
    const png = await renderChartPng(spec);
    if (!png) continue;
    const id = wb.addImage({ buffer: png as unknown as ArrayBuffer, extension: "png" });
    ws.addImage(id, { tl: { col: 0, row: row - 1 }, ext: { width: CHART_W, height: CHART_H } });
    row += Math.ceil(CHART_H / 20) + 1;
  }
  const rose = await renderWindRosePng(wd);
  if (rose) {
    const id = wb.addImage({ buffer: rose as unknown as ArrayBuffer, extension: "png" });
    ws.addImage(id, { tl: { col: 0, row: row - 1 }, ext: { width: ROSE_W, height: ROSE_H } });
  }

  // ── Monthly ──
  const wm = wb.addWorksheet("Monthly", { views: [{ state: "frozen", ySplit: 1 }] });
  const heads = [
    "Month", "Hours", "Avg Temp (°C)", "Min Temp (°C)", "Max Temp (°C)", "Avg Humidity (%)",
    "Avg Wind (knots)", "Max Gust (knots)", "Dominant Wind Dir", "Dominant Dir (%)",
    "Total Rain (mm)", "Rainy Hours", "Thunderstorm Hours",
  ];
  heads.forEach((h, i) => {
    const c = wm.getCell(1, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { horizontal: "center" };
    c.fill = BLUE;
    wm.getColumn(i + 1).width = i === 0 ? 12 : 17;
  });
  wm.addRows(
    months.map((m) => [
      monthLabel(m.month).replace(" ", " 20"),
      m.hours,
      r1(m.tempAvg), r1(m.tempMin), r1(m.tempMax), r1(m.humidityAvg),
      r1(m.windAvg), r1(m.gustMax), m.dominantDir ?? "", r1(m.dominantDirPct),
      r1(m.rainTotal), m.rainyHours, m.thunderHours,
    ])
  );
  if (months.length > 0) addZebra(wm, `A2:${String.fromCharCode(64 + heads.length)}${1 + months.length}`, 1);
}
