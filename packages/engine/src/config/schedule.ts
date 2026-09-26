/** Round schedule (§4.1, §10). */
export type RoundKind =
  | "PVE_CAMP"
  | "PVP"
  | "FA_MARKET" // carousel then PvP
  | "ALL_STAR"
  | "RAIN_OUT"
  | "TRADE_DEADLINE"
  | "LEGEND_MATCH"
  | "PLAYOFF";

export interface RoundSpec {
  readonly index: number;
  readonly stage: number;
  readonly roundInStage: number;
  readonly code: string;
  readonly kind: RoundKind;
  /** An augment pick happens before this round's prep. */
  readonly augmentPick: boolean;
  /** Does this round contain a simulated game? */
  readonly hasGame: boolean;
}

export const SCHEDULE = {
  augmentRounds: ["2-1", "3-2", "5-1"] as readonly string[],
  events: {
    "2-4": "ALL_STAR",
    "3-4": "RAIN_OUT",
    "4-4": "TRADE_DEADLINE",
    "5-4": "LEGEND_MATCH",
  } as Readonly<Record<string, RoundKind>>,
  regularStages: [2, 3, 4, 5, 6] as readonly number[],
  roundsPerRegularStage: 4,
  /** Maximum postseason rounds the schedule pre-allocates (the run may end sooner). */
  maxPostseasonRounds: 3,
  /** Real-time prep limits in seconds (§4.1). */
  timers: { prepS1: 30, prep: 40, carouselWave: 6, carouselWaveJourneyman: 9, augment: 25, playback: 20, settle: 4 },
  /** Carousel cost range by stage (§10.1). */
  carouselCosts: { 2: [1, 2], 3: [2, 3], 4: [3, 3], 5: [3, 4], 6: [4, 5] } as Readonly<Record<number, readonly [number, number]>>,
  carouselWithItemStages: [2, 3] as readonly number[],
  carouselCards: 8,
  carouselWaveSize: 2,
  finalCarouselWaveSize: 1,
  /** Spring camp rewards (§4.1). */
  campRewards: { "1-1": "ITEM", "1-2": "GOLD_3", "1-3": "ITEM" } as Readonly<Record<string, "ITEM" | "GOLD_3">>,
  pveOvr: { camp: 40, legend: 80 },
} as const;

export function buildSchedule(): RoundSpec[] {
  const rounds: RoundSpec[] = [];
  const push = (stage: number, r: number, kind: RoundKind, hasGame: boolean) => {
    const code = `${stage}-${r}`;
    rounds.push({ index: rounds.length, stage, roundInStage: r, code, kind, augmentPick: SCHEDULE.augmentRounds.includes(code), hasGame });
  };
  for (let r = 1; r <= 3; r++) push(1, r, "PVE_CAMP", true);
  for (const s of SCHEDULE.regularStages) {
    for (let r = 1; r <= SCHEDULE.roundsPerRegularStage; r++) {
      const event = SCHEDULE.events[`${s}-${r}`];
      const kind: RoundKind = event ?? (r === 1 ? "FA_MARKET" : "PVP");
      push(s, r, kind, kind !== "RAIN_OUT" && kind !== "TRADE_DEADLINE");
    }
  }
  for (let r = 1; r <= SCHEDULE.maxPostseasonRounds; r++) push(7, r, "PLAYOFF", true);
  return rounds;
}
