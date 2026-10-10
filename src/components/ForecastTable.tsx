import { fmt, rainUnit } from "@/lib/units";
import type { WeatherPoint } from "@/types/weather";

interface ForecastTableProps {
  weatherData: WeatherPoint[];
  fetchedSource: string;
}

export default function ForecastTable({ weatherData, fetchedSource }: ForecastTableProps) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <div className="section-header flex-1">
          {/* Table icon from Streamlit line 893 */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v18" />
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
          </svg>
          Forecast Data Table
        </div>
      </div>

      {/* Custom Table with Streamlit Exact Styling */}
      <div className="max-h-[500px] overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md">
        <table className="w-full text-left font-mono text-xs text-[#d1d9e6]">
          <thead className="sticky top-0 bg-[#0072ff]/20 text-[#e8f0fe] font-sans font-semibold text-[13px] uppercase tracking-wider backdrop-blur-md z-10 shadow-sm border-b border-white/[0.06]">
            <tr>
              <th className="p-3">Date/Time</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-right">Temp (°C)</th>
              <th className="p-3 text-right">Hum (%)</th>
              <th className="p-3 text-right">Wind (knots)</th>
              <th className="p-3 text-right">Gust (knots)</th>
              <th className="p-3 text-center">Wind Dir</th>
              <th className="p-3 text-right">Rain ({rainUnit(fetchedSource)})</th>
              <th className="p-3 text-right">PoP (%)</th>
              <th className="p-3 text-right">UV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {weatherData.map((row, idx) => {
              const isExtremeTemp = row.temperature && row.temperature > 37;
              const isExtremeWind = row.wind_speed && row.wind_speed > 25;
              const isExtremeRain = row.rain && row.rain > 0.5;
              const isExtremeUv = row.uv_index && row.uv_index > 10;

              return (
                <tr
                  key={idx}
                  className="hover:bg-[#00c6ff]/10 transition-colors even:bg-white/[0.02]"
                >
                  <td className="p-3 whitespace-nowrap">{row.datetime}</td>
                  <td className="p-3 whitespace-nowrap font-sans">
                    {row.description || "—"}
                  </td>
                  <td
                    className={`p-3 text-right ${
                      isExtremeTemp
                        ? "bg-[rgba(255,107,107,0.25)] text-[#ffa0a0] font-semibold"
                        : ""
                    }`}
                  >
                    {fmt(row.temperature, 1, "", "—")}
                  </td>
                  <td className="p-3 text-right">
                    {fmt(row.humidity, 0, "", "—")}
                  </td>
                  <td
                    className={`p-3 text-right ${
                      isExtremeWind
                        ? "bg-[rgba(255,107,107,0.25)] text-[#ffa0a0] font-semibold"
                        : ""
                    }`}
                  >
                    {fmt(row.wind_speed, 1, "", "—")}
                  </td>
                  <td className="p-3 text-right">
                    {fmt(row.wind_gust, 1, "", "—")}
                  </td>
                  <td className="p-3 text-center">{row.wind_direction ?? "—"}</td>
                  <td
                    className={`p-3 text-right ${
                      isExtremeRain
                        ? "bg-[rgba(255,107,107,0.25)] text-[#ffa0a0] font-semibold"
                        : ""
                    }`}
                  >
                    {fmt(row.rain, 1, "", "—")}
                  </td>
                  <td className="p-3 text-right">
                    {fmt(row.pop, 0, "", "—")}
                  </td>
                  <td
                    className={`p-3 text-right ${
                      isExtremeUv
                        ? "bg-[rgba(255,107,107,0.25)] text-[#ffa0a0] font-semibold"
                        : ""
                    }`}
                  >
                    {fmt(row.uv_index, 1, "", "—")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
