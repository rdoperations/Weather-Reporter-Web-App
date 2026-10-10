"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/units";
import type { LocationInfo } from "@/types/weather";

const HIST_MAX_DAYS = 31;
const HIST_LAG_DAYS = 5;
const DAY_MS = 86_400_000;

// A function (not a value): the clock must only be read in handlers / post-fetch rendering,
// never while prerendering the page.
const getMaxHistDate = () =>
  new Date(Date.now() - HIST_LAG_DAYS * DAY_MS).toISOString().slice(0, 10);

interface ExportPanelProps {
  lat: number;
  lon: number;
  locationName: string;
  /** Source the on-screen forecast came from (the PDF is generated from the same source). */
  fetchedSource: string;
  locationInfo: LocationInfo | null;
}

export default function ExportPanel({
  lat,
  lon,
  locationName,
  fetchedSource,
  locationInfo,
}: ExportPanelProps) {
  // Forecast PDF
  const [pdfLang, setPdfLang] = useState<"en" | "vi">("en");
  const [exportingPdf, setExportingPdf] = useState(false);

  // Historical export
  const [histStartDate, setHistStartDate] = useState<string>("");
  const [histEndDate, setHistEndDate] = useState<string>("");
  const [exportingHist, setExportingHist] = useState(false);
  const [histPdfLang, setHistPdfLang] = useState<"en" | "vi">("en");

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: lat,
          lon: lon,
          source: fetchedSource,
          location_name: locationName,
          language: pdfLang,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const now = new Date();
      const ts = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + "_" +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0');
      a.download = `Weather_Report_${fetchedSource}_${locationName.replace(/[^a-zA-Z0-9]/g, "_")}_${ts}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (e) {
      alert("Error generating PDF: " + errorMessage(e, "unknown error"));
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Historical export (Open-Meteo archive API) ─────────────────────────────
  // Archive data trails real time by a few days, and very long ranges produce huge
  // payloads/PDFs that exceed serverless limits, so both are enforced here.
  const histRangeError = (): string => {
    if (!histStartDate || !histEndDate) return "Please select both start and end dates.";
    const start = Date.parse(`${histStartDate}T00:00:00Z`);
    const end = Date.parse(`${histEndDate}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end)) return "Invalid date.";
    if (start > end) return "Start date must not be after the end date.";
    const maxHistDate = getMaxHistDate();
    if (histEndDate > maxHistDate) {
      return `Archive data is only available up to ${maxHistDate} (about ${HIST_LAG_DAYS} days behind today).`;
    }
    const days = Math.round((end - start) / DAY_MS) + 1;
    if (days > HIST_MAX_DAYS) {
      return `Please select at most ${HIST_MAX_DAYS} days (selected ${days}).`;
    }
    return "";
  };

  const fileTimestamp = () => {
    const now = new Date();
    const p2 = (n: number) => n.toString().padStart(2, "0");
    return `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}_${p2(now.getHours())}${p2(now.getMinutes())}`;
  };

  const safeName = () => locationName.replace(/[^a-zA-Z0-9]/g, "_");

  const downloadBlob = (blob: Blob, filename: string) => {
    const objUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(objUrl), 1000);
  };

  // One fetch for both PDF and CSV: wind is requested in knots to match the rest of the app.
  const fetchHistorical = async () => {
    const err = histRangeError();
    if (err) throw new Error(err);
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: histStartDate,
      end_date: histEndDate,
      hourly:
        "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,surface_pressure,cloudcover,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
      wind_speed_unit: "kn",
      timezone: "auto",
    });
    const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    if (!res.ok) throw new Error("Failed to fetch historical data from Open-Meteo Archive API.");
    const data = await res.json();
    const hourly = data.hourly;
    if (!hourly || !hourly.time || hourly.time.length === 0) {
      throw new Error("No historical data available for these dates.");
    }
    return { hourly, timezone: data.timezone as string | undefined };
  };

  const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

  // Historical PDF export
  const handleExportHistoricalPdf = async () => {
    const rangeErr = histRangeError();
    if (rangeErr) {
      alert(rangeErr);
      return;
    }
    setExportingHist(true);
    try {
      const { hourly, timezone } = await fetchHistorical();
      const w_data = hourly.time.map((t: string, i: number) => {
        const dir = hourly.wind_direction_10m[i];
        return {
          datetime: t.replace("T", " "),
          temperature: hourly.temperature_2m[i],
          humidity: hourly.relative_humidity_2m[i],
          dew_point: hourly.dew_point_2m[i],
          rain: hourly.precipitation[i],
          cloud_cover: hourly.cloudcover[i],
          wind_speed: hourly.wind_speed_10m[i],
          wind_gust: hourly.wind_gusts_10m[i],
          wind_direction:
            dir === null || dir === undefined ? "N/A" : COMPASS[Math.floor(dir / 22.5 + 0.5) % 16],
          pop: null,
          uv_index: null,
          description: "N/A",
        };
      });

      const pdfRes = await fetch("/api/export/pdf_custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: lat,
          lon: lon,
          source: "Historical Data",
          location_name: locationName,
          language: histPdfLang,
          w_data,
          l_info: { ...(locationInfo || { name: locationName }), timezone: timezone || locationInfo?.timezone || "UTC" },
        }),
      });
      if (!pdfRes.ok) throw new Error("Failed to generate Historical PDF");
      downloadBlob(await pdfRes.blob(), `Historical_Weather_${safeName()}_${fileTimestamp()}.pdf`);
    } catch (e) {
      alert("Error: " + errorMessage(e, "unknown error"));
    } finally {
      setExportingHist(false);
    }
  };

  // Historical CSV export
  const handleExportHistoricalCsv = async () => {
    const rangeErr = histRangeError();
    if (rangeErr) {
      alert(rangeErr);
      return;
    }
    setExportingHist(true);
    try {
      const { hourly } = await fetchHistorical();
      const cols: [string, string][] = [
        ["time", "time"],
        ["temperature_2m", "temperature_2m (°C)"],
        ["relative_humidity_2m", "relative_humidity_2m (%)"],
        ["dew_point_2m", "dew_point_2m (°C)"],
        ["precipitation", "precipitation (mm)"],
        ["surface_pressure", "surface_pressure (hPa)"],
        ["cloudcover", "cloudcover (%)"],
        ["wind_speed_10m", "wind_speed_10m (kn)"],
        ["wind_direction_10m", "wind_direction_10m (°)"],
        ["wind_gusts_10m", "wind_gusts_10m (kn)"],
      ];
      const header = cols.map(([, label]) => label).join(",");
      const rows = hourly.time.map((_: string, i: number) =>
        cols.map(([key]) => (hourly[key]?.[i] ?? "")).join(",")
      );
      // BOM so Excel opens the "°" characters correctly.
      const blob = new Blob(["﻿" + [header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `Historical_Weather_${safeName()}_${fileTimestamp()}.csv`);
    } catch (e) {
      alert("Error: " + errorMessage(e, "unknown error"));
    } finally {
      setExportingHist(false);
    }
  };

  return (
    <section>
      <div className="section-header">
        {/* Download SVG from Streamlit line 1007 */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
        Export Reports
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PDF Export Card */}
        <div className="export-card space-y-4 flex flex-col justify-between">
          <div>
            <div className="export-card-title">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              </svg>
              Weather Forecast Report - PDF
            </div>

            <div className="flex items-center gap-5 text-sm flex-wrap mt-4">
              <span className="text-[#8fa6c0]">PDF Language:</span>
              <label className="flex items-center gap-2 cursor-pointer text-[#e8f0fe]">
                <input
                  type="radio"
                  name="pdfLang"
                  checked={pdfLang === "en"}
                  onChange={() => setPdfLang("en")}
                  className="accent-[#00c6ff]"
                />
                English
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[#e8f0fe]">
                <input
                  type="radio"
                  name="pdfLang"
                  checked={pdfLang === "vi"}
                  onChange={() => setPdfLang("vi")}
                  className="accent-[#00c6ff]"
                />
                Vietnamese
              </label>
            </div>
          </div>

          <button
            onClick={handleDownloadPdf}
            disabled={exportingPdf}
            className="btn-primary w-full py-3 text-sm disabled:opacity-50 mt-auto"
          >
            {exportingPdf
              ? "Generating PDF Report..."
              : `Download ${pdfLang === "vi" ? "Vietnamese" : "English"} PDF`}
          </button>
        </div>
        
        {/* Historical Data Export Card */}
        <div className="export-card space-y-4 flex flex-col justify-between">
          <div>
            <div className="export-card-title mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M3 10h18" />
                <path d="M10 16h4" />
                <path d="M12 14v4" />
              </svg>
              Historical Weather Report - PDF
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div>
                <label className="text-[#8fa6c0] block mb-1">Start Date</label>
                <input 
                  type="date" 
                  value={histStartDate}
                  max={getMaxHistDate()}
                  onChange={(e) => setHistStartDate(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" 
                />
              </div>
              <div>
                <label className="text-[#8fa6c0] block mb-1">End Date</label>
                <input 
                  type="date" 
                  value={histEndDate}
                  max={getMaxHistDate()}
                  onChange={(e) => setHistEndDate(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" 
                />
              </div>
            </div>

            <div className="flex items-center gap-5 text-sm flex-wrap mb-2">
              <span className="text-[#8fa6c0]">PDF Language:</span>
              <label className="flex items-center gap-2 cursor-pointer text-[#e8f0fe]">
                <input
                  type="radio"
                  name="histPdfLang"
                  checked={histPdfLang === "en"}
                  onChange={() => setHistPdfLang("en")}
                  className="accent-[#00c6ff]"
                />
                English
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[#e8f0fe]">
                <input
                  type="radio"
                  name="histPdfLang"
                  checked={histPdfLang === "vi"}
                  onChange={() => setHistPdfLang("vi")}
                  className="accent-[#00c6ff]"
                />
                Vietnamese
              </label>
            </div>
            
            <p className="text-[11px] text-yellow-400 mt-2 bg-yellow-400/10 p-2 rounded-lg border border-yellow-400/20">
              ⚠️ <strong>Note:</strong> Historical data can be large in size. Generating and downloading the PDF file may take longer than usual. Please be patient. Maximum range: {HIST_MAX_DAYS} days; latest available date: {getMaxHistDate()}. Wind is in knots.
            </p>
          </div>

          <div className="flex gap-3 mt-auto">
            <button
              onClick={handleExportHistoricalCsv}
              disabled={exportingHist || !histStartDate || !histEndDate}
              className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
            >
              {exportingHist ? "Working..." : `Download CSV`}
            </button>
            <button
              onClick={handleExportHistoricalPdf}
              disabled={exportingHist || !histStartDate || !histEndDate}
              className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
            >
              {exportingHist ? "Generating PDF..." : `Download PDF`}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
