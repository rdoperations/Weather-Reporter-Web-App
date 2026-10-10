/**
 * Unit of the `rain` field for a data source.
 * Open-Meteo and MET Norway report hourly amounts; OpenWeatherMap's 5-day forecast
 * reports the accumulation over each 3-hour step.
 */
export function rainUnit(source: string): string {
  return source === "OpenWeatherMap" ? "mm/3h" : "mm/h";
}

/** Null-safe number formatting (calling .toFixed() on a null crashes the page). */
export function fmt(v: unknown, digits = 1, suffix = "", fallback = "N/A"): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : fallback;
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
