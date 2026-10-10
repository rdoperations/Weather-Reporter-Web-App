import { Waves } from "lucide-react";
import type { WaveSummary } from "@/lib/derive";
import { fmt, rainUnit } from "@/lib/units";
import type { WeatherPoint } from "@/types/weather";
import { CardSvg, MetricCard, RAIN, SectionHeader, SUN, THERMOMETER, WIND } from "./ui";

interface CurrentConditionsProps {
  point: WeatherPoint;
  locationName: string;
  timezone?: string;
  fetchedSource: string;
  /** Offshore locations show wave height instead of UV. */
  wave: WaveSummary | null;
}

export default function CurrentConditions({
  point,
  locationName,
  timezone,
  fetchedSource,
  wave,
}: CurrentConditionsProps) {
  return (
    <section>
      <SectionHeader icon={<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z" />}>
        Current Weather Condition
      </SectionHeader>

      <div className="weather-badge mb-4">
        <span className="live-dot" />
        <span>
          Local time: <strong>{point.datetime}</strong> &bull; {timezone || "UTC"}
        </span>
      </div>

      <h4 className="text-xl font-bold text-white mb-5">
        {locationName}
        {point.description ? ` - ${point.description}` : ""}
      </h4>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<CardSvg color="#ff6b6b">{THERMOMETER}</CardSvg>}
          label="Temperature"
          value={fmt(point.temperature, 1, "°C")}
        />
        <MetricCard
          icon={<CardSvg color="#00c6ff">{WIND}</CardSvg>}
          label="Wind Speed"
          value={fmt(point.wind_speed, 1, " kt")}
        />
        <MetricCard
          icon={<CardSvg color="#4dabf7">{RAIN}</CardSvg>}
          label="Rain"
          value={fmt(point.rain, 1, " " + rainUnit(fetchedSource))}
        />
        {wave ? (
          <MetricCard
            icon={<Waves size={28} color="#22b8cf" className="mx-auto" aria-hidden="true" />}
            label="Wave Height"
            value={fmt(wave.current, 1, " m")}
          />
        ) : (
          <MetricCard
            icon={<CardSvg color="#ffd43b">{SUN}</CardSvg>}
            label="UV Index"
            value={fmt(point.uv_index, 1)}
          />
        )}
      </div>
    </section>
  );
}
