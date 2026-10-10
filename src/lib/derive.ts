import type { MarinePoint, SavedLocation, WeatherPoint } from "@/types/weather";

export interface WaveSummary {
  /** Wave height at the first upcoming hour, metres. */
  current: number;
  /** Maximum wave height from now onward, metres. */
  max: number;
}

/**
 * Wave height for the headline cards. Null when the model has no wave data for the point,
 * or when a saved location opts out with `marine_forecast: false` (e.g. a coastal airport
 * whose grid cell has model waves).
 */
export function computeWave(
  weatherData: WeatherPoint[] | null,
  marineData: MarinePoint[] | null,
  saved: SavedLocation | undefined
): WaveSummary | null {
  if (!weatherData || weatherData.length === 0 || !marineData) return null;
  if (saved?.marine_forecast === false) return null;
  const start = weatherData[0].datetime;
  const heights = marineData
    .filter(
      (m) => m.datetime >= start && typeof m.wave_height === "number" && Number.isFinite(m.wave_height)
    )
    .map((m) => m.wave_height as number);
  if (heights.length === 0) return null;
  return { current: heights[0], max: Math.max(...heights) };
}

export interface ForecastSummaryStats {
  tempMin: string;
  tempMax: string;
  windMin: string;
  windMax: string;
  rainMax: string;
  uvMax: string;
}

export function summarizeForecast(weatherData: WeatherPoint[]): ForecastSummaryStats | null {
  if (weatherData.length === 0) return null;
  const nums = (pick: (d: WeatherPoint) => number | null | undefined) =>
    weatherData.map(pick).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const temps = nums((d) => d.temperature);
  const winds = nums((d) => d.wind_speed);
  const rains = nums((d) => d.rain);
  const uvs = nums((d) => d.uv_index);
  const min = (a: number[]) => (a.length ? Math.min(...a).toFixed(1) : "N/A");
  const max = (a: number[]) => (a.length ? Math.max(...a).toFixed(1) : "N/A");
  return {
    tempMin: min(temps),
    tempMax: max(temps),
    windMin: min(winds),
    windMax: max(winds),
    rainMax: max(rains),
    uvMax: max(uvs),
  };
}

/** Forecast horizon quoted in the summary heading, per data source. */
export function forecastDaysLabel(source: string): string {
  if (source === "Open-Meteo") return "14";
  if (source === "OpenWeatherMap") return "05";
  return "10";
}
