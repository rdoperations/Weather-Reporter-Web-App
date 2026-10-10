import { useMemo } from "react";
import { Waves } from "lucide-react";
import { forecastDaysLabel, summarizeForecast, type WaveSummary } from "@/lib/derive";
import { fmt, rainUnit } from "@/lib/units";
import type { LocationInfo, WeatherPoint } from "@/types/weather";
import { CardSvg, MetricCard, RAIN, SectionHeader, SUN, THERMOMETER, WIND } from "./ui";

interface ForecastSummaryProps {
  weatherData: WeatherPoint[];
  locationInfo: LocationInfo | null;
  locationName: string;
  fetchedSource: string;
  wave: WaveSummary | null;
}

export default function ForecastSummary({
  weatherData,
  locationInfo,
  locationName,
  fetchedSource,
  wave,
}: ForecastSummaryProps) {
  const summary = useMemo(() => summarizeForecast(weatherData), [weatherData]);
  if (!summary) return null;

  return (
    <section>
      <SectionHeader
        icon={
          <>
            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
            <path d="m19 9-5 5-4-4-3 3" />
          </>
        }
      >
        Weather Forecast Summary - For Next {forecastDaysLabel(fetchedSource)} Days
      </SectionHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<CardSvg color="#ff6b6b">{THERMOMETER}</CardSvg>}
          label="Temp (Min–Max)"
          value={
            <>
              {summary.tempMin} – {summary.tempMax}
            </>
          }
        />
        <MetricCard
          icon={<CardSvg color="#00c6ff">{WIND}</CardSvg>}
          label="Wind (Min–Max)"
          value={
            <>
              {summary.windMin} – {summary.windMax} kt
            </>
          }
        />
        <MetricCard
          icon={<CardSvg color="#4dabf7">{RAIN}</CardSvg>}
          label="Rain (Max)"
          value={
            <>
              {summary.rainMax} {rainUnit(fetchedSource)}
            </>
          }
        />
        {wave ? (
          <MetricCard
            icon={<Waves size={28} color="#22b8cf" className="mx-auto" aria-hidden="true" />}
            label="Wave Height (Max)"
            value={fmt(wave.max, 1, " m")}
          />
        ) : (
          <MetricCard
            icon={<CardSvg color="#ffd43b">{SUN}</CardSvg>}
            label="UV Index (Max)"
            value={summary.uvMax}
          />
        )}
      </div>

      {locationInfo && (
        <div className="mt-4 text-xs text-[#8fa6c0]">
          <strong>Location Info:</strong> {locationInfo.name || locationName} &bull;{" "}
          <strong>Timezone:</strong> {locationInfo.timezone || "N/A"}{" "}
          {locationInfo.sunrise && (
            <>
              &bull; <strong>Sunrise:</strong> {locationInfo.sunrise}
            </>
          )}{" "}
          {locationInfo.sunset && (
            <>
              &bull; <strong>Sunset:</strong> {locationInfo.sunset}
            </>
          )}{" "}
          &bull; <strong>Local Time:</strong> {weatherData[0].datetime}
        </div>
      )}
    </section>
  );
}
