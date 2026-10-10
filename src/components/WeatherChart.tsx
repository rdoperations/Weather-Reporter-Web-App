"use client";

import React, { useMemo, useState } from "react";
import type { MarinePoint, WeatherPoint } from "@/types/weather";
import { rainUnit } from "@/lib/units";

type SeriesKey =
  | "temperature"
  | "humidity"
  | "wind_speed"
  | "wind_gust"
  | "rain"
  | "pop"
  | "cloud_cover"
  | "dew_point"
  | "uv_index"
  | "wave_height"
  | "swell_wave_height"
  | "wave_period"
  | "swell_wave_period";

type Row = { datetime: string; description?: string | null } & Partial<
  Record<SeriesKey, number | null>
>;

interface Series {
  key: SeriesKey;
  label: string;
  unit: string;
  color: string;
}

interface TabDef {
  id: string;
  label: string;
  title: string;
  dataset: "weather" | "marine";
  s1: Series;
  s2: Series | null;
  /** Plot series 2 against its own right-hand axis. */
  secondaryY: boolean;
}

interface WeatherChartProps {
  weatherData: WeatherPoint[];
  marineData?: MarinePoint[] | null;
  /** Data source the data was fetched from (decides e.g. the rain unit). */
  apiSource: string;
}

const PINK = "#FF55EB";
const CYAN = "#00FFFF";

