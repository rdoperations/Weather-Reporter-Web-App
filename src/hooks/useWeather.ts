"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/units";
import type {
  LocationInfo,
  LocationsResponse,
  MarinePoint,
  SavedLocation,
  WeatherApiResponse,
  WeatherPoint,
} from "@/types/weather";

const DEFAULT_NAME = "Rong Doi Platform - Block 11.2";

// Used until /api/locations answers (or if it fails).
const FALLBACK_LOCATIONS: Record<string, SavedLocation> = {
  "Lan Tay Platform - Block 06.1": { pdf_name: "Lan Tay Platform - Block 06.1", coords: [7.5783, 108.8694] },
  "Rong Doi Platform - Block 11.2": { pdf_name: "Rong Doi Platform - Block 11.2", coords: [7.7925, 108.2021] },
  "An Phu Office - An Khanh Ward": { pdf_name: "An Phu Office - An Khanh Ward", coords: [10.8094, 106.7366] },
  "Vung Tau Airport - Vung Tau": { pdf_name: "Vung Tau Airport - Vung Tau", coords: [10.376, 107.0932] },
  "Ba Dinh - Ha Noi": { pdf_name: "Ba Dinh - Ha Noi", coords: [21.0368, 105.8346] },
  "Zarubezhneft HO - Moscow": { pdf_name: "Zarubezhneft HO - Moscow", coords: [55.7596, 37.6374] },
  "Hiep Binh Chanh": { pdf_name: "Hiep Binh Chanh", coords: [10.8316, 106.7326] },
};

// Shown when the backend answers with a bare 5xx (in development this almost always means
// the Python API is not running: Next.js proxies /api/* to port 8000 and returns 500).
const API_UNREACHABLE_HINT =
  "The weather API did not respond correctly. In development make sure it is running — " +
  "`npm run dev:all` starts it together with the web app, or run " +
  "`python -m uvicorn api.index:app --port 8000` in a second terminal — and check that terminal for errors.";

export interface SelectedLocation {
  lat: number;
  lon: number;
  name: string;
}

/**
 * Owns the app's data state: saved locations, the confirmed location, the data source,
 * and the latest forecast (with a request-ID guard so a slow older response can never
 * overwrite a newer one).
 */
export function useWeather() {
  const [locationsConfig, setLocationsConfig] =
    useState<Record<string, SavedLocation>>(FALLBACK_LOCATIONS);
  const [defaultLocation, setDefaultLocation] = useState<string>(DEFAULT_NAME);
  const [selected, setSelected] = useState<SelectedLocation>({
    lat: 7.7925,
    lon: 108.2021,
    name: DEFAULT_NAME,
  });

  const [dataSource, setDataSource] = useState<string>("Open-Meteo");
  // Source the on-screen data was actually fetched from (the radio may have changed since).
  const [fetchedSource, setFetchedSource] = useState<string>("Open-Meteo");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [weatherData, setWeatherData] = useState<WeatherPoint[] | null>(null);
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [marineData, setMarineData] = useState<MarinePoint[] | null>(null);
  const requestIdRef = useRef(0);

  // Stable identity (setters and refs only): the data source is passed in explicitly.
  const loadWeather = useCallback(
    async (lat: number, lon: number, name: string, source: string) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/weather", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lon, source, location_name: name }),
        });
        if (!res.ok) {
          let msg = `Failed to fetch weather data (${res.status})`;
          let detail: string | null = null;
          try {
            const errData = await res.json();
            if (errData && typeof errData.detail === "string") detail = errData.detail;
          } catch {
            // Not a JSON error response (e.g. the dev proxy's plain "Internal Server Error")
          }
          if (detail) msg = detail;
          else if (res.status >= 500 && process.env.NODE_ENV === "development") msg = API_UNREACHABLE_HINT;
          throw new Error(msg);
        }
        const data: WeatherApiResponse = await res.json();
        if (requestId !== requestIdRef.current) return; // a newer request superseded this one
        if (!data.weather_data || data.weather_data.length === 0) {
          throw new Error("The data source returned no forecast data.");
        }
        setWeatherData(data.weather_data);
        setLocationInfo(data.location_info);
        setMarineData(data.marine_data);
        setFetchedSource(source);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(errorMessage(err, "Failed to fetch weather data"));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    []
  );

  // Load saved locations on mount & auto-fetch the default one.
  useEffect(() => {
    // The built-in location list is always usable: if the saved-locations request fails (or is
    // empty) keep it and still try the forecast, which reports its own, clearer error.
    const loadFallbackDefault = () => {
      const [lat, lon] = FALLBACK_LOCATIONS[DEFAULT_NAME].coords;
      loadWeather(lat, lon, DEFAULT_NAME, "Open-Meteo");
    };

    fetch("/api/locations")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Server responded with ${res.status} ${res.statusText}`);
        }
        return (await res.json()) as LocationsResponse;
      })
      .then((data) => {
        const locations = data.locations;
        const names = locations ? Object.keys(locations) : [];
        if (!locations || names.length === 0) {
          loadFallbackDefault();
          return;
        }
        setLocationsConfig(locations);
        const defaultName =
          data.default_location && names.includes(data.default_location)
            ? data.default_location
            : names[0];
        const [lat, lon] = locations[defaultName].coords;
        setDefaultLocation(defaultName);
        setSelected({ lat, lon, name: defaultName });
        loadWeather(lat, lon, defaultName, "Open-Meteo");
      })
      .catch((err) => {
        // console.warn, not error: Next's dev overlay turns console.error into a full-screen crash.
        console.warn("Could not load saved locations, using the built-in list:", err);
        loadFallbackDefault();
      });
  }, [loadWeather]);

  /** Confirm a location (from any picker tab) and fetch its forecast. */
  const selectLocation = (lat: number, lon: number, name: string) => {
    setSelected({ lat, lon, name });
    loadWeather(lat, lon, name, dataSource);
  };

  /** Re-fetch the current location with the currently chosen data source. */
  const refetch = () => loadWeather(selected.lat, selected.lon, selected.name, dataSource);

  return {
    locationsConfig,
    defaultLocation,
    selected,
    dataSource,
    setDataSource,
    fetchedSource,
    loading,
    error,
    weatherData,
    locationInfo,
    marineData,
    selectLocation,
    refetch,
  };
}
