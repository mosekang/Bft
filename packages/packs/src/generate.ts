import {
  PACK_COMPOSITION,
  baseNickname,
  cardOvr,
  createRng,
  hitterDisplay,
  pitcherDisplay,
  type Rng,
} from "@dugout/engine";
import {
  CLASS_TAGS,
  PackSchema,
  type CardDef,
  type ClassTag,
  type Cost,
  type Hand,
  type HitterRatings,
  type OriginTag,
  type Pack,
  type PitcherRatings,
  type Pos,
  type Role,
} from "@dugout/protocol";
import { FICTIONAL_TEAMS, FOREIGN_COUNTRIES, NameFactory } from "./names.js";

export const GENERATOR_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Composition targets (§5.3, §5.5)
// ---------------------------------------------------------------------------

/** Primary-position minimums for the 41 hitters; they sum to exactly 41. */
export const POSITION_MINIMUMS: Readonly<Record<Pos, number>> = { C: 4, "1B": 4, "2B": 5, "3B": 5, SS: 5, LF: 4, CF: 5, RF: 5, DH: 4 };

/** Hitter handedness quotas (40 / 52 / 8 % of 41). */
const HITTER_HANDS: Readonly<Record<Hand, number>> = { L: 16, R: 22, S: 3 };
/** Left-handed pitchers (30 % of 18). */
const LEFTY_PITCHERS = 5;

/** Origin quotas over all 59 cards (at or above §5.3 minimums). */
const ORIGIN_QUOTA: Readonly<Record<OriginTag, number>> = { HS_PROSPECT: 9, COLLEGE: 12, FOREIGN: 5, VETERAN: 9, MILITARY_DONE: 8, JOURNEYMAN: 8 };

/** Class quotas: primary tags dealt to hitters (catchers get CATCHER) and pitchers. */
const HITTER_CLASS_QUOTA: Readonly<Partial<Record<ClassTag, number>>> = { SLUGGER: 9, CONTACT_HITTER: 9, SPEEDSTER: 7, GOLD_GLOVE: 7, CLUTCH: 5 };
const SP_CLASS_QUOTA: Readonly<Partial<Record<ClassTag, number>>> = { FIREBALLER: 4, FINESSE: 5, INNING_EATER: 3 };
const RP_CLASS_QUOTA: Readonly<Partial<Record<ClassTag, number>>> = { CLOSER: 4, FIREBALLER: 2 };
/** Minimum pack-wide count per class tag (§5.3: 4 for tier-2 synergies, 6 for tier-3+). */
export const CLASS_MINIMUMS: Readonly<Record<ClassTag, number>> = {
  SLUGGER: 6, CONTACT_HITTER: 6, SPEEDSTER: 6, GOLD_GLOVE: 6, CATCHER: 4, FIREBALLER: 6, FINESSE: 6, INNING_EATER: 4, CLOSER: 4, CLUTCH: 6,
};
export const HITTER_CLASSES: readonly ClassTag[] = ["SLUGGER", "CONTACT_HITTER", "SPEEDSTER", "GOLD_GLOVE", "CLUTCH"];
export const SP_CLASSES: readonly ClassTag[] = ["FIREBALLER", "FINESSE", "INNING_EATER", "CLUTCH"];
export const RP_CLASSES: readonly ClassTag[] = ["FIREBALLER", "FINESSE", "CLOSER", "CLUTCH"];

const AGE_RANGE: Readonly<Record<OriginTag, readonly [number, number]>> = {
  HS_PROSPECT: [19, 22], COLLEGE: [23, 25], VETERAN: [32, 38], FOREIGN: [26, 33], MILITARY_DONE: [25, 29], JOURNEYMAN: [24, 31],
};

const SECONDARY_POS: Readonly<Record<Pos, readonly Pos[]>> = {
  C: ["1B"], "1B": ["LF", "RF", "3B"], "2B": ["SS", "3B"], "3B": ["1B", "SS"], SS: ["2B", "3B"], LF: ["RF", "CF"], CF: ["LF", "RF"], RF: ["LF", "CF"], DH: [],
};

// ---------------------------------------------------------------------------
// Shells: everything but names/ratings
// ---------------------------------------------------------------------------

