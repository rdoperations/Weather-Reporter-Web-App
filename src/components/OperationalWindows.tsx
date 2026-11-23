"use client";

import { useMemo, useState } from "react";
import { CloudLightning, CloudRain, HardHat, Helicopter, LifeBuoy, Ship, Sun, Thermometer, Wind } from "lucide-react";
import {
  DEFAULT_LIMITS,
  HEAT_LEVELS_EUROPE,
  HEAVY_RAIN_MM_PER_H,
  type ActivityIcon,
  type ActivityLimit,
  type AlertLevels,
  type LocationProfile,
} from "@/config/operatingLimits";

interface Point {
  datetime: string; // "YYYY-MM-DD HH:mm" in the location's local time
  wind_speed?: number | null;
  wind_gust?: number | null;
  rain?: number | null;
  description?: string | null;
  wave_height?: number | null;
  temperature?: number | null;
  uv_index?: number | null;
}

interface Props {
  weatherData: Point[];
  marineData?: Point[] | null;
  /** offshore = platform procedure rows; onshore / airport = land rows (see operatingLimits). */
  profile: LocationProfile;
  /** IANA timezone of the location (picks regional heat defaults). */
  timezone?: string;
}

type Status = "green" | "amber" | "orange" | "red" | "unknown";
const RANK: Record<Status, number> = { unknown: -1, green: 0, amber: 1, orange: 2, red: 3 };
type NumericKey = "windCaution" | "windStop" | "gustStop" | "hsCaution" | "hsStop";

const STORAGE_KEY = "wr.operatingLimits.v5";
const HOUR_MS = 3_600_000;

