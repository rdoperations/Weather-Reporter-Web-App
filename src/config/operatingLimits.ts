// Operating limits for the "Operational Weather Windows" panel.
//
// Source: OPS-2000-MP-1405 Rev 1.8 "Adverse Weather Policy" (Jul 22), Appendix A tables.
// Company policy: applies to both the Lan Tay and Rong Doi platforms.
//
// Conventions
//  - Wind values are 10-minute MEAN wind speed at 10 m, in knots (the procedure's basis;
//    Open-Meteo's wind_speed_10m is the matching quantity). "X kts and higher" => >= X.
//  - Wave values are significant wave height (Hs), metres.
//  - `caution` = the procedure starts adding precautions / requires risk assessment.
//  - `stop`    = the procedure ceases or prohibits the activity (routine work).
//  - Where the procedure is silent the value is flagged "Good practice:" in `notes`.
//  - Users can adjust limits in the UI; adjustments are stored per browser only.

export type ActivityIcon = "crane" | "helicopter" | "ship" | "lifebuoy" | "ladder" | "hardhat";

export interface ActivityLimit {
  id: string;
  label: string;
  /** Icon shown next to the label (resolved in OperationalWindows). */
  icon: ActivityIcon;
  /** Mean wind, knots: precautions begin / activity ceases. */
  windCaution: number;
  windStop: number;
  /** Gust, knots: activity ceases. null = no gust criterion. */
  gustStop: number | null;
  /** Significant wave height, metres. null = not wave-sensitive. */
  hsCaution: number | null;
  hsStop: number | null;
  /** Heavy rain (impaired visibility, slippery surfaces) raises CAUTION. */
  rainSensitive: boolean;
  /** Procedure references and reasoning, shown under each activity. */
  notes: string[];
}

/** Heavy rain threshold, mm per hour (WMO "heavy rain" starts at 7.6 mm/h). */
export const HEAVY_RAIN_MM_PER_H = 7.6;

export const DEFAULT_LIMITS: ActivityLimit[] = [
  {
    id: "crane",
    label: "Crane operations",
    icon: "crane",
    windCaution: 25,
    windStop: 40,
    gustStop: null,
    hsCaution: 3.0,
    hsStop: 4.0,
    rainSensitive: true,
    notes: [
      "A6 1.2: 25–40 kt – tag lines, slew downwind with caution, only essential lifts.",
      "A6 1.3: 40–45 kt – stop routine lifts; inboard lifts within rating only, with OIM approval. 45+ kt – boom rest.",
      "A6 2.1 / A5 2.1: Hs 3–4 m – risk assessment for vessel lifts; at 4 m OIM/vessel master suspend if necessary.",
      "A6 1.1: 20+ kt with both compressors running and wind toward the cabin – exhaust plume risk (direction-dependent, not evaluated here).",
      "Good practice: thunderstorm = NO-GO for lifting.",
    ],
  },
  {
    id: "helideck",
    label: "Helideck operations",
    icon: "helicopter",
    windCaution: 45,
    windStop: 60,
    gustStop: 60,
    hsCaution: 5.5,
    hsStop: 7.0,
    rainSensitive: true,
    notes: [
      "A3 1.1–1.3: 45 kt – inform aircrew; 45–60 kt – HLO inspection, safety lines, OIM review.",
      "A3 1.4: 60+ kt including gusts – mandatory closure for routine flights (measured at the helideck).",
      "A2 2.1–2.2: Hs > 5.5 m – flying depends on good prospect of recovery (flying chart); 7 m – limit of flying per Helicopter Operating Procedures.",
      "A2 5.1: lightning / thunderstorms – suspend flying.",
      "A2 1.0 (wind) is blank in the procedure ('[HOLD] Kts'); A3 values used. Visibility < 250 m also suspends flying (not in forecast data).",
    ],
  },
  {
    id: "vessel",
    label: "Supply vessel operations",
    icon: "ship",
    windCaution: 20,
    windStop: 40,
    gustStop: null,
    hsCaution: 3.0,
    hsStop: 4.0,
    rainSensitive: true,
    notes: [
      "A5 1.1: 20–25 kt – risk assessment (OIM, crane driver, vessel master) before starting/continuing.",
      "A5 1.3–1.4: 35–45 kt – extra care; 40–45 kt – no wide/broad-sided loads, urgent lifts only. 45+ kt – vessel stands off outside 500 m.",
      "A5 2.1: Hs 3–4 m – risk assessment before entering 500 m zone; continued operations at the vessel master's discretion.",
      "Good practice: Hs ≥ 4 m treated as NO-GO for routine cargo work (A6 2.1: suspend if necessary).",
      "Vessel master may stop earlier (rolling, power use ≥ 45–50 % to hold station) – not evaluable from forecast.",
    ],
  },
  {
    id: "overside",
    label: "Overside work",
    icon: "lifebuoy",
    windCaution: 25,
    windStop: 30,
    gustStop: null,
    hsCaution: 2.5,
    hsStop: 3.5,
    rainSensitive: true,
    notes: [
      "A1 1.5: 30–35 kt – cease over-side working (and rope access) due to man-overboard risk.",
      "A1 2.2 / A4 1.3: Hs 3.5 m+ – stop all over-side work (FRC launch/recovery). A4 1.2: 3.0–3.5 m – Master/OIM to decide.",
      "A4 1.1: Hs 2.5–3.0 m – standby vessel must be on close standby during over-side work.",
      "A1 3.1 / A4 2.1: visibility < 250 m – cease (not in forecast data).",
      "Good practice: wind CAUTION from 25 kt (procedure is silent below 30 kt); thunderstorm = NO-GO.",
    ],
  },
  {
    id: "wah",
    label: "Working at height (scaffolding, rope access, sampling)",
    icon: "ladder",
    windCaution: 25,
    windStop: 30,
    gustStop: null,
    hsCaution: null,
    hsStop: null,
    rainSensitive: true,
    notes: [
      "A1 1.3–1.4: 25 kt and higher – cease working at height for manual oil-level measurement and sampling; 30 kt and higher – cease ALL types of working at height.",
      "A1 1.5: 30–35 kt – cease rope access (pendulum effect); minimise ladder access in exposed locations.",
      "A1 1.7: 40–50 kt – do not access scaffold structures in exposed locations (collapse risk).",
      "Site decision: one combined indicator at 25 kt caution / 30 kt stop. Note A1 1.2 of the procedure ceases scaffold assembly/disassembly at 20 kt and higher – treat 20–25 kt as a task-level check for scaffold erection.",
      "Good practice: thunderstorm = NO-GO (exposed metalwork, lightning).",
    ],
  },
  {
    id: "deck",
    label: "General deck / exposed-area access",
    icon: "hardhat",
    windCaution: 30,
    windStop: 50,
    gustStop: null,
    hsCaution: null,
    hsStop: null,
    rainSensitive: true,
    notes: [
      "A1 1.5–1.6: 30–40 kt – secure/lash loose items, secure doors, extra caution in toolbox talks.",
      "A1 1.7: 40–50 kt – PA high-wind warnings to crew.",
      "A1 1.8: 50+ kt – inspect external areas periodically, cordon off unsafe areas, avoid wind-affected areas.",
      "Appendix A (sub cellar deck): wind 50 kt with Hs 7 m – barrier the sub cellar deck access and inform Ops Sup.",
    ],
  },
];
