/**
 * Roster table → pack builder. Unlike the CSV converter (§5.6), which turns
 * season stats into percentile ratings and assigns costs mechanically, this
 * takes hand-authored costs and the five display ratings per card, and
 * derives internals, tags and nicknames the way the fictional generator does
 * (§5.5–5.7). Meant for private packs; the output is never committed.
 */
import { PACK_COMPOSITION, SYNERGIES, baseNickname, cardOvr, createRng, type Rng } from "@dugout/engine";
import { CLASS_TAGS, PackSchema, type CardDef, type ClassTag, type Cost, type Hand, type OriginTag, type Pack, type PackTeam, type Pos, type Role } from "@dugout/protocol";
import { deriveHitterRatings, derivePitcherRatings, fitToCostBand, type HitterBase, type PitcherBase, type RatingShell } from "./generate.js";
import { ROLE_CLASSES, hitterClassMargins, pitcherClassMargins, ruleOrigin, type ClassMargin } from "./tags.js";

export const ROSTER_BUILDER_VERSION = "1.0.0";

/** Display ratings: hitters [contact, power, eye, speed, defense]; pitchers [stuff, control, movement, stamina, mental]. */
export type DisplayFive = readonly [number, number, number, number, number];

export interface RosterRow {
  readonly name: string;
  /** Team id (must exist in the teams list). */
  readonly team: string;
  readonly role: Role;
  /** Primary position; ignored for pitchers (they use the "DH" placeholder). */
  readonly pos: Pos;
  readonly pos2: readonly Pos[];
  readonly cost: Cost;
  readonly bats: Hand;
  readonly throws: "L" | "R";
  readonly age: number;
  /** ISO 3166-1 alpha-2; anything but "KR" makes the card FOREIGN. */
  readonly nationality?: string;
  readonly display: DisplayFive;
  /** Pitchers only: low arm angle (SIDEARM board synergy). */
  readonly sidearm?: boolean;
  /** Hand overrides for the rule-based tags. */
  readonly origin?: OriginTag;
  readonly classes?: readonly ClassTag[];
}

export interface RosterBuildOptions {
  readonly id: string;
  readonly name: string;
  readonly seed?: string;
  /** Internal ratings spread around the display value (the generator uses 8). */
  readonly spread?: number;
}

export interface RosterBuildResult {
  readonly pack: Pack;
  /** Human-readable notes: top-up tags, OVR band shifts, unmet minimums. */
  readonly notes: readonly string[];
}

const DOMESTIC_ORIGINS: readonly OriginTag[] = ["COLLEGE", "MILITARY_DONE", "JOURNEYMAN"];
const HITTER_CLUTCH_CHANCE = 0.15;

interface Draft {
  row: RosterRow;
  id: string;
  role: Role;
  pos: Pos;
  pos2: Pos[];
  origin: OriginTag | undefined;
  classes: ClassTag[];
  margins: ClassMargin[];
  locked: boolean;
}

function marginsFor(row: RosterRow, clutchRng: Rng): ClassMargin[] {
  const [a, b, c, d, e] = row.display;
  if (row.role === "H") {
    const clutch = clutchRng.chance(HITTER_CLUTCH_CHANCE);
    return [...hitterClassMargins({ contact: a, power: b, speed: d, defense: e }, row.pos), { tag: "CLUTCH", ok: clutch, margin: clutch ? 0 : -15 }];
  }
  return pitcherClassMargins({ stuff: a, movement: c, stamina: d, mental: e }, row.role);
}

/** Rule tags (§5.6): catchers keep CATCHER; the strongest qualifying rules fill up to two slots. */
function ruleClasses(row: RosterRow, pos: Pos, margins: readonly ClassMargin[]): ClassTag[] {
  const byMargin = [...margins].sort((x, y) => y.margin - x.margin);
  const out: ClassTag[] = row.role === "H" && pos === "C" ? ["CATCHER"] : [];
  for (const m of byMargin) if (m.ok && out.length < 2) out.push(m.tag);
  if (out.length === 0 && byMargin[0]) out.push(byMargin[0].tag);
  if (row.cost === 5) for (const m of byMargin) if (out.length < 2 && !out.includes(m.tag)) out.push(m.tag);
  return out;
}

function dealOrigins(drafts: Draft[], rng: Rng): void {
  const count = (t: OriginTag) => drafts.filter((d) => d.origin === t).length;
  for (const d of rng.shuffle(drafts.filter((x) => x.origin === undefined))) {
    const deficit = (t: OriginTag) => SYNERGIES[t].minPackCards - count(t);
    const pick = [...DOMESTIC_ORIGINS].sort((x, y) => deficit(y) - deficit(x))[0] as OriginTag;
    d.origin = pick;
  }
}

