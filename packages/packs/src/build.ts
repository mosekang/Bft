/**
 * CSV → private pack converter (§5.6). Percentile-based ratings, mechanical
 * cost assignment, rule-based tags. Real-player packs are never committed.
 */
import { PACK_COMPOSITION, PACK_CARD_COUNT, baseNickname, cardOvr, createRng } from "@dugout/engine";
import { PackSchema, type CardDef, type ClassTag, type Cost, type Hand, type HitterRatings, type OriginTag, type Pack, type PitcherRatings, type Pos } from "@dugout/protocol";
import { CLASS_MINIMUMS, generatePack } from "./generate.js";
import { FICTIONAL_TEAMS } from "./names.js";

export interface HitterRow {
  name: string; team: string; bats: string; throws: string; pos: string; age: number; PA: number; AVG: number; OBP: number; SLG: number;
  "BB%": number; "K%": number; HR: number; ISO: number; BABIP: number; "GB%": number; SB: number; CS: number; DEF: number; "3B"?: number; nationality?: string;
}
export interface PitcherRow {
  name: string; team: string; throws: string; role: string; age: number; IP: number; "K%": number; "BB%": number; HR9: number; "GB%": number; ERA: number; FIP: number; "PIT/GS": number; nationality?: string;
}

/** Tiny CSV parser (quoted fields, commas, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()?.map((h) => h.trim()) ?? [];
  return rows.filter((r) => r.some((x) => x.trim() !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const num = (v: string | undefined): number => { const n = Number(String(v ?? "").replace("%", "")); return Number.isFinite(n) ? n : 0; };
const pct = (v: number) => (v > 1 ? v / 100 : v);

/** 20 + 79 × percentile within the group (§5.6). */
function percentileRating(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const below = sorted.filter((x) => x < v).length;
    const equal = sorted.filter((x) => x === v).length;
    const p = sorted.length <= 1 ? 0.5 : (below + (equal - 1) / 2) / (sorted.length - 1);
    return Math.max(1, Math.min(99, Math.round(20 + 79 * p)));
  });
}

const hand = (v: string): Hand => (v.toUpperCase().startsWith("L") || v.includes("좌") ? "L" : v.toUpperCase().startsWith("S") || v.includes("양") ? "S" : "R");
const throwsOf = (v: string): "L" | "R" => (v.toUpperCase().startsWith("L") || v.includes("좌") ? "L" : "R");
const posOf = (v: string): Pos => {
  const u = v.toUpperCase().replace("DH", "DH");
  const map: Record<string, Pos> = { C: "C", "1B": "1B", "2B": "2B", "3B": "3B", SS: "SS", LF: "LF", CF: "CF", RF: "RF", DH: "DH", 포수: "C", "1루수": "1B", "2루수": "2B", "3루수": "3B", 유격수: "SS", 좌익수: "LF", 중견수: "CF", 우익수: "RF", 지명타자: "DH" };
  return map[u] ?? map[v] ?? "DH";
};

export interface BuildOptions {
  id: string;
  name: string;
  seed?: string;
  /** Country code for rows without a nationality column value; "KR" means domestic. */
  defaultNationality?: string;
}

