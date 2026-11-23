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
import Reveal from "@/components/Reveal";
import ScrollChrome from "@/components/ScrollChrome";
import SourceBar from "@/components/SourceBar";
import WeatherChart from "@/components/WeatherChart";
import { SectionHeader } from "@/components/ui";
import { useWeather } from "@/hooks/useWeather";
import { computeWave } from "@/lib/derive";
import { AIRPORT_LOCATIONS, type LocationProfile } from "@/config/operatingLimits";

export default function Home() {
  const {
    locationsConfig,
    defaultLocation,
    selected,
    dataSource,
    setDataSource,
    fetchedSource,
    loading,
    loadCount,
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
    [weatherData, marineData, locationsConfig, selected.name],
  );

  // Offshore platforms use the platform procedure; everything else gets land criteria.
  const profile: LocationProfile =
    locationsConfig[selected.name]?.marine_forecast === true || wave !== null
      ? "offshore"
      : AIRPORT_LOCATIONS.includes(selected.name)
        ? "airport"
        : "onshore";

  const currentPoint =
    weatherData && weatherData.length > 0 ? weatherData[0] : null;

  return (
    <main className="min-h-screen text-[#d1d9e6] p-4 sm:p-6 md:p-10 max-w-[1400px] mx-auto space-y-6">
      <ScrollChrome />
      <AppHeader timezone={locationInfo?.timezone} />

      <div className="space-y-4">
        <LocationPicker
          locationsConfig={locationsConfig}
          defaultLocation={defaultLocation}
          selected={selected}
          onConfirm={selectLocation}
          loading={loading}
          loadCount={loadCount}
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
          <Reveal>
            <CurrentConditions
              point={currentPoint}
              locationName={selected.name}
              timezone={locationInfo?.timezone}
              fetchedSource={fetchedSource}
              wave={wave}
            />
          </Reveal>

          <div className="gradient-divider" />

          <Reveal>
            <PrecipitationMap lat={selected.lat} lon={selected.lon} />
          </Reveal>

          <div className="gradient-divider" />

          <Reveal>
            <ForecastSummary
              weatherData={weatherData}
              locationInfo={locationInfo}
              locationName={selected.name}
              fetchedSource={fetchedSource}
              wave={wave}
            />
          </Reveal>

          <div className="gradient-divider" />

          <Reveal>
            <section>
              <SectionHeader
                icon={
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </>
                }
              >
                {profile === "offshore" ? "Operational Weather Windows" : "Outdoor Activities Planning"}
              </SectionHeader>
              <OperationalWindows
                weatherData={weatherData}
                marineData={marineData}
                profile={profile}
                timezone={locationInfo?.timezone}
              />
            </section>
          </Reveal>

          <div className="gradient-divider" />

          <Reveal>
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
              <WeatherChart
                weatherData={weatherData}
                marineData={marineData}
                apiSource={fetchedSource}
              />
            </section>
          </Reveal>

          <div className="gradient-divider" />

          <Reveal>
            <ForecastTable
              weatherData={weatherData}
              fetchedSource={fetchedSource}
            />
          </Reveal>

          <div className="gradient-divider" />

          <Reveal>
            <ExportPanel
              lat={selected.lat}
              lon={selected.lon}
              locationName={selected.name}
              fetchedSource={fetchedSource}
              locationInfo={locationInfo}
              profile={profile}
            />
          </Reveal>
        </>
      )}
    </main>
  );
}