interface Shell {
  cost: Cost;
  role: Role;
  pos: Pos;
  pos2: Pos[];
  bats: Hand;
  throws: "L" | "R";
  origin: OriginTag;
  classes: ClassTag[];
}

function dealList<T>(rng: Rng, quota: Readonly<Partial<Record<string, number>>>, total: number, fill: readonly T[]): T[] {
  const out: T[] = [];
  for (const [k, n] of Object.entries(quota)) for (let i = 0; i < (n ?? 0); i++) out.push(k as T);
  while (out.length < total) out.push(rng.pick(fill));
  return rng.shuffle(out.slice(0, total));
}

function buildShells(rng: Rng): Shell[] {
  const shells: Shell[] = [];
  const costs = [1, 2, 3, 4, 5] as const;

  // --- hitters: positions per tier ---------------------------------------
  const posPool: Pos[] = [];
  for (const [pos, n] of Object.entries(POSITION_MINIMUMS) as [Pos, number][]) {
    const reserved = pos === "SS" || pos === "CF" ? 5 : pos === "C" ? 4 : 0;
    for (let i = 0; i < n - reserved; i++) posPool.push(pos);
  }
  const shuffledPool = rng.shuffle(posPool);
  const hitterPositions: Record<Cost, Pos[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const cost of costs) {
    hitterPositions[cost].push("SS", "CF");
    if (cost !== 5) hitterPositions[cost].push("C");
    while (hitterPositions[cost].length < PACK_COMPOSITION[cost].hitters) hitterPositions[cost].push(shuffledPool.pop() as Pos);
  }

  const hands = dealList<Hand>(rng, HITTER_HANDS, 41, ["R"]);
  let handIdx = 0;
  const hitterShells: Shell[] = [];
  for (const cost of costs) {
    for (const pos of rng.shuffle(hitterPositions[cost])) {
      const bats = hands[handIdx++] as Hand;
      const throws: "L" | "R" = bats === "L" && rng.chance(0.6) && pos !== "C" && pos !== "SS" && pos !== "2B" && pos !== "3B" ? "L" : "R";
      const pos2: Pos[] = pos === "DH" ? [] : rng.shuffle(SECONDARY_POS[pos]).slice(0, rng.int(0, 2));
      hitterShells.push({ cost, role: "H", pos, pos2, bats, throws, origin: "COLLEGE", classes: [] });
    }
  }
  // Tier 5 has no primary catcher: give one non-DH 5-cost hitter C as a secondary position.
  const tier5 = hitterShells.filter((s) => s.cost === 5 && s.pos !== "DH" && s.pos !== "C");
  const backupCatcher = rng.pick(tier5);
  if (!backupCatcher.pos2.includes("C")) backupCatcher.pos2 = (["C", ...backupCatcher.pos2] as Pos[]).slice(0, 2);

  // --- pitchers ------------------------------------------------------------
  const pitcherShells: Shell[] = [];
  for (const cost of costs) {
    for (let i = 0; i < PACK_COMPOSITION[cost].sp; i++) pitcherShells.push({ cost, role: "SP", pos: "DH", pos2: [], bats: "R", throws: "R", origin: "COLLEGE", classes: [] });
    for (let i = 0; i < PACK_COMPOSITION[cost].rp; i++) pitcherShells.push({ cost, role: "RP", pos: "DH", pos2: [], bats: "R", throws: "R", origin: "COLLEGE", classes: [] });
  }
  const leftyIdx = new Set(rng.shuffle(pitcherShells.map((_, i) => i)).slice(0, LEFTY_PITCHERS));
  pitcherShells.forEach((s, i) => {
    s.throws = leftyIdx.has(i) ? "L" : "R";
    s.bats = s.throws === "L" ? "L" : rng.chance(0.15) ? "L" : "R";
  });

  shells.push(...hitterShells, ...pitcherShells);

  // --- origins --------------------------------------------------------------
  const origins = dealList<OriginTag>(rng, ORIGIN_QUOTA, shells.length, ["COLLEGE", "JOURNEYMAN"]);
  shells.forEach((s, i) => (s.origin = origins[i] as OriginTag));

  // --- classes --------------------------------------------------------------
  const nonCatchers = hitterShells.filter((s) => s.pos !== "C");
  const hitterPrimary = dealList<ClassTag>(rng, HITTER_CLASS_QUOTA, nonCatchers.length, HITTER_CLASSES);
  nonCatchers.forEach((s, i) => s.classes.push(hitterPrimary[i] as ClassTag));
  hitterShells.filter((s) => s.pos === "C").forEach((s) => s.classes.push("CATCHER"));

  const sps = pitcherShells.filter((s) => s.role === "SP");
  const rps = pitcherShells.filter((s) => s.role === "RP");
  const spPrimary = dealList<ClassTag>(rng, SP_CLASS_QUOTA, sps.length, SP_CLASSES);
  const rpPrimary = dealList<ClassTag>(rng, RP_CLASS_QUOTA, rps.length, RP_CLASSES);
  sps.forEach((s, i) => s.classes.push(spPrimary[i] as ClassTag));
  rps.forEach((s, i) => s.classes.push(rpPrimary[i] as ClassTag));

  const allowed = (s: Shell): readonly ClassTag[] => (s.role === "H" ? HITTER_CLASSES : s.role === "SP" ? SP_CLASSES : RP_CLASSES);
  const addSecond = (s: Shell, tag: ClassTag) => {
    if (s.classes.length >= 2 || s.classes.includes(tag) || !allowed(s).includes(tag)) return false;
    s.classes.push(tag);
    return true;
  };

  // Top up pack-wide minimums with second tags.
  for (const tag of CLASS_TAGS) {
    let count = shells.filter((s) => s.classes.includes(tag)).length;
    const candidates = rng.shuffle(shells.filter((s) => s.classes.length < 2));
    for (const s of candidates) {
      if (count >= CLASS_MINIMUMS[tag]) break;
      if (addSecond(s, tag)) count++;
    }
  }
  // 5-costs need two classes; others get a second class 40 % of the time.
  for (const s of shells) {
    if (s.classes.length >= 2) continue;
    if (s.cost === 5 || rng.chance(0.4)) {
      const options = rng.shuffle(allowed(s).filter((t) => !s.classes.includes(t)));
      for (const t of options) if (addSecond(s, t)) break;
    }
  }
  return shells;
}

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

