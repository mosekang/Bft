import { PACK_CARD_COUNT, PACK_COMPOSITION, SYNERGIES, cardOvr } from "@dugout/engine";
import { COSTS, PackSchema, type CardDef, type ClassTag, type Cost, type Pack, type Pos, type SynergyId } from "@dugout/protocol";
import { POSITION_MINIMUMS } from "./generate.js";

export interface ValidationReport {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly summary: Readonly<Record<string, string | number>>;
}

/** Tolerance (percentage points) for the handedness ratios in §5.3. */
const HAND_TOLERANCE_PP = 8;

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((1000 * n) / total) / 10;
}

/** Synergy counts for a card, including derived handedness tags. */
export function cardSynergies(card: CardDef): SynergyId[] {
  const out: SynergyId[] = [card.origin, ...card.classes];
  if (card.role === "H") {
    if (card.bats === "L" || card.bats === "S") out.push("LEFTY_BAT");
    if (card.bats === "R" || card.bats === "S") out.push("RIGHTY_BAT");
  }
  return out;
}

/** Validate a pack against the schema and the §5.3 composition rules. */
export function validatePack(input: unknown): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = PackSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 20)) errors.push(`schema: ${issue.path.join(".")}: ${issue.message}`);
    if (parsed.error.issues.length > 20) errors.push(`schema: ...and ${parsed.error.issues.length - 20} more issues`);
    return { ok: false, errors, warnings, summary: {} };
  }
  const pack: Pack = parsed.data;
  const cards = pack.cards;
  const hitters = cards.filter((c) => c.role === "H");
  const pitchers = cards.filter((c) => c.role !== "H");

  // --- size and composition -------------------------------------------------
  if (cards.length !== PACK_CARD_COUNT) errors.push(`card count ${cards.length} != ${PACK_CARD_COUNT}`);
  for (const cost of COSTS) {
    const want = PACK_COMPOSITION[cost];
    const h = hitters.filter((c) => c.cost === cost).length;
    const sp = pitchers.filter((c) => c.cost === cost && c.role === "SP").length;
    const rp = pitchers.filter((c) => c.cost === cost && c.role === "RP").length;
    if (h !== want.hitters) errors.push(`cost ${cost}: hitters ${h} != ${want.hitters}`);
    if (sp !== want.sp) errors.push(`cost ${cost}: SP ${sp} != ${want.sp}`);
    if (rp !== want.rp) errors.push(`cost ${cost}: RP ${rp} != ${want.rp}`);
  }

  // --- uniqueness -------------------------------------------------------------
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const c of cards) {
    if (ids.has(c.id)) errors.push(`duplicate id ${c.id}`);
    if (names.has(c.name)) errors.push(`duplicate name ${c.name}`);
    ids.add(c.id);
    names.add(c.name);
  }
  const teamIds = new Set(pack.teams.map((t) => t.id));
  for (const c of cards) if (!teamIds.has(c.team)) errors.push(`${c.id}: unknown team ${c.team}`);

  // --- positions --------------------------------------------------------------
  for (const [pos, min] of Object.entries(POSITION_MINIMUMS) as [Pos, number][]) {
    const n = hitters.filter((c) => c.pos === pos).length;
    if (n < min) errors.push(`position ${pos}: ${n} hitters < minimum ${min}`);
  }
  for (const cost of COSTS) {
    const tier = hitters.filter((c) => c.cost === cost);
    for (const pos of ["C", "SS", "CF"] as const) {
      if (!tier.some((c) => c.pos === pos || c.pos2.includes(pos))) errors.push(`cost ${cost}: no hitter who can play ${pos}`);
    }
  }
  for (const c of hitters) {
    const allowed = new Set<Pos>([c.pos, ...c.pos2]);
    for (const key of Object.keys(c.hitter?.def ?? {}) as Pos[]) {
      if (key === "DH") errors.push(`${c.id}: def must not contain DH`);
      else if (!allowed.has(key)) errors.push(`${c.id}: def has ${key} which is neither pos nor pos2`);
    }
    if (c.pos !== "DH" && c.hitter?.def[c.pos] === undefined) errors.push(`${c.id}: missing def for primary position ${c.pos}`);
  }
  for (const c of pitchers) {
    if (c.pos !== "DH" || c.pos2.length > 0) errors.push(`${c.id}: pitchers use pos "DH" placeholder with empty pos2`);
  }

  // --- handedness -------------------------------------------------------------
  const handShare = { L: pct(hitters.filter((c) => c.bats === "L").length, hitters.length), R: pct(hitters.filter((c) => c.bats === "R").length, hitters.length), S: pct(hitters.filter((c) => c.bats === "S").length, hitters.length) };
  const lhpShare = pct(pitchers.filter((c) => c.throws === "L").length, pitchers.length);
  const handTargets = { L: 40, R: 52, S: 8 } as const;
  for (const [hand, target] of Object.entries(handTargets) as ["L" | "R" | "S", number][]) {
    if (Math.abs(handShare[hand] - target) > HAND_TOLERANCE_PP) errors.push(`bats ${hand}: ${handShare[hand]}% is more than ${HAND_TOLERANCE_PP}pp from ${target}%`);
  }
  if (Math.abs(lhpShare - 30) > HAND_TOLERANCE_PP) errors.push(`left-handed pitchers: ${lhpShare}% is more than ${HAND_TOLERANCE_PP}pp from 30%`);

  // --- tags ---------------------------------------------------------------------
  const synergyCounts = new Map<SynergyId, number>();
  for (const c of cards) for (const s of cardSynergies(c)) synergyCounts.set(s, (synergyCounts.get(s) ?? 0) + 1);
  for (const def of Object.values(SYNERGIES)) {
    const n = synergyCounts.get(def.id) ?? 0;
    if (n < def.minPackCards) errors.push(`synergy ${def.id}: ${n} cards < minimum ${def.minPackCards}`);
  }

  // --- OVR ranges -------------------------------------------------------------------
  const ovrByCost: Record<Cost, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const c of cards) {
    const ovr = cardOvr(c);
    ovrByCost[c.cost].push(ovr);
    const [lo, hi] = PACK_COMPOSITION[c.cost].ovr;
    if (ovr < lo || ovr > hi) errors.push(`${c.id}: OVR ${ovr.toFixed(1)} outside ${lo}~${hi} for cost ${c.cost}`);
  }

  // --- warnings ---------------------------------------------------------------------
  const nicknames = new Map<string, number>();
  for (const c of cards) nicknames.set(c.nickname, (nicknames.get(c.nickname) ?? 0) + 1);
  const dupNick = [...nicknames.entries()].filter(([, n]) => n > 3);
  if (dupNick.length > 0) warnings.push(`nicknames used more than 3 times: ${dupNick.map(([k, n]) => `${k}×${n}`).join(", ")}`);
  const classCounts = Object.fromEntries((["SLUGGER", "CONTACT_HITTER", "SPEEDSTER", "GOLD_GLOVE", "CATCHER", "FIREBALLER", "FINESSE", "INNING_EATER", "CLOSER", "CLUTCH"] as ClassTag[]).map((t) => [t, synergyCounts.get(t) ?? 0]));

  const summary: Record<string, string | number> = {
    cards: cards.length,
    hitters: hitters.length,
    pitchers: pitchers.length,
    batsL: `${handShare.L}%`,
    batsR: `${handShare.R}%`,
    batsS: `${handShare.S}%`,
    lhp: `${lhpShare}%`,
    ...Object.fromEntries(COSTS.map((c) => [`ovrCost${c}`, ovrByCost[c].length ? `${Math.min(...ovrByCost[c]).toFixed(1)}~${Math.max(...ovrByCost[c]).toFixed(1)}` : "-"])),
    ...Object.fromEntries(Object.entries(classCounts).map(([k, v]) => [`tag_${k}`, v])),
    ...Object.fromEntries(Object.values(SYNERGIES).filter((s) => s.kind === "ORIGIN").map((s) => [`origin_${s.id}`, synergyCounts.get(s.id) ?? 0])),
  };
  return { ok: errors.length === 0, errors, warnings, summary };
}
