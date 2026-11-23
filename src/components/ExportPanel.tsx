"use client";

import { useState } from "react";
import { DEFAULT_LIMITS, type LocationProfile } from "@/config/operatingLimits";
import { errorMessage } from "@/lib/units";
import { buildHistoricalExcel, EXCEL_VARIABLES, fetchArchive } from "@/lib/historical";
import type { LocationInfo } from "@/types/weather";

// Multi-year downloads are fine (fetched in yearly chunks, built in the browser); the cap only
// protects the browser from runaway ranges.
const HIST_MAX_DAYS = 3660;
const levelsOf = (id: string, fallback: [number, number, number]): [number, number, number] =>
  DEFAULT_LIMITS.find((l) => l.id === id)?.levels?.values ?? fallback;

const HIST_MIN_DATE = "1940-01-01"; // start of the Open-Meteo archive
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
  /** Selects which alert thresholds the Excel summary counts against. */
  profile?: LocationProfile;
}

export default function ExportPanel({
  lat,
  lon,
  locationName,
  fetchedSource,
  profile = "onshore",
}: ExportPanelProps) {
  // Forecast PDF
  const [pdfLang, setPdfLang] = useState<"en" | "vi">("en");
  const [exportingPdf, setExportingPdf] = useState(false);

  // Historical export
  const [histStartDate, setHistStartDate] = useState<string>("");
  const [histEndDate, setHistEndDate] = useState<string>("");
  const [exportingHist, setExportingHist] = useState(false);
  const [histProgress, setHistProgress] = useState("");

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
    if (histStartDate < HIST_MIN_DATE) return `Archive data starts on ${HIST_MIN_DATE}.`;
    const maxHistDate = getMaxHistDate();
    if (histEndDate > maxHistDate) {
      return `Archive data is only available up to ${maxHistDate} (about ${HIST_LAG_DAYS} days behind today).`;
    }
    const days = Math.round((end - start) / DAY_MS) + 1;
    if (days > HIST_MAX_DAYS) {
      return `Please select at most 10 years per download (selected ${days} days).`;
    }
    return "";
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

  // Excel download: validates, fetches (in chunks) and reports progress.
  const runHistorical = async (variables: string[], build: (h: Awaited<ReturnType<typeof fetchArchive>>) => Promise<void>) => {
    const rangeErr = histRangeError();
    if (rangeErr) {
      alert(rangeErr);
      return;
    }
    setExportingHist(true);
    try {
      const result = await fetchArchive(lat, lon, histStartDate, histEndDate, variables, (done, total) =>
        setHistProgress(total > 1 ? `Fetching ${Math.min(done + 1, total)} / ${total}...` : "Fetching...")
      );
      setHistProgress("Building file...");
      await build(result);
    } catch (e) {
      alert("Error: " + errorMessage(e, "unknown error"));
    } finally {
      setExportingHist(false);
      setHistProgress("");
    }
  };

  // Historical Excel export
  const handleExportHistoricalExcel = () =>
    runHistorical(EXCEL_VARIABLES, async ({ hourly }) => {
      const blob = await buildHistoricalExcel({
        locationName,
        lat,
        lon,
        start: histStartDate,
        end: histEndDate,
        hourly,
        thresholds: {
          // Offshore sites have no onshore wind levels; keep the generic 20/30/40 kt scale there.
          wind: profile === "offshore" ? [20, 30, 40] : levelsOf("wind_land", [15, 20, 25]),
          rain: levelsOf("rain_land", [2.5, 5, 7.5]),
          temp: profile === "offshore" ? levelsOf("heat_offshore", [30, 33, 35]) : levelsOf("heat", [35, 37, 40]),
        },
      });
      downloadBlob(
        blob,
        `Historical_Weather_${safeName()}_${histStartDate.replace(/-/g, "")}_to_${histEndDate.replace(/-/g, "")}.xlsx`
      );
    });

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
              : `Download Weather Forecast Report - ${pdfLang === "vi" ? "VNM" : "ENG"}`}
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
              Historical Weather Report
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div>
                <label className="text-[#8fa6c0] block mb-1">Start Date</label>
                <input 
                  type="date" 
                  value={histStartDate}
                  min={HIST_MIN_DATE}
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
                  min={HIST_MIN_DATE}
                  max={getMaxHistDate()}
                  onChange={(e) => setHistEndDate(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white" 
                />
              </div>
            </div>

            <p className="text-[11px] text-yellow-400 mt-2 bg-yellow-400/10 p-2 rounded-lg border border-yellow-400/20">
              ⚠️ <strong>Note:</strong> Historical data can be large in size. Generating and downloading the file may take longer than usual. Please be patient.
            </p>
          </div>

          <button
            onClick={handleExportHistoricalExcel}
            disabled={exportingHist || !histStartDate || !histEndDate}
            className="btn-primary w-full py-3 text-sm disabled:opacity-50 mt-auto"
          >
            {exportingHist ? histProgress || "Working..." : "Download Historical Weather Report"}
          </button>
        </div>
      </div>
    </section>
  );
}
