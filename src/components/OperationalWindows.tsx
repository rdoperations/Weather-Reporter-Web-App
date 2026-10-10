"use client";

import { useMemo, useState } from "react";
import { HardHat, Helicopter, LifeBuoy, Ship } from "lucide-react";
import {
  DEFAULT_LIMITS,
  HEAVY_RAIN_MM_PER_H,
  type ActivityIcon,
  type ActivityLimit,
} from "@/config/operatingLimits";

interface Point {
  datetime: string; // "YYYY-MM-DD HH:mm" in the location's local time
  wind_speed?: number | null;
  wind_gust?: number | null;
  rain?: number | null;
  description?: string | null;
  wave_height?: number | null;
}

interface Props {
  weatherData: Point[];
  marineData?: Point[] | null;
}

type Status = "green" | "amber" | "red" | "unknown";
type NumericKey = "windCaution" | "windStop" | "gustStop" | "hsCaution" | "hsStop";

const STORAGE_KEY = "wr.operatingLimits.v2";
const HOUR_MS = 3_600_000;

const COLORS: Record<Status, string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  unknown: "#475569",
};
const LABELS: Record<Status, string> = {
  green: "GO",
  amber: "CAUTION",
  red: "NO-GO",
  unknown: "NO DATA",
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// "YYYY-MM-DD HH:mm" is wall-clock time at the location; parse as UTC so that only
// differences between points (which are timezone-independent) are used.
const toMs = (s: string) => Date.parse(s.replace(" ", "T") + ":00Z");

const shortTime = (s: string) => {
  const [d, t] = s.split(" ");
  const [, m, day] = d.split("-");
  return `${day}/${m} ${t?.slice(0, 5) ?? ""}`;
};

// lucide has no crane or ladder glyph, so these two are drawn in the same 24px stroke style.
const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CraneIcon({ size = 20 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} aria-hidden="true">
      <path d="M4 21h8" />
      <path d="M8 21V3" />
      <path d="M2 7h19" />
      <path d="M8 3l9 4" />
      <path d="M18 7v7" />
      <circle cx="18" cy="16" r="2" />
    </svg>
  );
}

function LadderIcon({ size = 20 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} aria-hidden="true">
      <path d="M8 3v18" />
      <path d="M16 3v18" />
      <path d="M8 7h8" />
      <path d="M8 12h8" />
      <path d="M8 17h8" />
    </svg>
  );
}

function ActivityIconView({ icon }: { icon: ActivityIcon }) {
  switch (icon) {
    case "crane":
      return <CraneIcon />;
    case "helicopter":
      return <Helicopter size={20} aria-hidden="true" />;
    case "ship":
      return <Ship size={20} aria-hidden="true" />;
    case "lifebuoy":
      return <LifeBuoy size={20} aria-hidden="true" />;
    case "ladder":
      return <LadderIcon />;
    case "hardhat":
      return <HardHat size={20} aria-hidden="true" />;
  }
}

const NUMERIC_KEYS: NumericKey[] = ["windCaution", "windStop", "gustStop", "hsCaution", "hsStop"];

/** Saved overrides only change the numeric limits; labels/notes always come from the config. */
function loadLimits(): ActivityLimit[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LIMITS;
    const saved = JSON.parse(raw) as Partial<ActivityLimit>[];
    return DEFAULT_LIMITS.map((d) => {
      const o = saved.find((x) => x.id === d.id);
      if (!o) return d;
      const merged: ActivityLimit = { ...d };
      for (const k of NUMERIC_KEYS) {
        if (d[k] !== null && isNum(o[k])) (merged[k] as number) = o[k] as number;
      }
      return merged;
    });
  } catch {
    return DEFAULT_LIMITS; // storage unavailable or corrupt
  }
}

