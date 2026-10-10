"use client";

import { useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import CurrentConditions from "@/components/CurrentConditions";
import ExportPanel from "@/components/ExportPanel";
import ForecastSummary from "@/components/ForecastSummary";
import ForecastTable from "@/components/ForecastTable";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import LocationPicker from "@/components/LocationPicker";
import OperationalWindows from "@/components/OperationalWindows";
import PrecipitationMap from "@/components/PrecipitationMap";
import SourceBar from "@/components/SourceBar";
import WeatherChart from "@/components/WeatherChart";
import { SectionHeader } from "@/components/ui";
import { useWeather } from "@/hooks/useWeather";
import { computeWave } from "@/lib/derive";

export default function Home() {
  const {
    locationsConfig,
    defaultLocation,
    selected,
    dataSource,
    setDataSource,
    fetchedSource,
    loading,
    error,
    weatherData,
    locationInfo,
    marineData,
    selectLocation,
    refetch,
  } = useWeather();

  // Offshore locations show wave height instead of UV in the headline cards.
  const wave = useMemo(
    () => computeWave(weatherData, marineData, locationsConfig[selected.name]),
    [weatherData, marineData, locationsConfig, selected.name]
  );

  const currentPoint = weatherData && weatherData.length > 0 ? weatherData[0] : null;

  return (
    <main className="min-h-screen text-[#d1d9e6] p-4 sm:p-6 md:p-10 max-w-[1400px] mx-auto space-y-6">
      <AppHeader timezone={locationInfo?.timezone} />

      <div className="space-y-4">
        <LocationPicker
          locationsConfig={locationsConfig}
          defaultLocation={defaultLocation}
          selected={selected}
          onConfirm={selectLocation}
        />
        <SourceBar
          selected={selected}
          dataSource={dataSource}
          onSourceChange={setDataSource}
          onFetch={refetch}
          loading={loading}
          error={error}
        />
      </div>

      {loading && <LoadingSkeleton />}

      {weatherData && currentPoint && !loading && (
        <>
          <CurrentConditions
            point={currentPoint}
            locationName={selected.name}
            timezone={locationInfo?.timezone}
            fetchedSource={fetchedSource}
            wave={wave}
          />

          <div className="gradient-divider" />

          <PrecipitationMap lat={selected.lat} lon={selected.lon} />

          <div className="gradient-divider" />

          <ForecastSummary
            weatherData={weatherData}
            locationInfo={locationInfo}
            locationName={selected.name}
            fetchedSource={fetchedSource}
            wave={wave}
          />

          <div className="gradient-divider" />

          <section>
            <SectionHeader
              icon={
                <>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </>
              }
            >
              Operational Weather Windows
            </SectionHeader>
            <OperationalWindows weatherData={weatherData} marineData={marineData} />
          </section>

          <div className="gradient-divider" />

          <section>
            <SectionHeader
              icon={
                <>
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </>
              }
            >
              Charts
            </SectionHeader>
            <WeatherChart weatherData={weatherData} marineData={marineData} apiSource={fetchedSource} />
          </section>

          <div className="gradient-divider" />

          <ForecastTable weatherData={weatherData} fetchedSource={fetchedSource} />

          <div className="gradient-divider" />

          <ExportPanel
            lat={selected.lat}
            lon={selected.lon}
            locationName={selected.name}
            fetchedSource={fetchedSource}
            locationInfo={locationInfo}
          />
        </>
      )}
    </main>
  );
}
