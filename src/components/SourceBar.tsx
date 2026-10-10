"use client";

import type { SelectedLocation } from "@/hooks/useWeather";

const DATA_SOURCES = ["Open-Meteo", "OpenWeatherMap", "MET Norway"] as const;

interface SourceBarProps {
  selected: SelectedLocation;
  dataSource: string;
  onSourceChange: (source: string) => void;
  onFetch: () => void;
  loading: boolean;
  error: string;
}

/** Confirmed-location bar, data-source selector, Fetch button and error banner. */
export default function SourceBar({
  selected,
  dataSource,
  onSourceChange,
  onFetch,
  loading,
  error,
}: SourceBarProps) {
  const { lat: selectedLat, lon: selectedLon, name: locationName } = selected;
  return (
    <>
      <div className="gradient-divider" />

      {/* Selected location bar */}
      <div className="text-sm text-[#e8f0fe] p-3 bg-[#0072ff]/20 border border-[#00c6ff]/50 rounded-xl shadow-[0_0_15px_rgba(0,198,255,0.2)]">
        📍 <strong>Selected location:</strong> <span className="font-bold text-white text-base">{locationName}</span> | Lat:{" "}
        <code className="text-[#00c6ff] font-bold">{selectedLat.toFixed(4)}</code> | Lon:{" "}
        <code className="text-[#00c6ff] font-bold">{selectedLon.toFixed(4)}</code>
      </div>

      {/* Data Source & Fetch Button */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <span className="font-semibold text-[#8fa6c0]">Select Data Source:</span>
          {DATA_SOURCES.map((src) => (
            <label
              key={src}
              className="flex items-center gap-2 cursor-pointer text-[#e8f0fe] hover:text-[#00c6ff] transition-colors"
            >
              <input
                type="radio"
                name="dataSource"
                value={src}
                checked={dataSource === src}
                onChange={(e) => onSourceChange(e.target.value)}
                className="accent-[#00c6ff]"
              />
              <span>{src}</span>
            </label>
          ))}
        </div>

        <button
          onClick={onFetch}
          disabled={loading}
          className="btn-primary w-full sm:w-auto py-3 px-8 text-sm"
        >
          {loading ? "Fetching Data..." : "Fetch Data"}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-sm">
          ⚠️ {error}
        </div>
      )}
    </>
  );
}