function evaluate(p: Point, lim: ActivityLimit): { status: Status; reasons: string[] } {
  const reasons: string[] = [];
  let worst: Status = "green";
  let known = false;
  const bump = (s: Status) => {
    if (s === "red" || (s === "amber" && worst === "green")) worst = s;
  };

  // The procedure's wording is "X and higher", so the stop level itself is NO-GO.
  const tier = (label: string, value: unknown, caution: number | null, stop: number | null, unit: string) => {
    if (!isNum(value)) return;
    if (caution === null && stop === null) return;
    known = true;
    if (stop !== null && value >= stop) {
      bump("red");
      reasons.push(`${label} ${value.toFixed(1)} ${unit} ≥ ${stop} ${unit} (stop)`);
    } else if (caution !== null && value >= caution) {
      bump("amber");
      reasons.push(`${label} ${value.toFixed(1)} ${unit} ≥ ${caution} ${unit} (caution)`);
    }
  };

  tier("Wind", p.wind_speed, lim.windCaution, lim.windStop, "kt");
  tier("Gust", p.wind_gust, null, lim.gustStop, "kt");
  tier("Hs", p.wave_height, lim.hsCaution, lim.hsStop, "m");

  if (lim.rainSensitive && isNum(p.rain) && p.rain >= HEAVY_RAIN_MM_PER_H) {
    known = true;
    bump("amber");
    reasons.push(`Heavy rain ${p.rain.toFixed(1)} mm`);
  }
  if (p.description && /thunder/i.test(p.description)) {
    known = true;
    bump("red");
    reasons.push("Thunderstorm");
  }
  if (!known) return { status: "unknown", reasons: ["No data"] };
  return { status: worst, reasons };
}

function limitSummary(l: ActivityLimit): string {
  const parts = [`Wind ≥${l.windCaution} caution / ≥${l.windStop} kt stop`];
  if (l.gustStop !== null) parts.push(`gust ≥${l.gustStop} kt`);
  if (l.hsStop !== null) parts.push(`Hs ≥${l.hsCaution === null ? "–" : l.hsCaution.toFixed(1)} caution / ≥${l.hsStop.toFixed(1)} m stop`);
  return parts.join(" · ");
}

const FIELD_LABELS: Record<NumericKey, string> = {
  windCaution: "Wind caution (kt)",
  windStop: "Wind stop (kt)",
  gustStop: "Gust stop (kt)",
  hsCaution: "Hs caution (m)",
  hsStop: "Hs stop (m)",
};

