"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { GeocodeResult, LocationTab, SavedLocation } from "@/types/weather";
import type { SelectedLocation } from "@/hooks/useWeather";

// Dynamically import Leaflet map to prevent SSR window reference error
const InteractiveMap = dynamic(() => import("@/components/InteractiveMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-full rounded-xl bg-white/5 animate-pulse flex items-center justify-center text-[#8fa6c0]">
      Loading interactive map...
    </div>
  ),
});

const COORD_RANGE_ERR = "Latitude must be -90..90 and longitude -180..180.";

const LOCATION_TABS: { id: LocationTab; label: string }[] = [
  { id: "saved", label: "📋 Saved Locations" },
  { id: "search", label: "🔍 Search" },
  { id: "map", label: "🗺️ Map" },
  { id: "manual", label: "📍 Coordinates" },
];

interface LocationPickerProps {
  locationsConfig: Record<string, SavedLocation>;
  /** Location preselected in the "Saved" dropdown (changes once /api/locations loads). */
  defaultLocation: string;
  /** Currently confirmed location. */
  selected: SelectedLocation;
  /** Called when the user confirms a location in any tab. */
  onConfirm: (lat: number, lon: number, name: string) => void;
}

export default function LocationPicker({
  locationsConfig,
  defaultLocation,
  selected,
  onConfirm,
}: LocationPickerProps) {
  const { lat: selectedLat, lon: selectedLon, name: locationName } = selected;
  const locNames = Object.keys(locationsConfig);

  const [activeTab, setActiveTab] = useState<LocationTab>("saved");

  // Saved dropdown follows the default location when it changes (after the config loads);
  // afterwards it is the user's own choice.
  const [selectedLocDropdown, setSelectedLocDropdown] = useState<string>(defaultLocation);
  const [prevDefault, setPrevDefault] = useState<string>(defaultLocation);
  if (prevDefault !== defaultLocation) {
    setPrevDefault(defaultLocation);
    setSelectedLocDropdown(defaultLocation);
  }

  // Geocoding search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(0);
  const [searching, setSearching] = useState(false);

  // Map click (pending, not yet confirmed)
  const [clickedMapLat, setClickedMapLat] = useState<number | null>(null);
  const [clickedMapLon, setClickedMapLon] = useState<number | null>(null);

  // Manual coordinates
  const [manualLat, setManualLat] = useState<number>(7.7925);
  const [manualLon, setManualLon] = useState<number>(108.2021);
  const [manualName, setManualName] = useState<string>("");

  // Simple Levenshtein distance for fuzzy search
  const getEditDistance = (a: string, b: string) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    return matrix[b.length][a.length];
  };

  // Search geocoding
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      // 1. Fuzzy search on saved locations first
      const q = searchQuery.toLowerCase();
      const localMatches = locNames
        .map((name) => ({
          name,
          dist: getEditDistance(q, name.toLowerCase()),
        }))
        .filter((m) => m.dist <= 3 || m.name.toLowerCase().includes(q))
        .sort((a, b) => a.dist - b.dist)
        .map((m): GeocodeResult => ({
          name: m.name,
          saved: true,
          latitude: locationsConfig[m.name].coords[0],
          longitude: locationsConfig[m.name].coords[1],
        }));

      // 2. Fetch from Geocoding API
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          searchQuery
        )}&count=5&language=en&format=json`
      );
      if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
      const data: { results?: GeocodeResult[] } = await res.json();
      const apiResults = data.results ?? [];
      
      setSearchResults([...localMatches, ...apiResults]);
      setSelectedResultIndex(0);
    } catch (err) {
      console.error(err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const manualCoordsValid =
    Number.isFinite(manualLat) && Number.isFinite(manualLon) &&
    Math.abs(manualLat) <= 90 && Math.abs(manualLon) <= 180;

  return (
    <>
      <h2 className="text-2xl font-bold text-[#e8f0fe]">Search Location</h2>

      {/* Streamlit Tab Buttons */}
      <div className="flex flex-wrap gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06]">
        {LOCATION_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[130px] py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-gradient-to-r from-[#0072ff] to-[#00c6ff] text-white shadow-md shadow-[#0072ff]/30"
                : "text-[#8fa6c0] hover:text-[#e8f0fe] hover:bg-white/[0.04]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Saved Locations */}
      {activeTab === "saved" && (
        <div className="space-y-3 glass-card !p-5">
          <label className="block text-sm font-medium text-[#8fa6c0]">
            Select location:
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedLocDropdown}
              onChange={(e) => setSelectedLocDropdown(e.target.value)}
              className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-[#e8f0fe] text-sm focus:outline-none focus:border-[#00c6ff]"
            >
              {locNames.map((name) => (
                <option key={name} value={name} className="bg-slate-900 text-white">
                  {name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const loc = locationsConfig[selectedLocDropdown];
                if (loc) onConfirm(loc.coords[0], loc.coords[1], selectedLocDropdown);
              }}
              className="btn-primary py-3 px-6 whitespace-nowrap text-sm"
            >
              Use this location
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Geocoding Search */}
      {activeTab === "search" && (
        <div className="space-y-4 glass-card !p-5">
          <label className="block text-sm font-medium text-[#8fa6c0]">
            Enter location name:
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="e.g. Vung Tau, Ha Noi, Ho Chi Minh City..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-[#e8f0fe] text-sm focus:outline-none focus:border-[#00c6ff]"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="btn-primary py-3 px-6 text-sm disabled:opacity-50 whitespace-nowrap"
            >
              {searching ? "Searching..." : "🔍 Search"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3 pt-2">
              <p className="text-xs font-semibold text-[#a0d8ff] uppercase tracking-wider">
                Select a result:
              </p>
              <div className="space-y-2">
                {searchResults.map((r, i) => (
                  <label
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-all cursor-pointer ${
                      selectedResultIndex === i
                        ? "bg-[#0072ff]/15 border-[#00c6ff] text-white"
                        : "bg-black/30 border-white/5 text-[#8fa6c0] hover:border-white/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="searchResult"
                      checked={selectedResultIndex === i}
                      onChange={() => setSelectedResultIndex(i)}
                      className="text-[#00c6ff] focus:ring-[#00c6ff]"
                    />
                    <span>
                      <strong className="text-white">{r.name}</strong>
                      {r.saved ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-[#00c6ff]">
                          Saved
                        </span>
                      ) : (
                        <>, {[r.admin1, r.country].filter(Boolean).join(", ")}</>
                      )}{" "}
                      <span className="font-mono text-xs text-[#8fa6c0]">
                        ({r.latitude.toFixed(4)}, {r.longitude.toFixed(4)})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => {
                  const r = searchResults[selectedResultIndex];
                  if (r) {
                    // Saved locations keep their exact name (PDF photo lookup depends on it).
                    const name = r.saved
                      ? r.name
                      : [r.name, r.country].filter(Boolean).join(", ");
                    onConfirm(r.latitude, r.longitude, name);
                  }
                }}
                className="btn-primary w-full py-3 text-sm"
              >
                ✅ Confirm this location
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Interactive Map */}
      {activeTab === "map" && (
        <div className="space-y-4 glass-card !p-5">
          <p className="text-xs text-[#8fa6c0]">
            Click anywhere on the map to get coordinates. Then confirm to use that location.
          </p>
          <InteractiveMap
            selectedLat={selectedLat}
            selectedLon={selectedLon}
            clickedLat={clickedMapLat}
            clickedLon={clickedMapLon}
            onMapClick={(lat, lon) => {
              setClickedMapLat(lat);
              setClickedMapLon(lon);
            }}
          />
          {clickedMapLat && clickedMapLon ? (
            <div className="flex flex-col sm:flex-row justify-between items-center p-4 rounded-xl bg-[#0072ff]/10 border border-[#00c6ff]/30 gap-4">
              <span className="text-sm text-[#e8f0fe]">
                📍 <strong>Clicked:</strong> Lat <code>{clickedMapLat}</code> | Lon{" "}
                <code>{clickedMapLon}</code>
              </span>
              <button
                onClick={() => {
                  const name = `Custom (${clickedMapLat}, ${clickedMapLon})`;
                  setClickedMapLat(null);
                  setClickedMapLon(null);
                  onConfirm(clickedMapLat, clickedMapLon, name);
                }}
                className="btn-primary py-2.5 px-6 text-sm"
              >
                ✅ Use this location
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-[#8fa6c0]">
              ✅ <strong>Confirmed location:</strong> {locationName} | Lat{" "}
              <code>{selectedLat}</code> | Lon <code>{selectedLon}</code>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Manual Coordinates */}
      {activeTab === "manual" && (
        <div className="space-y-4 glass-card !p-5">
          <p className="text-xs text-[#8fa6c0]">
            Enter coordinates manually — useful for offshore platforms or technical locations.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#8fa6c0] uppercase tracking-wider mb-1">
                Latitude:
              </label>
              <input
                type="number"
                step="0.0001"
                value={manualLat}
                onChange={(e) => setManualLat(parseFloat(e.target.value))}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-[#e8f0fe] font-mono text-sm focus:outline-none focus:border-[#00c6ff]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#8fa6c0] uppercase tracking-wider mb-1">
                Longitude:
              </label>
              <input
                type="number"
                step="0.0001"
                value={manualLon}
                onChange={(e) => setManualLon(parseFloat(e.target.value))}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-[#e8f0fe] font-mono text-sm focus:outline-none focus:border-[#00c6ff]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#8fa6c0] uppercase tracking-wider mb-1">
              Location name (optional):
            </label>
            <input
              type="text"
              placeholder="e.g. Platform X, Block Y..."
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-[#e8f0fe] text-sm focus:outline-none focus:border-[#00c6ff]"
            />
          </div>
          {!manualCoordsValid && (
            <p className="text-xs text-red-300">{COORD_RANGE_ERR}</p>
          )}
          <button
            disabled={!manualCoordsValid}
            onClick={() => {
              const name =
                manualName.trim() || `(${manualLat.toFixed(4)}, ${manualLon.toFixed(4)})`;
              onConfirm(manualLat, manualLon, name);
            }}
            className="btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✅ Confirm coordinates
          </button>
        </div>
      )}
    </>
  );
}
