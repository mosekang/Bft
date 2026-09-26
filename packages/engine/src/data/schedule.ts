import type { RoundKind, RoundSpec } from "../types/run.js";

/**
 * Builds the 26-ish round schedule (§3).
 *  S1 spring camp  : 3 PvE rounds, philosophy pick after 1-3 (i.e. before 2-1).
 *  S2..S6 regular  : x-1 FA market + PvP, x-2/x-3 PvP, x-4 event.
 *  S7 postseason   : `playoffRounds` PvP rounds at double damage, then a best-of-3 final.
 */
export const STAGE_LAYOUT = {
  springCampRounds: 3,
  regularStages: 5,
  roundsPerRegularStage: 4,
  /** Philosophy pick before these round codes. */
  philosophyPicks: ["2-1", "3-2", "5-2"] as const,
  events: {
    "2-4": "ALL_STAR",
    "3-4": "RAIN_OUT",
    "4-4": "TRADE_DEADLINE",
    "5-4": "LEGEND_MATCH",
    "6-4": "ALL_STAR",
  } as Readonly<Record<string, RoundKind>>,
  /** Nominal postseason length; the run loop may end early when one team is left. */
  playoffRounds: 2,
  finalSeriesRounds: 1,
} as const;

export function buildSchedule(layout = STAGE_LAYOUT): RoundSpec[] {
  const rounds: RoundSpec[] = [];
  const picks = new Set<string>(layout.philosophyPicks);
  const push = (stage: number, roundInStage: number, kind: RoundKind, damageMultiplier = 1) => {
    const code = `${stage}-${roundInStage}`;
    rounds.push({
      index: rounds.length,
      stage,
      roundInStage,
      code,
      kind,
      philosophyPick: picks.has(code),
      damageMultiplier,
    });
  };

  for (let r = 1; r <= layout.springCampRounds; r++) push(1, r, "PVE");

  for (let s = 2; s < 2 + layout.regularStages; s++) {
    for (let r = 1; r <= layout.roundsPerRegularStage; r++) {
      const code = `${s}-${r}`;
      const event = layout.events[code];
      const kind: RoundKind = event ?? (r === 1 ? "FA_MARKET" : "PVP");
      push(s, r, kind);
    }
  }

  const post = 2 + layout.regularStages;
  let r = 1;
  for (let i = 0; i < layout.playoffRounds; i++) push(post, r++, "PLAYOFF", 2);
  for (let i = 0; i < layout.finalSeriesRounds; i++) push(post, r++, "FINAL_SERIES", 2);

  return rounds;
}