export default function OperationalWindows({ weatherData, marineData }: Props) {
  // This component only mounts after a client-side fetch, so reading localStorage during
  // the initial render cannot cause a hydration mismatch.
  const [limits, setLimits] = useState<ActivityLimit[]>(loadLimits);
  const [horizonHours, setHorizonHours] = useState(72);
  const [minWindow, setMinWindow] = useState(6);
  const [editing, setEditing] = useState(false);

  const updateLimit = (id: string, key: NumericKey, value: number) => {
    setLimits((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, [key]: value } : l));
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const resetLimits = () => {
    setLimits(DEFAULT_LIMITS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  // Merge wave height onto the weather points by timestamp.
  const merged = useMemo(() => {
    const waves = new Map<string, number | null | undefined>();
    (marineData || []).forEach((m) => waves.set(m.datetime, m.wave_height));
    return weatherData
      .map((p) => ({ ...p, wave_height: waves.get(p.datetime) ?? null, ms: toMs(p.datetime) }))
      .filter((p) => Number.isFinite(p.ms));
  }, [weatherData, marineData]);

  const horizon = useMemo(() => {
    if (merged.length === 0) return [];
    const end = merged[0].ms + horizonHours * HOUR_MS;
    return merged.filter((p) => p.ms <= end);
  }, [merged, horizonHours]);

  // Typical spacing between points (1 h Open-Meteo, 3 h OpenWeatherMap, 1–6 h MET Norway).
  const stepMs = useMemo(() => {
    const diffs: number[] = [];
    for (let i = 1; i < horizon.length; i++) diffs.push(horizon[i].ms - horizon[i - 1].ms);
    if (diffs.length === 0) return HOUR_MS;
    diffs.sort((a, b) => a - b);
    return diffs[Math.floor(diffs.length / 2)] || HOUR_MS;
  }, [horizon]);

  const hasWaves = horizon.some((p) => isNum(p.wave_height));

  const rows = useMemo(
    () =>
      limits.map((lim) => {
        const evals = horizon.map((p) => ({ p, ...evaluate(p, lim) }));

        // First run of consecutive non-red, known points lasting at least `minWindow` hours.
        let found: { start: string; end: string; hours: number } | null = null;
        let runStart = -1;
        const close = (endIdx: number) => {
          if (runStart < 0 || found) return;
          const first = evals[runStart].p;
          const last = evals[endIdx].p;
          const hours = (last.ms - first.ms + stepMs) / HOUR_MS;
          if (hours >= minWindow) found = { start: first.datetime, end: last.datetime, hours };
        };
        evals.forEach((e, i) => {
          const ok = e.status === "green" || e.status === "amber";
          if (ok && runStart < 0) runStart = i;
          if (!ok && runStart >= 0) {
            close(i - 1);
            runStart = -1;
          }
        });
        if (runStart >= 0) close(evals.length - 1);

        return { lim, evals, window: found as { start: string; end: string; hours: number } | null };
      }),
    [limits, horizon, stepMs, minWindow]
  );

  if (horizon.length === 0) return null;

  const numInput =
    "w-16 bg-black/50 border border-white/10 rounded-md px-1.5 py-1 text-xs font-mono text-white text-right";

  return (
    <div className="glass-card !p-5 space-y-5">
      <div className="flex flex-wrap items-end gap-4 text-xs text-[#8fa6c0]">
        <label className="flex flex-col gap-1">
          Horizon
          <select
            value={horizonHours}
            onChange={(e) => setHorizonHours(Number(e.target.value))}
            className="bg-black/60 border border-white/10 rounded-md px-2 py-1.5 text-white"
          >
            {[24, 48, 72, 168].map((h) => (
              <option key={h} value={h}>
                {h} h
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Minimum window (h)
          <input
            type="number"
            min={1}
            max={72}
            value={minWindow}
            onChange={(e) => setMinWindow(Math.max(1, Number(e.target.value) || 1))}
            className={numInput}
          />
        </label>
        <button onClick={() => setEditing((v) => !v)} className="underline hover:text-white">
          {editing ? "Done editing" : "Edit limits"}
        </button>
        <button onClick={resetLimits} className="underline hover:text-white">
          Reset to procedure
        </button>
        <div className="ml-auto flex items-center gap-3">
          {(["green", "amber", "red", "unknown"] as Status[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: COLORS[s] }} />
              {LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {rows.map(({ lim, evals, window: win }) => {
          const now = evals[0];
          const editable = NUMERIC_KEYS.filter((k) => lim[k] !== null);
          return (
            <div key={lim.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex items-center gap-2.5 font-semibold text-[#e8f0fe] text-sm">
                  <span
                    className="flex items-center justify-center w-9 h-9 rounded-lg border"
                    style={{
                      color: COLORS[now.status],
                      borderColor: COLORS[now.status] + "66",
                      background: COLORS[now.status] + "1a",
                    }}
                  >
                    <ActivityIconView icon={lim.icon} />
                  </span>
                  {lim.label}
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-black"
                  style={{ background: COLORS[now.status] }}
                  title={now.reasons.join("; ")}
                >
                  NOW: {LABELS[now.status]}
                </span>
                <span className="text-xs text-[#d1d9e6]">
                  {win ? (
                    <>
                      Next window ≥ {minWindow} h:{" "}
                      <strong className="font-mono text-white">
                        {shortTime(win.start)} → {shortTime(win.end)}
                      </strong>{" "}
                      <span className="text-[#8fa6c0]">({win.hours.toFixed(0)} h)</span>
                    </>
                  ) : (
                    <span className="text-red-300">
                      No ≥ {minWindow} h window within {horizonHours} h
                    </span>
                  )}
                </span>
              </div>

              <div
                className="flex h-6 rounded-md overflow-hidden border border-white/10"
                role="img"
                aria-label={`${lim.label}: go / caution / no-go status for the next ${horizonHours} hours`}
              >
                {evals.map((e, i) => (
                  <div
                    key={i}
                    className="flex-1 min-w-px"
                    style={{ background: COLORS[e.status] }}
                    title={`${shortTime(e.p.datetime)} — ${LABELS[e.status]}${
                      e.reasons.length ? ": " + e.reasons.join("; ") : ""
                    }`}
                  />
                ))}
              </div>

              {editing ? (
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#8fa6c0]">
                  {editable.map((k) => (
                    <label key={k} className="flex items-center gap-2">
                      {FIELD_LABELS[k]}
                      <input
                        type="number"
                        min={0}
                        step={k.startsWith("hs") ? 0.1 : 1}
                        value={lim[k] as number}
                        onChange={(e) => updateLimit(lim.id, k, Number(e.target.value) || 0)}
                        className={numInput}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#8fa6c0] font-mono">{limitSummary(lim)}</p>
              )}

              {lim.hsStop !== null && !hasWaves && (
                <p className="text-[11px] text-[#8fa6c0]">
                  No wave data for this location/source — only wind, gust and weather are evaluated.
                </p>
              )}

              <details className="text-[11px] text-[#8fa6c0]">
                <summary className="cursor-pointer hover:text-white">Procedure basis</summary>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {lim.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