function topUpClasses(drafts: Draft[], notes: string[]): void {
  for (const tag of CLASS_TAGS) {
    if (tag === "CATCHER") continue;
    const min = SYNERGIES[tag].minPackCards;
    let n = drafts.filter((d) => d.classes.includes(tag)).length;
    const margin = (d: Draft) => d.margins.find((m) => m.tag === tag)?.margin ?? -99;
    const candidates = drafts
      .filter((d) => !d.locked && d.classes.length < 2 && !d.classes.includes(tag) && ROLE_CLASSES[d.role].includes(tag))
      .sort((x, y) => margin(y) - margin(x));
    for (const d of candidates) {
      if (n >= min) break;
      d.classes.push(tag);
      n++;
      notes.push(`top-up: ${d.row.name} +${tag} (margin ${margin(d)})`);
    }
    if (n < min) notes.push(`unmet: ${tag} ${n} < ${min}`);
  }
}

function ratingsFor(draft: Draft, classes: ClassTag[], rng: Rng, spread: number, notes: string[]): Pick<CardDef, "hitter" | "pitcher"> {
  const { row } = draft;
  const shell: RatingShell = { cost: row.cost, role: draft.role, pos: draft.pos, pos2: draft.pos2, bats: row.bats, throws: row.throws, classes };
  const [a, b, c, d, e] = row.display;
  let shifted = 0;
  if (draft.role === "H") {
    const dh = draft.pos === "DH";
    const base: HitterBase = { contact: a, power: b, eye: c, speed: d, defense: dh ? 40 : e, arm: dh ? 45 : e };
    const hitter = fitToCostBand(shell, () => deriveHitterRatings(rng, shell, base, spread), (delta) => {
      shifted += delta;
      base.contact += delta; base.power += delta; base.eye += delta; base.speed += delta;
      if (!dh) { base.defense += delta; base.arm += delta; }
    });
    if (shifted !== 0) notes.push(`band: ${row.name} display shifted ${shifted.toFixed(1)} to fit cost ${row.cost}`);
    return { hitter };
  }
  const base: PitcherBase = { stuff: a, control: b, movement: c, stamina: d, mental: e };
  const pitcher = fitToCostBand(shell, () => derivePitcherRatings(rng, shell, base, row.sidearm === true, spread), (delta) => {
    shifted += delta;
    base.stuff += delta; base.control += delta; base.movement += delta; base.stamina += delta; base.mental += delta;
  });
  if (shifted !== 0) notes.push(`band: ${row.name} display shifted ${shifted.toFixed(1)} to fit cost ${row.cost}`);
  return { pitcher };
}

/** Build a pack from a hand-authored roster table. Deterministic for a given seed. */
export function buildPackFromRoster(rows: readonly RosterRow[], teams: readonly PackTeam[], opts: RosterBuildOptions): RosterBuildResult {
  const seed = opts.seed ?? opts.id;
  const rng = createRng(seed, "roster");
  const notes: string[] = [];
  const counters: Record<string, number> = {};

  const drafts: Draft[] = rows.map((row) => {
    const key = `${row.cost}-${row.role.toLowerCase()}`;
    counters[key] = (counters[key] ?? 0) + 1;
    const id = `c${key}-${String(counters[key]).padStart(2, "0")}`;
    const pos: Pos = row.role === "H" ? row.pos : "DH";
    const pos2: Pos[] = row.role === "H" ? row.pos2.filter((p) => p !== pos && p !== "DH") : [];
    const margins = marginsFor({ ...row, pos }, rng.fork(`clutch:${row.name}`));
    const classes = row.classes ? [...row.classes] : ruleClasses(row, pos, margins);
    const origin = row.origin ?? ruleOrigin(row.age, row.nationality);
    return { row, id, role: row.role, pos, pos2, origin, classes, margins, locked: row.classes !== undefined };
  });

  dealOrigins(drafts, rng.fork("origins"));
  topUpClasses(drafts, notes);

  const cards: CardDef[] = drafts.map((d) => {
    const { row } = d;
    const card: CardDef = {
      id: d.id,
      name: row.name,
      nickname: "",
      team: row.team,
      age: row.age,
      bats: row.bats,
      throws: row.throws,
      role: d.role,
      pos: d.pos,
      pos2: d.pos2,
      cost: row.cost,
      origin: d.origin as OriginTag,
      classes: d.classes,
      nationality: row.nationality ?? "KR",
      ...ratingsFor(d, d.classes, rng.fork(`ratings:${d.id}`), opts.spread ?? 4, notes),
    };
    const [lo, hi] = PACK_COMPOSITION[row.cost].ovr;
    const ovr = cardOvr(card);
    if (ovr < lo || ovr > hi) notes.push(`ovr: ${row.name} ${ovr.toFixed(1)} outside ${lo}~${hi}`);
    return { ...card, nickname: baseNickname(card, rng.fork(`nick:${d.id}`)) };
  });

  const pack: Pack = {
    formatVersion: 1,
    id: opts.id,
    name: opts.name,
    kind: "private",
    generatedBy: { tool: "@dugout/packs roster", version: ROSTER_BUILDER_VERSION, seed },
    teams: teams.map((t) => ({ ...t })),
    cards,
  };
  return { pack: PackSchema.parse(pack), notes };
}