const clamp = (n: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));
const jitter = (rng: Rng, sd: number) => Math.round((rng.next() + rng.next() + rng.next() - 1.5) * sd * 1.6);

function hitterBias(shell: Shell): Record<"contact" | "power" | "eye" | "speed" | "defense", number> {
  const b = { contact: 0, power: 0, eye: 0, speed: 0, defense: 0 };
  for (const c of shell.classes) {
    if (c === "SLUGGER") { b.power += 10; b.contact -= 5; }
    if (c === "CONTACT_HITTER") { b.contact += 10; b.power -= 4; }
    if (c === "SPEEDSTER") { b.speed += 14; b.power -= 4; }
    if (c === "GOLD_GLOVE") { b.defense += 12; b.power -= 3; }
    if (c === "CATCHER") { b.defense += 4; b.speed -= 8; }
  }
  if (shell.pos === "DH") { b.power += 6; b.contact += 3; }
  if (shell.pos === "SS" || shell.pos === "C" || shell.pos === "CF") b.defense += 3;
  return b;
}

function pitcherBias(shell: Shell): Record<"stuff" | "control" | "movement" | "stamina" | "mental", number> {
  const b = { stuff: 0, control: 0, movement: 0, stamina: 0, mental: 0 };
  for (const c of shell.classes) {
    if (c === "FIREBALLER") { b.stuff += 10; b.control -= 4; }
    if (c === "FINESSE") { b.movement += 10; b.stuff -= 6; b.control += 3; }
    if (c === "INNING_EATER") { b.stamina += 14; }
    if (c === "CLOSER") { b.stuff += 8; b.mental += 4; }
    if (c === "CLUTCH") { b.mental += 6; }
  }
  if (shell.role === "RP") { b.stamina -= 22; b.stuff += 3; }
  return b;
}

/** Base values for the five visible hitter ratings (plus throwing arm) that internals are derived from. */
export interface HitterBase {
  contact: number;
  power: number;
  eye: number;
  speed: number;
  defense: number;
  arm: number;
}

