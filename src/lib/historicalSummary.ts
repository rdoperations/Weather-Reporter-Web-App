// Statistics, monthly aggregation and chart images for the historical Excel report.

import type { ArchiveSeries } from "./historical";

export interface Thresholds {
  wind: [number, number, number]; // kt
  rain: [number, number, number]; // mm/h
  temp: [number, number, number]; // °C
  /** Significant wave height levels, metres. Present only for offshore reports. */
  wave?: [number, number, number];
}

interface Extreme {
  value: number;
  time: string;
  /** Compass direction the wind came from at that moment (wind extremes only). */
  dir?: string;
}

export const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compassOf = (deg: number) => COMPASS[Math.floor(deg / 22.5 + 0.5) % 16];
/** Wind rose speed classes (kt): < 10, 10–20, 20–30, ≥ 30. */
export const ROSE_BINS = [10, 20, 30];
const binOf = (kt: number) => (kt < ROSE_BINS[0] ? 0 : kt < ROSE_BINS[1] ? 1 : kt < ROSE_BINS[2] ? 2 : 3);

export interface WindDirStats {
  /** Hours counted (valid direction and wind >= 1 kt). */
  hours: number;
  dominant: { dir: string; hours: number; pct: number } | null;
  /** Speed-weighted vector mean direction, degrees (0-360) or null when undefined. */
  vectorMeanDeg: number | null;
  /** Per compass sector: hours, share of counted hours, mean speed, hours per speed class. */
  sectors: { dir: string; hours: number; pct: number; avgSpeed: number | null; bins: number[] }[];
}

export interface Stats {
  hours: number;
  temp: { avg: number | null; max: Extreme | null; min: Extreme | null };
  humidityAvg: number | null;
  windAvg: number | null;
  windMax: Extreme | null;
  gustMax: Extreme | null;
  rainTotal: number;
  rainMax: Extreme | null;
  rainyHours: number;
  thunderHours: number;
  pressureAvg: number | null;
  exceed: { wind: number[]; rain: number[]; temp: number[] };
  windDir: WindDirStats;
  /** Significant wave height (offshore reports with wave data); null when there is none. */
  wave: { hours: number; avg: number | null; max: Extreme | null; exceed: number[] } | null;
}

export interface MonthRow {
  month: string; // YYYY-MM
  hours: number;
  tempAvg: number | null;
  tempMin: number | null;
  tempMax: number | null;
  humidityAvg: number | null;
  windAvg: number | null;
  gustMax: number | null;
  rainTotal: number;
  rainyHours: number;
  thunderHours: number;
  dominantDir: string | null;
  dominantDirPct: number | null;
  waveAvg: number | null;
  waveMax: number | null;
}

const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

class Acc {
  sum = 0;
  n = 0;
  add(v: number | null | undefined) {
    if (ok(v)) {
      this.sum += v;
      this.n++;
    }
  }
  get avg() {
    return this.n ? this.sum / this.n : null;
  }
}

function track(cur: Extreme | null, v: unknown, time: string, bigger: boolean, dir?: string): Extreme | null {
  if (!ok(v)) return cur;
  if (cur === null || (bigger ? v > cur.value : v < cur.value)) return { value: v, time, dir };
  return cur;
}

/** Wind-direction tally for a set of hours (all of them, or one month). */
class DirAcc {
  hours: number[] = new Array(16).fill(0);
  speed: number[] = new Array(16).fill(0);
  bins: number[][] = Array.from({ length: 16 }, () => [0, 0, 0, 0]);
  sx = 0; // speed-weighted unit vector components
  sy = 0;
  add(deg: unknown, kt: unknown) {
    if (!ok(deg) || !ok(kt) || kt < 1) return; // calm / missing: direction is meaningless
    const k = Math.floor(deg / 22.5 + 0.5) % 16;
    this.hours[k]++;
    this.speed[k] += kt;
    this.bins[k][binOf(kt)]++;
    const r = (deg * Math.PI) / 180;
    this.sx += kt * Math.sin(r);
    this.sy += kt * Math.cos(r);
  }
  get total() {
    return this.hours.reduce((a, b) => a + b, 0);
  }
  get dominant() {
    const t = this.total;
    if (!t) return null;
    const k = this.hours.indexOf(Math.max(...this.hours));
    return { dir: COMPASS[k], hours: this.hours[k], pct: (this.hours[k] / t) * 100 };
  }
  stats(): WindDirStats {
    const t = this.total;
    const mag = Math.hypot(this.sx, this.sy);
    const deg = t && mag > 1e-9 ? ((Math.atan2(this.sx, this.sy) * 180) / Math.PI + 360) % 360 : null;
    return {
      hours: t,
      dominant: this.dominant,
      vectorMeanDeg: deg,
      sectors: COMPASS.map((dir, k) => ({
        dir,
        hours: this.hours[k],
        pct: t ? (this.hours[k] / t) * 100 : 0,
        avgSpeed: this.hours[k] ? this.speed[k] / this.hours[k] : null,
        bins: this.bins[k],
      })),
    };
  }
}