export function buildPackFromCsv(hittersCsv: string, pitchersCsv: string, opts: BuildOptions): Pack {
  const rng = createRng(opts.seed ?? opts.id, "csv");
  const hRows = parseCsv(hittersCsv);
  const pRows = parseCsv(pitchersCsv);
  const teams = new Map<string, string>();
  const teamId = (name: string) => {
    if (!teams.has(name)) teams.set(name, `t${teams.size + 1}`);
    return teams.get(name)!;
  };

  // --- hitters ----------------------------------------------------------------
  const hStats = hRows.map((r) => ({
    r,
    power: num(r["ISO"]) * 0.6 + (num(r["HR"]) / Math.max(1, num(r["PA"]))) * 0.4,
    eye: pct(num(r["BB%"])),
    contact: (1 - pct(num(r["K%"]))) * 0.5 + num(r["BABIP"]) * 0.5,
    speed: num(r["SB"]) * 0.7 + num(r["3B"]) * 0.3,
    def: num(r["DEF"]),
    gb: pct(num(r["GB%"])),
    sbRate: num(r["SB"]) / Math.max(1, num(r["SB"]) + num(r["CS"])),
  }));
  const P = { power: percentileRating(hStats.map((x) => x.power)), eye: percentileRating(hStats.map((x) => x.eye)), contact: percentileRating(hStats.map((x) => x.contact)), speed: percentileRating(hStats.map((x) => x.speed)), def: percentileRating(hStats.map((x) => x.def)), gb: percentileRating(hStats.map((x) => x.gb)), sb: percentileRating(hStats.map((x) => x.sbRate)) };
  const hitters: Omit<CardDef, "cost" | "origin" | "classes" | "nickname">[] = hStats.map((x, i) => {
    const pos = posOf(x.r["pos"] ?? "DH");
    const bats = hand(x.r["bats"] ?? "R");
    const platoon = bats === "L" ? 4 : bats === "R" ? -4 : 0;
    const def: Partial<Record<Pos, number>> = {};
    if (pos !== "DH") def[pos] = P.def[i]!;
    const hitter: HitterRatings = {
      kRate: P.contact[i]!, contactL: Math.max(1, Math.min(99, P.contact[i]! - platoon)), contactR: Math.max(1, Math.min(99, P.contact[i]! + platoon)), hrRate: P.power[i]!, xbhRate: P.power[i]!, bbRate: P.eye[i]!,
      gbTend: P.gb[i]!, pullTend: 55, speed: P.speed[i]!, sbSkill: P.sb[i]!, def, arm: P.def[i]!, clutch: 0,
    };
    return { id: `h${i + 1}`, name: x.r["name"] ?? `타자${i + 1}`, team: teamId(x.r["team"] ?? "기타"), age: Math.max(17, Math.min(45, num(x.r["age"]) || 27)), bats, throws: throwsOf(x.r["throws"] ?? "R"), role: "H", pos, pos2: [], nationality: (x.r["nationality"] || opts.defaultNationality || "KR").toUpperCase().slice(0, 2), hitter };
  });

  // --- pitchers ---------------------------------------------------------------
  const pStats = pRows.map((r) => ({ r, k: pct(num(r["K%"])), bb: -pct(num(r["BB%"])), mov: -num(r["HR9"]) * 0.5 + pct(num(r["GB%"])) * 0.5, gb: pct(num(r["GB%"])), sta: num(r["PIT/GS"]), mental: -(num(r["ERA"]) - num(r["FIP"])) }));
  const Q = { k: percentileRating(pStats.map((x) => x.k)), bb: percentileRating(pStats.map((x) => x.bb)), mov: percentileRating(pStats.map((x) => x.mov)), gb: percentileRating(pStats.map((x) => x.gb)), sta: percentileRating(pStats.map((x) => x.sta)), mental: percentileRating(pStats.map((x) => x.mental)) };
  const pitchers: Omit<CardDef, "cost" | "origin" | "classes" | "nickname">[] = pStats.map((x, i) => {
    const throws = throwsOf(x.r["throws"] ?? "R");
    const role = (x.r["role"] ?? "SP").toUpperCase().startsWith("R") || x.r["role"]?.includes("불펜") ? "RP" : "SP";
    const pitcher: PitcherRatings = { kRate: Q.k[i]!, bbRate: Q.bb[i]!, hrRate: Q.mov[i]!, gbRate: Q.gb[i]!, contactVsL: Math.max(1, Math.min(99, Q.k[i]! + (throws === "L" ? 5 : 0))), contactVsR: Q.k[i]!, stamina: role === "RP" ? Math.min(Q.sta[i]!, 45) : Q.sta[i]!, mental: Q.mental[i]!, hold: 55, armAngle: 60 };
    return { id: `p${i + 1}`, name: x.r["name"] ?? `투수${i + 1}`, team: teamId(x.r["team"] ?? "기타"), age: Math.max(17, Math.min(45, num(x.r["age"]) || 27)), bats: throws, throws, role, pos: "DH", pos2: [], nationality: (x.r["nationality"] || opts.defaultNationality || "KR").toUpperCase().slice(0, 2), pitcher };
  });

  // --- cost by OVR percentile (§5.6) ------------------------------------------
  const all = [...hitters, ...pitchers].map((c) => ({ c, ovr: cardOvr({ ...c, cost: 1, origin: "COLLEGE", classes: ["CLUTCH"], nickname: "" } as CardDef) })).sort((a, b) => b.ovr - a.ovr);
  const tiers: Cost[] = [];
  for (const [cost, n] of [[5, 8], [4, 12], [3, 13], [2, 13], [1, 13]] as [Cost, number][]) for (let i = 0; i < n; i++) tiers.push(cost);
  let ranked = all.slice(0, PACK_CARD_COUNT).map((x, i) => ({ ...x, cost: tiers[i] ?? 1 }));

  // --- tags (§5.6) -------------------------------------------------------------
  const originPool: OriginTag[] = ["COLLEGE", "MILITARY_DONE", "JOURNEYMAN"];
  const cards: CardDef[] = ranked.map(({ c, cost }, i) => {
    const classes: ClassTag[] = [];
    const nat = c.nationality ?? "KR";
    if (c.role === "H" && c.hitter) {
      const d = { contact: (c.hitter.kRate + c.hitter.contactL + c.hitter.contactR) / 3, power: c.hitter.hrRate, speed: c.hitter.speed, defense: c.hitter.def[c.pos] ?? 40 };
      if (d.power >= 70 && d.contact < d.power) classes.push("SLUGGER");
      if (d.contact >= 70) classes.push("CONTACT_HITTER");
      if (d.speed >= 70) classes.push("SPEEDSTER");
      if (d.defense >= 72) classes.push("GOLD_GLOVE");
      if (c.pos === "C") classes.unshift("CATCHER");
    } else if (c.pitcher) {
      const stuff = c.pitcher.kRate, mov = c.pitcher.gbRate;
      if (stuff >= 72) classes.push("FIREBALLER");
      if (mov >= 68 && stuff < 65) classes.push("FINESSE");
      if (c.pitcher.stamina >= 72 && c.role === "SP") classes.push("INNING_EATER");
      if (c.role === "RP" && stuff >= 70) classes.push("CLOSER");
    }
    const mental = c.pitcher?.mental ?? 55;
    if ((mental >= 75 || rng.chance(0.15)) && classes.length < 2 && !classes.includes("CLUTCH")) classes.push("CLUTCH");
    if (classes.length === 0) classes.push(c.role === "H" ? "CLUTCH" : "FINESSE");
    while (classes.length > 2) classes.pop();
    if (cost === 5 && classes.length < 2) classes.push(c.role === "H" ? (classes.includes("CLUTCH") ? "CONTACT_HITTER" : "CLUTCH") : classes.includes("CLUTCH") ? "FINESSE" : "CLUTCH");
    const origin: OriginTag = nat !== "KR" ? "FOREIGN" : c.age <= 22 ? "HS_PROSPECT" : c.age >= 32 ? "VETERAN" : rng.pick(originPool);
    const card: CardDef = { ...c, cost, origin, classes: [...new Set(classes)].slice(0, 2), nickname: "" } as CardDef;
    return { ...card, nickname: baseNickname(card, rng.fork(`nick${i}`)) };
  });

  // --- fill to 59 with fictional cards when short (§5.6) -----------------------
  if (cards.length < PACK_CARD_COUNT) {
    const filler = generatePack({ seed: `${opts.id}-filler`, id: "filler" }).cards;
    const have = new Set(cards.map((c) => c.name));
    for (const f of filler) {
      if (cards.length >= PACK_CARD_COUNT) break;
      if (have.has(f.name)) continue;
      cards.push({ ...f, id: `f${cards.length + 1}`, team: teamId("가상") });
    }
  }
  // Top up class minimums with second tags where possible.
  for (const [tag, min] of Object.entries(CLASS_MINIMUMS) as [ClassTag, number][]) {
    let n = cards.filter((c) => c.classes.includes(tag)).length;
    for (const c of cards) {
      if (n >= min) break;
      const hitterTag = ["SLUGGER", "CONTACT_HITTER", "SPEEDSTER", "GOLD_GLOVE", "CATCHER"].includes(tag);
      if (tag === "CATCHER" || c.classes.length >= 2 || c.classes.includes(tag) || (hitterTag !== (c.role === "H"))) continue;
      if ((tag === "INNING_EATER" && c.role !== "SP") || (tag === "CLOSER" && c.role !== "RP")) continue;
      c.classes = [...c.classes, tag];
      n++;
    }
  }

  const teamList = [...teams.entries()].map(([name, id], i) => ({ id, name, color: FICTIONAL_TEAMS[i % FICTIONAL_TEAMS.length]!.color }));
  const pack: Pack = { formatVersion: 1, id: opts.id, name: opts.name, kind: "private", generatedBy: { tool: "@dugout/packs build", version: "1.0.0", seed: opts.seed ?? opts.id }, teams: teamList.length ? teamList : [{ id: "t1", name: "기타", color: "#64748b" }], cards };
  void PACK_COMPOSITION;
  return PackSchema.parse(pack);
}
