// Shapes returned by the FastAPI backend (api/index.py) and used across the UI.
// Any numeric field may be null/absent: sources differ (e.g. MET Norway has no UV or PoP).

export interface WeatherPoint {
  /** "YYYY-MM-DD HH:mm" in the location's local time. */
  datetime: string;
  description?: string | null;
  temperature?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  wind_speed?: number | null;
  wind_gust?: number | null;
  wind_direction?: string | null;
  rain?: number | null;
  pop?: number | null;
  uv_index?: number | null;
  cloud_cover?: number | null;
  dew_point?: number | null;
}

export interface MarinePoint {
  datetime: string;
  wave_height?: number | null;
  wave_period?: number | null;
  swell_wave_height?: number | null;
  swell_wave_period?: number | null;
}

export interface LocationInfo {
  name?: string;
  country?: string;
  timezone?: string;
  sunrise?: string;
  sunset?: string;
}

export interface WeatherApiResponse {
  weather_data: WeatherPoint[] | null;
  location_info: LocationInfo | null;
  marine_data: MarinePoint[] | null;
}

export interface SavedLocation {
  coords: [number, number];
  pdf_name?: string;
  marine_forecast?: boolean;
}

export interface LocationsResponse {
  locations?: Record<string, SavedLocation>;
  default_location?: string;
  dashboard_locations?: string[];
}

/** A row in the location-search results: a saved location or an Open-Meteo geocoding hit. */
export interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  /** true when the row is one of the saved locations (keeps its exact name). */
  saved?: boolean;
}

export type LocationTab = "saved" | "search" | "map" | "manual";