/** Base values for the five visible pitcher ratings. */
export interface PitcherBase {
  stuff: number;
  control: number;
  movement: number;
  stamina: number;
  mental: number;
}

/** The parts of a card that shape its internal ratings. */
export type RatingShell = Pick<Shell, "cost" | "role" | "pos" | "pos2" | "bats" | "throws" | "classes">;

/**
 * Hitter internals from display-level bases (§5.5): each internal is its
 * display base ± `spread`; hidden tendencies follow the class tags.
 */
export function deriveHitterRatings(rng: Rng, shell: RatingShell, base: HitterBase, spread = 8): HitterRatings {
  const j = () => rng.int(-spread, spread);
  const platoon = shell.bats === "L" ? 4 : shell.bats === "R" ? -4 : 0;
  const def: Partial<Record<Pos, number>> = {};
  if (shell.pos !== "DH") def[shell.pos] = clamp(base.defense + j());
  for (const p of shell.pos2) if (p !== "DH") def[p] = clamp(base.defense - 6 + j());
  return {
    kRate: clamp(base.contact + j()),
    contactL: clamp(base.contact - platoon + j()),
    contactR: clamp(base.contact + platoon + j()),
    hrRate: clamp(base.power + j()),
    xbhRate: clamp(base.power + j()),
    bbRate: clamp(base.eye + j()),
    gbTend: clamp(55 + jitter(rng, 15) - (shell.classes.includes("SLUGGER") ? 15 : 0) + (shell.classes.includes("SPEEDSTER") ? 8 : 0)),
    pullTend: clamp(55 + jitter(rng, 15) + (shell.classes.includes("SLUGGER") ? 8 : 0)),
    speed: clamp(base.speed + j()),
    sbSkill: clamp(base.speed + j()),
    def,
    arm: clamp(base.arm + j()),
    clutch: 0,
  };
}

/** Pitcher internals from display-level bases (§5.5). `sidearm` pins a low arm angle. */
export function derivePitcherRatings(rng: Rng, shell: RatingShell, base: PitcherBase, sidearm: boolean, spread = 8): PitcherRatings {
  const j = () => rng.int(-spread, spread);
  const platoon = shell.throws === "L" ? 5 : 0;
  return {
    kRate: clamp(base.stuff + j()),
    bbRate: clamp(base.control + j()),
    hrRate: clamp(base.movement + j()),
    gbRate: clamp(base.movement + (shell.classes.includes("FINESSE") ? 12 : 0) + j()),
    contactVsL: clamp(base.stuff + platoon + j()),
    contactVsR: clamp(base.stuff - Math.round(platoon / 2) + j()),
    stamina: clamp(base.stamina + j()),
    mental: clamp(base.mental + j()),
    hold: clamp(55 + jitter(rng, 15)),
    armAngle: clamp(sidearm ? rng.int(15, 35) : 55 + jitter(rng, 18)),
  };
}

/**
 * Rebuild ratings until the card's OVR sits inside its cost band (§5.3),
 * shifting every base by the miss each time (at most 12 tries).
 */
export function fitToCostBand<R extends HitterRatings | PitcherRatings>(shell: RatingShell, build: () => R, shift: (delta: number) => void): R {
  const withRatings = (r: R) => (shell.role === "H" ? { ...shell, hitter: r as HitterRatings } : { ...shell, pitcher: r as PitcherRatings });
  let ratings = build();
  const [lo, hi] = PACK_COMPOSITION[shell.cost].ovr;
  for (let i = 0; i < 12; i++) {
    const ovr = ovrOf(withRatings(ratings));
    if (ovr >= lo && ovr <= hi) break;
    shift(ovr < lo ? lo - ovr + 1 : hi - ovr - 1);
    ratings = build();
  }
  return ratings;
}

function makeHitterRatings(rng: Rng, shell: Shell, target: number): HitterRatings {
  const bias = hitterBias(shell);
  const b: HitterBase = {
    contact: target + bias.contact + jitter(rng, 8),
    power: target + bias.power + jitter(rng, 9),
    eye: target + bias.eye + jitter(rng, 10),
    speed: target + bias.speed + jitter(rng, 12),
    defense: 0,
    arm: 0,
  };
  b.defense = shell.pos === "DH" ? 40 : target + bias.defense + jitter(rng, 9);
  const build = () => deriveHitterRatings(rng, shell, { ...b, arm: shell.pos === "DH" ? target : b.defense });
  return fitToCostBand(shell, build, (delta) => {
    b.contact += delta; b.power += delta; b.eye += delta; b.speed += delta;
    if (shell.pos !== "DH") b.defense += delta;
  });
}

