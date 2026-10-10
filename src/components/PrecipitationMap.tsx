import Image from "next/image";
import { SectionHeader } from "./ui";

export default function PrecipitationMap({ lat, lon }: { lat: number; lon: number }) {
  return (
    <section>
      <SectionHeader
        icon={
          <>
            <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
            <path d="M15 5.764v15" />
            <path d="M9 3.236v15" />
          </>
        }
      >
        Precipitation Map
      </SectionHeader>

      {/* Windy embed with the company logo overlaid */}
      <div className="relative w-full h-[500px] overflow-hidden rounded-xl border border-white/10 shadow-2xl">
        <iframe
          title="Windy precipitation map"
          src={`https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=5&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=1&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
        />
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none drop-shadow-md">
          <div className="relative w-[150px] h-[67px]">
            <Image
              src="/Pictures/Logo.png"
              alt="Logo"
              fill
              sizes="150px"
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