const fmtTime = (t: string) => t.replace("T", " ");

export function computeSummary(h: ArchiveSeries, th: Thresholds): { stats: Stats; months: MonthRow[] } {
  const temp = new Acc(), hum = new Acc(), wind = new Acc(), press = new Acc();
  let tMax: Extreme | null = null, tMin: Extreme | null = null;
  let wMax: Extreme | null = null, gMax: Extreme | null = null, rMax: Extreme | null = null;
  let rainTotal = 0, rainyHours = 0, thunderHours = 0;
  const exceed = { wind: [0, 0, 0], rain: [0, 0, 0], temp: [0, 0, 0] };

  const dirAll = new DirAcc();
  const hasWave = !!h.wave_height?.some(ok);
  const wave = new Acc();
  let wMaxWave: Extreme | null = null;
  const waveExceed = [0, 0, 0];
  type M = { waveAcc: Acc; waveMax: number | null; n: number; temp: Acc; hum: Acc; wind: Acc; tMin: number | null; tMax: number | null; gust: number | null; rain: number; rainy: number; thunder: number; dir: DirAcc };
  const byMonth = new Map<string, M>();

  for (let i = 0; i < h.time.length; i++) {
    const t = fmtTime(h.time[i]);
    const T = h.temperature_2m?.[i], H = h.relative_humidity_2m?.[i], W = h.wind_speed_10m?.[i];
    const G = h.wind_gusts_10m?.[i], R = h.precipitation?.[i], P = h.pressure_msl?.[i], C = h.weather_code?.[i];
    const key = h.time[i].slice(0, 7);
    let m = byMonth.get(key);
    if (!m) {
      m = { waveAcc: new Acc(), waveMax: null, n: 0, temp: new Acc(), hum: new Acc(), wind: new Acc(), tMin: null, tMax: null, gust: null, rain: 0, rainy: 0, thunder: 0, dir: new DirAcc() };
      byMonth.set(key, m);
    }
    m.n++;
    const D = h.wind_direction_10m?.[i];
    const dirName = ok(D) ? compassOf(D) : undefined;
    dirAll.add(D, W);
    m.dir.add(D, W);
    temp.add(T); hum.add(H); wind.add(W); press.add(P);
    m.temp.add(T); m.hum.add(H); m.wind.add(W);
    tMax = track(tMax, T, t, true); tMin = track(tMin, T, t, false);
    wMax = track(wMax, W, t, true, dirName); gMax = track(gMax, G, t, true, dirName); rMax = track(rMax, R, t, true);
    if (ok(T)) {
      m.tMin = m.tMin === null ? T : Math.min(m.tMin, T);
      m.tMax = m.tMax === null ? T : Math.max(m.tMax, T);
      th.temp.forEach((x, k) => { if (T >= x) exceed.temp[k]++; });
    }
    if (ok(G)) m.gust = m.gust === null ? G : Math.max(m.gust, G);
    if (ok(W)) th.wind.forEach((x, k) => { if (W >= x) exceed.wind[k]++; });
    if (ok(R)) {
      rainTotal += R;
      m.rain += R;
      if (R >= 0.1) { rainyHours++; m.rainy++; }
      th.rain.forEach((x, k) => { if (R >= x) exceed.rain[k]++; });
    }
    if (ok(C) && C >= 95) { thunderHours++; m.thunder++; }
    const Hs = h.wave_height?.[i];
    if (ok(Hs)) {
      wave.add(Hs);
      m.waveAcc.add(Hs);
      m.waveMax = m.waveMax === null ? Hs : Math.max(m.waveMax, Hs);
      wMaxWave = track(wMaxWave, Hs, t, true);
      (th.wave ?? []).forEach((x, k) => { if (Hs >= x) waveExceed[k]++; });
    }
  }

  const stats: Stats = {
    hours: h.time.length,
    temp: { avg: temp.avg, max: tMax, min: tMin },
    humidityAvg: hum.avg,
    windAvg: wind.avg,
    windMax: wMax,
    gustMax: gMax,
    rainTotal,
    rainMax: rMax,
    rainyHours,
    thunderHours,
    pressureAvg: press.avg,
    exceed,
    windDir: dirAll.stats(),
    wave: hasWave ? { hours: wave.n, avg: wave.avg, max: wMaxWave, exceed: waveExceed } : null,
  };
  const months: MonthRow[] = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, m]) => ({
      month,
      hours: m.n,
      tempAvg: m.temp.avg,
      tempMin: m.tMin,
      tempMax: m.tMax,
      humidityAvg: m.hum.avg,
      windAvg: m.wind.avg,
      gustMax: m.gust,
      rainTotal: m.rain,
      rainyHours: m.rainy,
      thunderHours: m.thunder,
      dominantDir: m.dir.dominant?.dir ?? null,
      dominantDirPct: m.dir.dominant?.pct ?? null,
      waveAvg: m.waveAcc.avg,
      waveMax: m.waveMax,
    }));
  return { stats, months };
}