const COLORS: Record<Status, string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
  unknown: "#475569",
};
const LABELS: Record<Status, string> = {
  green: "GO",
  amber: "CAUTION",
  orange: "LEVEL 2",
  red: "NO-GO",
  unknown: "NO DATA",
};
// Land locations use a 3-level alert scale instead of CAUTION / NO-GO.
const LAND_LABELS: Record<Status, string> = {
  green: "NORMAL",
  amber: "LEVEL 1",
  orange: "LEVEL 2",
  red: "LEVEL 3",
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

/** Personnel transfer basket: lifting ring, sling cone to a top ring, rope net and floating base ring. */
function BasketIcon({ size = 20 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="2.6" r="1.1" />
      <path d="M12 3.7L7.8 7.8" />
      <path d="M12 3.7l4.2 4.1" />
      <ellipse cx="12" cy="8.4" rx="4.4" ry="1.3" />
      <path d="M7.7 9.2L4.3 18.4" />
      <path d="M16.3 9.2l3.4 9.2" />
      <path d="M10.4 9.7L9.4 20.4" />
      <path d="M13.6 9.7l1 10.7" />
      <path d="M6.5 13.2h11" />
      <path d="M5.6 16.2h12.8" />
      <ellipse cx="12" cy="19" rx="8" ry="2.4" />
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
    case "basket":
      return <BasketIcon />;
    case "lifebuoy":
      return <LifeBuoy size={20} aria-hidden="true" />;
    case "ladder":
      return <LadderIcon />;
    case "hardhat":
      return <HardHat size={20} aria-hidden="true" />;
    case "thermometer":
      return <Thermometer size={20} aria-hidden="true" />;
    case "sun":
      return <Sun size={20} aria-hidden="true" />;
    case "wind":
      return <Wind size={20} aria-hidden="true" />;
    case "rain":
      return <CloudRain size={20} aria-hidden="true" />;
    case "lightning":
      return <CloudLightning size={20} aria-hidden="true" />;
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
      const ov = o.levels?.values;
      if (d.levels && Array.isArray(ov) && ov.length === 3 && ov.every(isNum)) {
        merged.levels = { ...d.levels, values: [ov[0], ov[1], ov[2]] };
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
    if (RANK[s] > RANK[worst]) worst = s;
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

  if (lim.levels) {
    const value = p[lim.levels.key];
    if (isNum(value)) {
      known = true;
      const [l1, l2, l3] = lim.levels.values;
      const lvl = value >= l3 ? 3 : value >= l2 ? 2 : value >= l1 ? 1 : 0;
      if (lvl > 0) {
        bump(lvl === 3 ? "red" : lvl === 2 ? "orange" : "amber");
        reasons.push(
          `${lim.levels.label} ${value.toFixed(1)}${lim.levels.unit ? " " + lim.levels.unit : ""} ≥ ${lim.levels.values[lvl - 1]} (level ${lvl})`
        );
      }
    }
  }

  if (lim.rainSensitive && isNum(p.rain) && p.rain >= HEAVY_RAIN_MM_PER_H) {
    known = true;
    bump("amber");
    reasons.push(`Heavy rain ${p.rain.toFixed(1)} mm`);
  }
  if (lim.thunderSensitive && p.description) {
    known = true;
    if (/thunder/i.test(p.description)) {
      bump("red");
      reasons.push("Thunderstorm");
    }
  }
  if (!known) return { status: "unknown", reasons: ["No data"] };
  return { status: worst, reasons };
}

function limitSummary(l: ActivityLimit): string {
  const parts: string[] = [];
  if (l.levels) {
    const u = l.levels.unit ? ` ${l.levels.unit}` : "";
    parts.push(`${l.levels.label} ≥${l.levels.values.join(" / ≥")}${u} (levels 1 / 2 / 3)`);
  }
  if (l.windCaution !== null && l.windStop !== null) parts.push(`Wind ≥${l.windCaution} caution / ≥${l.windStop} kt stop`);
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

export default function OperationalWindows({ weatherData, marineData, profile, timezone }: Props) {
  // This component only mounts after a client-side fetch, so reading localStorage during
  // the initial render cannot cause a hydration mismatch.
  const [limits, setLimits] = useState<ActivityLimit[]>(loadLimits);
  const [horizonHours, setHorizonHours] = useState(72);
  const [minWindow, setMinWindow] = useState(6);
  const [editing, setEditing] = useState(false);

  const land = profile !== "offshore";
  const labels = land ? LAND_LABELS : LABELS;

  // Heat defaults depend on the region; an edited (saved) value always wins.
  const isEurope = Boolean(timezone?.startsWith("Europe/"));
  const sameAs = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  const activeLimits = useMemo(
    () =>
      limits
        .filter((l) => l.profiles.includes(profile))
        .map((l) => {
          const def = DEFAULT_LIMITS.find((d) => d.id === l.id)?.levels;
          if (l.id === "heat" && isEurope && l.levels && def && sameAs(l.levels.values, def.values)) {
            return { ...l, levels: { ...l.levels, values: HEAT_LEVELS_EUROPE } as AlertLevels };
          }
          return l;
        }),
    [limits, profile, isEurope]
  );

  const updateLevel = (id: string, idx: number, value: number) => {
    const current = activeLimits.find((l) => l.id === id)?.levels;
    if (!current) return;
    const values = [...current.values] as [number, number, number];
    values[idx] = value;
    setLimits((prev) => {
      const next = prev.map((l) => (l.id === id && l.levels ? { ...l, levels: { ...l.levels, values } } : l));
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

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
      activeLimits.map((lim) => {
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
    [activeLimits, horizon, stepMs, minWindow]
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
          Reset to defaults
        </button>
        <div className="ml-auto flex items-center gap-3">
          {(land
            ? (["green", "amber", "orange", "red", "unknown"] as Status[])
            : (["green", "amber", "red", "unknown"] as Status[])
          ).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: COLORS[s] }} />
              {labels[s]}
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
                  NOW: {labels[now.status]}
                </span>
                <span className="text-xs text-[#d1d9e6]">
                  {win ? (
                    <>
                      {land ? "Next window below level 3, ≥ " : "Next window ≥ "}{minWindow} h:{" "}
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
                aria-label={`${lim.label}: status for the next ${horizonHours} hours`}
              >
                {evals.map((e, i) => (
                  <div
                    key={i}
                    className="flex-1 min-w-px"
                    style={{ background: COLORS[e.status] }}
                    title={`${shortTime(e.p.datetime)} — ${labels[e.status]}${
                      e.reasons.length ? ": " + e.reasons.join("; ") : ""
                    }`}
                  />
                ))}
              </div>

              {editing ? (
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#8fa6c0]">
                  {lim.levels &&
                    lim.levels.values.map((v, i) => (
                      <label key={`lvl${i}`} className="flex items-center gap-2">
                        {lim.levels!.label} level {i + 1}
                        {lim.levels!.unit ? ` (${lim.levels!.unit})` : ""}
                        <input
                          type="number"
                          min={0}
                          step={lim.levels!.key === "rain" ? 0.1 : 1}
                          value={v}
                          onChange={(e) => updateLevel(lim.id, i, Number(e.target.value) || 0)}
                          className={numInput}
                        />
                      </label>
                    ))}
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
