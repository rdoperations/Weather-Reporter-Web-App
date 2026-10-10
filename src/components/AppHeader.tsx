import Image from "next/image";

function clockIn(timeZone: string): string {
  try {
    return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  } catch {
    // Unknown IANA zone: fall back to the browser's clock.
    return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
}

export default function AppHeader({ timezone }: { timezone?: string }) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-white/10">
      <div className="flex items-center gap-4">
        <div className="relative w-12 h-12 flex-shrink-0">
          <Image src="/Pictures/Logo.png" alt="Logo" fill sizes="48px" className="object-contain" priority />
        </div>
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#e8f0fe] tracking-tight">
            Weather Reporter
          </h1>
          <p className="text-xs text-[#8fa6c0] mt-0.5">
            High-accuracy Offshore & Meteorological Intelligence
          </p>
        </div>
      </div>

      {timezone && (
        <div className="weather-badge">
          <span className="live-dot" />
          <span>
            Time: <strong>{clockIn(timezone)}</strong> | Timezone: <strong>{timezone}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