function buildTabs(apiSource: string): TabDef[] {
  const rain = rainUnit(apiSource);
  return [
    {
      id: "temp_hum",
      label: "Temperature & Humidity",
      title: "Temperature & Humidity",
      dataset: "weather",
      s1: { key: "temperature", label: "Temperature", unit: "°C", color: PINK },
      s2: { key: "humidity", label: "Humidity", unit: "%", color: CYAN },
      secondaryY: true,
    },
    {
      id: "wind",
      label: "Wind Speed & Gust",
      title: "Wind Speed & Gust",
      dataset: "weather",
      s1: { key: "wind_speed", label: "Wind Speed", unit: "kt", color: CYAN },
      s2: { key: "wind_gust", label: "Wind Gust", unit: "kt", color: PINK },
      secondaryY: false,
    },
    {
      id: "rain",
      label: "Rain & PoP",
      title: "Rain & PoP",
      dataset: "weather",
      s1: { key: "rain", label: "Rain", unit: rain, color: CYAN },
      s2: { key: "pop", label: "PoP", unit: "%", color: PINK },
      secondaryY: true,
    },
    {
      id: "cloud",
      label: "Cloud Cover",
      title: "Cloud Cover",
      dataset: "weather",
      s1: { key: "cloud_cover", label: "Cloud Cover", unit: "%", color: CYAN },
      s2: null,
      secondaryY: false,
    },
    {
      id: "dew",
      label: "Dew Point Temperature",
      title: "Dew Point Temperature",
      dataset: "weather",
      s1: { key: "dew_point", label: "Dew Point", unit: "°C", color: CYAN },
      s2: null,
      secondaryY: false,
    },
    {
      id: "uv",
      label: "UV Index",
      title: "UV Index",
      dataset: "weather",
      s1: { key: "uv_index", label: "UV Index", unit: "", color: PINK },
      s2: null,
      secondaryY: false,
    },
    {
      id: "marine_h",
      label: "Wave Height",
      title: "Wave Height",
      dataset: "marine",
      s1: { key: "wave_height", label: "Wave Height", unit: "m", color: CYAN },
      s2: { key: "swell_wave_height", label: "Swell Wave Height", unit: "m", color: PINK },
      secondaryY: false,
    },
    {
      id: "marine_p",
      label: "Wave Period",
      title: "Wave Period",
      dataset: "marine",
      s1: { key: "wave_period", label: "Wave Period", unit: "s", color: CYAN },
      s2: { key: "swell_wave_period", label: "Swell Wave Period", unit: "s", color: PINK },
      secondaryY: false,
    },
  ];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const hasValues = (rows: Row[], key: SeriesKey) => rows.some((r) => isNum(r[key]));

// "YYYY-MM-DD HH:mm" is wall-clock time at the location. Parsing it as UTC keeps the
// arithmetic timezone-independent: only differences and wall-clock labels are used.
const toMs = (s: string) => Date.parse(s.replace(" ", "T") + ":00Z");

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const fmtDayMonth = (ms: number) => {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};
const fmtDayMonthTime = (ms: number) => `${fmtDayMonth(ms)} ${new Date(ms).toISOString().slice(11, 16)}`;

// ─── Outer component: tabs ──────────────────────────────────────────────────

export default function WeatherChart({ weatherData, marineData, apiSource }: WeatherChartProps) {
  const [requestedTab, setRequestedTab] = useState<string>("temp_hum");

  // Only offer tabs that have something to plot (e.g. no UV tab for MET Norway,
  // no wave tabs for onshore locations).
  const tabs = useMemo(() => {
    const all = buildTabs(apiSource);
    return all.filter((t) => {
      const rows: Row[] = (t.dataset === "marine" ? marineData : weatherData) ?? [];
      return hasValues(rows, t.s1.key) || (t.s2 !== null && hasValues(rows, t.s2.key));
    });
  }, [apiSource, weatherData, marineData]);

  const active = tabs.find((t) => t.id === requestedTab) ?? tabs[0];

  if (!active) {
    return (
      <div className="glass-card !p-6 text-sm text-[#8fa6c0]">No chartable data in this forecast.</div>
    );
  }

  const rows: Row[] = (active.dataset === "marine" ? marineData : weatherData) ?? [];

  return (
    <div className="glass-card !p-6 space-y-5">
      <div role="tablist" className="flex flex-wrap gap-1.5 p-1.5 bg-black/40 rounded-xl border border-white/5">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active.id === t.id}
            onClick={() => setRequestedTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all ${
              active.id === t.id
                ? "bg-gradient-to-r from-[#0072ff] to-[#00c6ff] text-white font-semibold shadow-md shadow-[#0072ff]/30"
                : "text-[#8fa6c0] hover:text-[#e8f0fe] hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* key: reset hover state when the tab changes */}
      <TimeSeriesChart key={active.id} rows={rows} tab={active} />
    </div>
  );
}

// ─── Chart ──────────────────────────────────────────────────────────────────

interface Extent {
  min: number;
  max: number;
}
interface XY {
  x: number;
  y: number;
}

const WIDTH = 1000;
const HEIGHT = 380;

function TimeSeriesChart({ rows, tab }: { rows: Row[]; tab: TabDef }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const { s1, s2, secondaryY, title } = tab;

  const hasSecondaryY = Boolean(secondaryY && s2);
  const padding = { top: 35, right: hasSecondaryY ? 65 : 35, bottom: 75, left: 65 };
  const plotWidth = WIDTH - padding.left - padding.right;
  const plotHeight = HEIGHT - padding.top - padding.bottom;
  const baseY = padding.top + plotHeight;

  // Points with a parseable timestamp, positioned by TIME (not index): sources mix 1 h, 3 h
  // and 6 h steps, and an index axis would distort them.
  const points = useMemo(
    () => rows.map((d) => ({ d, t: toMs(d.datetime) })).filter((p) => Number.isFinite(p.t)),
    [rows]
  );
  const t0 = points.length ? points[0].t : 0;
  const span = points.length ? points[points.length - 1].t - t0 : 0;

  const getX = (t: number) => (span > 0 ? padding.left + ((t - t0) / span) * plotWidth : padding.left);

  const getY = (val: number, ext: Extent) => {
    const clamped = Math.max(ext.min, Math.min(ext.max, val));
    const ratio = (clamped - ext.min) / (ext.max - ext.min || 1);
    return baseY - ratio * plotHeight;
  };

  // ── Y extents ────────────────────────────────────────────────────────────
  const { e1, e2 } = useMemo(() => {
    const valuesOf = (key: SeriesKey) => points.map((p) => p.d[key]).filter(isNum);

    if (!hasSecondaryY) {
      // One shared axis for both series.
      const vals = [...valuesOf(s1.key), ...(s2 ? valuesOf(s2.key) : [])];
      if (vals.length === 0) return { e1: { min: 0, max: 10 }, e2: { min: 0, max: 10 } };
      if (s1.unit === "%") return { e1: { min: 0, max: 100 }, e2: { min: 0, max: 100 } };
      const minVal = Math.min(...vals);
      const maxVal = Math.max(...vals);
      const shared = {
        min: minVal < 0 ? Math.floor(minVal * 1.1) : 0,
        max: Math.ceil(Math.max(maxVal * 1.15, maxVal + 2, 5)),
      };
      return { e1: shared, e2: shared };
    }

    const extent = (key: SeriesKey, unit: string, centered: boolean): Extent => {
      if (unit === "%" || key === "pop") return { min: 0, max: 100 };
      const vals = valuesOf(key);
      if (vals.length === 0) return { min: 0, max: 10 };
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      if (centered) {
        const sp = hi > lo ? hi - lo : 5;
        return { min: Math.floor(lo - sp * 0.5), max: Math.ceil(hi + sp * 0.5) };
      }
      const pad = hi - lo > 0 ? (hi - lo) * 0.15 : 2;
      return { min: Math.floor(lo - pad), max: Math.ceil(hi + pad) };
    };

    return {
      e1: extent(s1.key, s1.unit, s1.key === "temperature"),
      e2: s2 ? extent(s2.key, s2.unit, false) : { min: 0, max: 100 },
    };
  }, [points, s1, s2, hasSecondaryY]);

  // ── Series geometry: split at missing values so gaps are shown, not bridged ──
  const buildSegments = (key: SeriesKey, ext: Extent): XY[][] => {
    const segments: XY[][] = [];
    let current: XY[] = [];
    for (const p of points) {
      const v = p.d[key];
      if (isNum(v)) {
        current.push({ x: getX(p.t), y: getY(v, ext) });
      } else if (current.length) {
        segments.push(current);
        current = [];
      }
    }
    if (current.length) segments.push(current);
    return segments;
  };

  // Catmull-Rom → cubic Bézier, control points clamped so the curve can't leave the plot.
  const splinePath = (pts: XY[]): string => {
    const f = (n: number) => n.toFixed(1);
    if (pts.length === 1) return `M ${f(pts[0].x)} ${f(pts[0].y)}`;
    let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
    if (pts.length === 2) return `${d} L ${f(pts[1].x)} ${f(pts[1].y)}`;
    const clampY = (y: number) => Math.max(padding.top, Math.min(baseY, y));
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
      const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
      d += ` C ${f(p1.x + (p2.x - p0.x) / 6)} ${f(cp1y)}, ${f(p2.x - (p3.x - p1.x) / 6)} ${f(cp2y)}, ${f(p2.x)} ${f(p2.y)}`;
    }
    return d;
  };

  const seg1 = buildSegments(s1.key, e1);
  const seg2 = s2 ? buildSegments(s2.key, e2) : [];

  // ── X ticks: adaptive spacing, aligned to wall-clock hours; day lines at 00:00 ──
  const { ticks, dailyTicks, dayLines } = useMemo(() => {
    if (!(span > 0)) return { ticks: [] as number[], dailyTicks: false, dayLines: [] as number[] };
    const spanH = span / HOUR_MS;
    const stepH = spanH <= 36 ? 3 : spanH <= 72 ? 6 : spanH <= 168 ? 12 : 24;
    const step = stepH * HOUR_MS;
    const t1 = t0 + span;
    const tk: number[] = [];
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) tk.push(t);
    const dl: number[] = [];
    for (let t = Math.ceil(t0 / DAY_MS) * DAY_MS; t <= t1; t += DAY_MS) dl.push(t);
    return { ticks: tk, dailyTicks: stepH === 24, dayLines: dl };
  }, [t0, span]);

  // ── Hover / touch ──────────────────────────────────────────────────────────
  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    if (x < padding.left - 4 || x > WIDTH - padding.right + 4) {
      setHoverIndex(null);
      return;
    }
    const target = span > 0 ? t0 + ((x - padding.left) / plotWidth) * span : t0;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].t - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setHoverIndex(best);
  };

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const yDecimals = (ext: Extent) => (ext.max - ext.min <= 10 ? 1 : 0);

  const fmtVal = (v: number | null | undefined, unit: string) =>
    isNum(v) ? `${v.toFixed(1)}${unit ? " " + unit : ""}` : "—";

  const renderSeries = (segments: XY[][], series: Series) =>
    segments.map((seg, i) => {
      const line = splinePath(seg);
      const first = seg[0];
      const last = seg[seg.length - 1];
      return (
        <g key={`${series.key}-${i}`}>
          {seg.length > 1 && (
            <path
              d={`${line} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`}
              fill={series.color}
              fillOpacity="0.05"
            />
          )}
          <path d={line} fill="none" stroke={series.color} strokeWidth="8" strokeOpacity="0.1" strokeLinecap="round" />
          <path d={line} fill="none" stroke={series.color} strokeWidth="4" strokeOpacity="0.25" strokeLinecap="round" />
          <path d={line} fill="none" stroke={series.color} strokeWidth="2" strokeLinecap="round" />
          {seg.length === 1 && <circle cx={first.x} cy={first.y} r="3" fill={series.color} />}
        </g>
      );
    });

  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3 px-1">
        <h4 className="text-base md:text-lg font-bold text-[#e8f0fe] tracking-wide">{title}</h4>
        <div className="flex items-center gap-5 text-xs font-semibold">
          {[s1, s2].map(
            (s) =>
              s && (
                <div key={s.key} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}` }}
                  />
                  <span className="text-[#d1d9e6]">
                    {s.label} {s.unit ? `(${s.unit})` : ""}
                  </span>
                </div>
              )
          )}
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto select-none"
          style={{ touchAction: "pan-y" }}
          role="img"
          aria-label={`${title} chart`}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {/* Horizontal grid + Y labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => {
            const y = padding.top + r * plotHeight;
            const v1 = e1.max - r * (e1.max - e1.min);
            const v2 = e2.max - r * (e2.max - e2.min);
            return (
              <g key={r}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={WIDTH - padding.right}
                  y2={y}
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 12}
                  y={y + 4}
                  fill="#8fa6c0"
                  fontSize="11"
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                >
                  {v1.toFixed(yDecimals(e1))}
                </text>
                {hasSecondaryY && (
                  <text
                    x={WIDTH - padding.right + 12}
                    y={y + 4}
                    fill="#8fa6c0"
                    fontSize="11"
                    textAnchor="start"
                    fontFamily="var(--font-mono)"
                  >
                    {v2.toFixed(yDecimals(e2))}
                  </text>
                )}
              </g>
            );
          })}

          {/* Day boundaries (local midnight) */}
          {dayLines.map((t) => (
            <line
              key={`day-${t}`}
              x1={getX(t)}
              y1={padding.top}
              x2={getX(t)}
              y2={baseY}
              stroke="rgba(255,255,255,0.12)"
              strokeDasharray="2 4"
            />
          ))}

          {/* X ticks */}
          {ticks.map((t) => {
            const x = getX(t);
            return (
              <g key={`tick-${t}`}>
                <line x1={x} y1={baseY} x2={x} y2={baseY + 6} stroke="rgba(255,255,255,0.4)" />
                <text
                  x={x}
                  y={baseY + 15}
                  fill="#8fa6c0"
                  fontSize="11"
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                  transform={`rotate(-45, ${x}, ${baseY + 15})`}
                >
                  {dailyTicks ? fmtDayMonth(t) : fmtDayMonthTime(t)}
                </text>
              </g>
            );
          })}

          {renderSeries(seg1, s1)}
          {s2 && renderSeries(seg2, s2)}

          {/* Hover crosshair and markers */}
          {hovered && (
            <g>
              <line
                x1={getX(hovered.t)}
                y1={padding.top}
                x2={getX(hovered.t)}
                y2={baseY}
                stroke="#00c6ff"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              {isNum(hovered.d[s1.key]) && (
                <circle
                  cx={getX(hovered.t)}
                  cy={getY(hovered.d[s1.key] as number, e1)}
                  r="5"
                  fill={s1.color}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )}
              {s2 && isNum(hovered.d[s2.key]) && (
                <circle
                  cx={getX(hovered.t)}
                  cy={getY(hovered.d[s2.key] as number, e2)}
                  r="5"
                  fill={s2.color}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )}
            </g>
          )}
        </svg>

        {hovered && (
          <div
            className="absolute top-3 pointer-events-none bg-[#020b22]/95 border border-[#00c6ff]/30 backdrop-blur-md rounded-xl p-3 shadow-2xl text-xs space-y-1.5 z-20"
            style={{
              left: `${Math.min(Math.max(12, (getX(hovered.t) / WIDTH) * 100 - 10), 76)}%`,
            }}
          >
            <p className="font-semibold text-white border-b border-white/10 pb-1">
              📅 {hovered.d.datetime}
            </p>
            {hovered.d.description && (
              <p className="text-slate-300 italic text-[11px]">{hovered.d.description}</p>
            )}
            <p style={{ color: s1.color }} className="font-mono font-bold">
              {s1.label}: {fmtVal(hovered.d[s1.key], s1.unit)}
            </p>
            {s2 && (
              <p style={{ color: s2.color }} className="font-mono font-bold">
                {s2.label}: {fmtVal(hovered.d[s2.key], s2.unit)}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