// ─── Chart images (drawn on a canvas in the browser; skipped where there is no DOM) ─────────

export interface ChartSpec {
  title: string;
  unit: string;
  labels: string[];
  series: { name: string; color: string; type: "line" | "bar"; values: (number | null)[] }[];
}

export const CHART_W = 940;
export const CHART_H = 320;

export async function renderChartPng(spec: ChartSpec): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = CHART_W * scale;
  canvas.height = CHART_H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CHART_W, CHART_H);
  const L = 58, R = 16, T = 48, B = 46;
  const pw = CHART_W - L - R, ph = CHART_H - T - B;

  const all = spec.series.flatMap((s) => s.values).filter(ok);
  const hasBar = spec.series.some((s) => s.type === "bar");
  let lo = all.length ? Math.min(...all) : 0;
  let hi = all.length ? Math.max(...all) : 1;
  if (hasBar) lo = Math.min(0, lo);
  if (hi === lo) hi = lo + 1;
  const step = niceStep((hi - lo) / 5);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const y = (v: number) => T + ph - ((v - lo) / (hi - lo)) * ph;
  const n = spec.labels.length;
  const slot = pw / Math.max(n, 1);
  const x = (i: number) => L + slot * (i + 0.5);

  // title + legend
  ctx.fillStyle = "#1f2937";
  ctx.font = "bold 15px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${spec.title}${spec.unit ? ` (${spec.unit})` : ""}`, L, 24);
  let lx = CHART_W - R;
  ctx.font = "12px Arial, sans-serif";
  ctx.textAlign = "right";
  for (const s of [...spec.series].reverse()) {
    const w = ctx.measureText(s.name).width;
    ctx.fillStyle = "#374151";
    ctx.fillText(s.name, lx, 24);
    ctx.fillStyle = s.color;
    ctx.fillRect(lx - w - 16, 15, 11, 11);
    lx -= w + 30;
  }

  // grid + y axis
  ctx.textAlign = "right";
  ctx.font = "11px Arial, sans-serif";
  for (let v = lo; v <= hi + step / 2; v += step) {
    const yy = y(v);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, yy);
    ctx.lineTo(L + pw, yy);
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.fillText(String(Math.round(v * 100) / 100), L - 8, yy + 4);
  }

  // x labels
  const every = Math.max(1, Math.ceil(n / 14));
  ctx.textAlign = "center";
  ctx.fillStyle = "#6b7280";
  spec.labels.forEach((lab, i) => {
    if (i % every === 0) ctx.fillText(lab, x(i), CHART_H - B + 18);
  });
  ctx.strokeStyle = "#9ca3af";
  ctx.beginPath();
  ctx.moveTo(L, T + ph);
  ctx.lineTo(L + pw, T + ph);
  ctx.stroke();

  // series
  const barSeries = spec.series.filter((s) => s.type === "bar");
  const bw = Math.max(2, (slot * 0.7) / Math.max(barSeries.length, 1));
  for (const s of spec.series) {
    if (s.type === "bar") {
      const bi = barSeries.indexOf(s);
      ctx.fillStyle = s.color;
      s.values.forEach((v, i) => {
        if (!ok(v)) return;
        const x0 = x(i) - (bw * barSeries.length) / 2 + bi * bw;
        ctx.fillRect(x0, Math.min(y(v), y(0)), bw, Math.abs(y(0) - y(v)));
      });
    } else {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let pen = false;
      s.values.forEach((v, i) => {
        if (!ok(v)) {
          pen = false;
          return;
        }
        if (pen) ctx.lineTo(x(i), y(v));
        else ctx.moveTo(x(i), y(v));
        pen = true;
      });
      ctx.stroke();
      if (n <= 40) {
        ctx.fillStyle = s.color;
        s.values.forEach((v, i) => {
          if (ok(v)) {
            ctx.beginPath();
            ctx.arc(x(i), y(v), 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
    }
  }

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

export const ROSE_W = 560;
export const ROSE_H = 440;
const ROSE_COLORS = ["#93c5fd", "#3b82f6", "#f59e0b", "#ef4444"];
const ROSE_LABELS = ["< 10 kt", "10 – 20 kt", "20 – 30 kt", "≥ 30 kt"];

/** Wind rose: share of hours per compass sector (wind coming FROM), stacked by speed class. */
export async function renderWindRosePng(w: WindDirStats): Promise<Uint8Array | null> {
  if (typeof document === "undefined" || w.hours === 0) return null;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = ROSE_W * scale;
  canvas.height = ROSE_H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ROSE_W, ROSE_H);

  ctx.fillStyle = "#1f2937";
  ctx.font = "bold 15px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Wind rose (direction wind blows from, % of hours)", 16, 24);

  const cx = 220, cy = 245, R = 150;
  const maxPct = Math.max(...w.sectors.map((s) => s.pct), 1);
  const step = niceStep(maxPct / 4);
  const top = Math.ceil(maxPct / step) * step;
  const rad = (pct: number) => (pct / top) * R;

  // rings + spokes
  ctx.lineWidth = 1;
  ctx.font = "10px Arial, sans-serif";
  for (let v = step; v <= top + 1e-9; v += step) {
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();
    ctx.arc(cx, cy, rad(v), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "left";
    ctx.fillText(`${Math.round(v * 10) / 10}%`, cx + 3, cy - rad(v) + 11);
  }
  ctx.textAlign = "center";
  w.sectors.forEach((s, k) => {
    const a = (k * 22.5 * Math.PI) / 180;
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R);
    ctx.stroke();
    ctx.fillStyle = k % 2 === 0 ? "#374151" : "#9ca3af";
    ctx.font = k % 2 === 0 ? "bold 12px Arial, sans-serif" : "10px Arial, sans-serif";
    ctx.fillText(s.dir, cx + Math.sin(a) * (R + 16), cy - Math.cos(a) * (R + 16) + 4);
  });

  // stacked petals (canvas angle 0 = east, so rotate by -90°)
  const half = (22.5 * 0.42 * Math.PI) / 180;
  w.sectors.forEach((s, k) => {
    const mid = (k * 22.5 * Math.PI) / 180 - Math.PI / 2;
    let cum = 0;
    s.bins.forEach((hrs, b) => {
      if (!hrs) return;
      const inner = rad(cum);
      cum += (hrs / w.hours) * 100;
      const outer = rad(cum);
      ctx.fillStyle = ROSE_COLORS[b];
      ctx.beginPath();
      ctx.arc(cx, cy, outer, mid - half, mid + half);
      ctx.arc(cx, cy, inner, mid + half, mid - half, true);
      ctx.closePath();
      ctx.fill();
    });
  });

  // legend
  ctx.textAlign = "left";
  ctx.font = "12px Arial, sans-serif";
  ROSE_LABELS.forEach((lab, i) => {
    ctx.fillStyle = ROSE_COLORS[i];
    ctx.fillRect(420, 150 + i * 24, 13, 13);
    ctx.fillStyle = "#374151";
    ctx.fillText(lab, 440, 161 + i * 24);
  });
  ctx.fillStyle = "#6b7280";
  ctx.font = "11px Arial, sans-serif";
  ctx.fillText("Calm hours (< 1 kt) excluded", 400, 270);

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

export function buildChartSpecs(months: MonthRow[], withWaves = false): ChartSpec[] {
  const labels = months.map((m) => monthLabel(m.month));
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  const charts: ChartSpec[] = [
    {
      title: "Monthly temperature",
      unit: "°C",
      labels,
      series: [
        { name: "Max", color: "#ef4444", type: "line", values: months.map((m) => r1(m.tempMax)) },
        { name: "Average", color: "#f59e0b", type: "line", values: months.map((m) => r1(m.tempAvg)) },
        { name: "Min", color: "#3b82f6", type: "line", values: months.map((m) => r1(m.tempMin)) },
      ],
    },
    {
      title: "Monthly rainfall",
      unit: "mm",
      labels,
      series: [{ name: "Total rain", color: "#0ea5e9", type: "bar", values: months.map((m) => r1(m.rainTotal)) }],
    },
    {
      title: "Monthly wind",
      unit: "knots",
      labels,
      series: [
        { name: "Max gust", color: "#8b5cf6", type: "line", values: months.map((m) => r1(m.gustMax)) },
        { name: "Average wind", color: "#10b981", type: "line", values: months.map((m) => r1(m.windAvg)) },
      ],
    },
  ];
  if (withWaves) {
    charts.push({
      title: "Monthly wave height",
      unit: "m",
      labels,
      series: [
        { name: "Max Hs", color: "#ef4444", type: "line", values: months.map((m) => r1(m.waveMax)) },
        { name: "Average Hs", color: "#0ea5e9", type: "line", values: months.map((m) => r1(m.waveAvg)) },
      ],
    });
  }
  return charts;
}