function makePitcherRatings(rng: Rng, shell: Shell, target: number): PitcherRatings {
  const bias = pitcherBias(shell);
  const b: PitcherBase = {
    stuff: target + bias.stuff + jitter(rng, 8),
    control: target + bias.control + jitter(rng, 9),
    movement: target + bias.movement + jitter(rng, 9),
    stamina: target + bias.stamina + jitter(rng, 8),
    mental: target + bias.mental + jitter(rng, 12),
  };
  const sidearm = rng.chance(0.15);
  const build = () => derivePitcherRatings(rng, shell, b, sidearm);
  return fitToCostBand(shell, build, (delta) => {
    b.stuff += delta; b.control += delta; b.movement += delta; b.stamina += delta; b.mental += delta;
  });
}

function ovrOf(partial: RatingShell & { hitter?: HitterRatings; pitcher?: PitcherRatings }): number {
  const stub = { id: "x", name: "x", nickname: "x", team: "x", age: 25, ...partial } as CardDef;
  return cardOvr(stub);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  readonly seed: string;
  readonly id?: string;
  readonly name?: string;
}

/** Deterministically generate a 59-card fictional pack (§5.5). */
export function generatePack(opts: GenerateOptions): Pack {
  const rng = createRng(opts.seed, "pack");
  const shells = buildShells(rng.fork("shells"));
  const names = new NameFactory(rng.fork("names"));
  const ratingsRng = rng.fork("ratings");
  const nickRng = rng.fork("nicknames");
  const teamRng = rng.fork("teams");

  const counters: Record<string, number> = {};
  const cards: CardDef[] = shells.map((shell) => {
    const key = `${shell.cost}-${shell.role.toLowerCase()}`;
    counters[key] = (counters[key] ?? 0) + 1;
    const id = `c${key}-${String(counters[key]).padStart(2, "0")}`;
    const [lo, hi] = PACK_COMPOSITION[shell.cost].ovr;
    const target = lo + 1 + ratingsRng.next() * (hi - lo - 2);
    const [ageLo, ageHi] = AGE_RANGE[shell.origin];
    const nationality = shell.origin === "FOREIGN" ? ratingsRng.pick(FOREIGN_COUNTRIES) : "KR";
    const name = shell.origin === "FOREIGN" ? names.foreign(nationality) : names.korean();
    const base: Omit<CardDef, "nickname"> = {
      id,
      name,
      team: teamRng.pick(FICTIONAL_TEAMS).id,
      age: ratingsRng.int(ageLo, ageHi),
      bats: shell.bats,
      throws: shell.throws,
      role: shell.role,
      pos: shell.pos,
      pos2: shell.pos2,
      cost: shell.cost,
      origin: shell.origin,
      classes: shell.classes,
      nationality,
      ...(shell.role === "H"
        ? { hitter: makeHitterRatings(ratingsRng, shell, target) }
        : { pitcher: makePitcherRatings(ratingsRng, shell, target) }),
    };
    const card: CardDef = { ...base, nickname: "" };
    return { ...card, nickname: baseNickname(card, nickRng) };
  });

  const pack: Pack = {
    formatVersion: 1,
    id: opts.id ?? "fictional-v1",
    name: opts.name ?? "가상 리그 v1",
    kind: "fictional",
    generatedBy: { tool: "@dugout/packs generate", version: GENERATOR_VERSION, seed: opts.seed },
    teams: FICTIONAL_TEAMS.map((t) => ({ ...t })),
    cards,
  };
  return PackSchema.parse(pack);
}

/** Convenience for the codex / tests. */
export function describeCard(card: CardDef): string {
  const d = card.role === "H" ? hitterDisplay(card.hitter!, card.pos) : pitcherDisplay(card.pitcher!);
  return `${card.name} (${card.cost}코 ${card.role} ${card.pos}) OVR ${cardOvr(card).toFixed(1)} ${JSON.stringify(d)}`;
}
