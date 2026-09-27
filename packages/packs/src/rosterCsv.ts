/**
 * CSV front-end for the roster builder.
 *
 * Roster columns: name, team, role (H|SP|RP), pos, pos2 ("RF|CF"), cost (1..5),
 * bats (L|R|S), throws (L|R), age, nationality (blank = KR), then the five
 * display ratings — hitters: contact, power, eye, speed, defense; pitchers:
 * stuff, control, movement, stamina, mental — and optional sidearm (1/true),
 * origin and classes ("SLUGGER|CLUTCH") overrides.
 *
 * Team columns: id, name, color, and optional nickname, short, secondary, uniform.
 */
import {
  ClassTagSchema,
  CostSchema,
  HandSchema,
  OriginTagSchema,
  PackTeamSchema,
  PosSchema,
  RoleSchema,
  ThrowsSchema,
  type PackTeam,
} from "@dugout/protocol";
import { parseCsv } from "./build.js";
import type { DisplayFive, RosterRow } from "./roster.js";

const HITTER_COLS = ["contact", "power", "eye", "speed", "defense"] as const;
const PITCHER_COLS = ["stuff", "control", "movement", "stamina", "mental"] as const;

const list = (v: string | undefined): string[] => (v ?? "").split(/[|;/ ]+/).map((s) => s.trim()).filter(Boolean);
const blankToUndef = (v: string | undefined): string | undefined => (v === undefined || v.trim() === "" ? undefined : v.trim());

function rating(r: Record<string, string>, col: string, line: number): number {
  const n = Number(r[col]);
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error(`roster line ${line}: ${col} must be an integer 1..99 (got "${r[col] ?? ""}")`);
  return n;
}

export function parseRosterCsv(text: string): RosterRow[] {
  return parseCsv(text).map((r, i) => {
    const line = i + 2;
    const fail = (msg: string): never => { throw new Error(`roster line ${line} (${r["name"] ?? "?"}): ${msg}`); };
    const role = RoleSchema.safeParse((r["role"] ?? "").toUpperCase()).data ?? fail(`bad role "${r["role"]}"`);
    const cols = role === "H" ? HITTER_COLS : PITCHER_COLS;
    const display = cols.map((c) => rating(r, c, line)) as unknown as DisplayFive;
    const pos = role === "H" ? (PosSchema.safeParse((r["pos"] ?? "").toUpperCase()).data ?? fail(`bad pos "${r["pos"]}"`)) : "DH";
    const pos2 = list(r["pos2"]).map((p) => PosSchema.safeParse(p.toUpperCase()).data ?? fail(`bad pos2 "${p}"`));
    const cost = CostSchema.safeParse(Number(r["cost"])).data ?? fail(`bad cost "${r["cost"]}"`);
    const bats = HandSchema.safeParse((r["bats"] ?? "").toUpperCase()).data ?? fail(`bad bats "${r["bats"]}"`);
    const throws = ThrowsSchema.safeParse((r["throws"] ?? "").toUpperCase()).data ?? fail(`bad throws "${r["throws"]}"`);
    const age = Number(r["age"]);
    if (!Number.isInteger(age) || age < 17 || age > 45) fail(`bad age "${r["age"]}"`);
    const nationality = blankToUndef(r["nationality"])?.toUpperCase();
    const origin = blankToUndef(r["origin"]);
    const classes = list(r["classes"]);
    const row: RosterRow = {
      name: blankToUndef(r["name"]) ?? fail("missing name"),
      team: blankToUndef(r["team"]) ?? fail("missing team"),
      role, pos, pos2, cost, bats, throws, age, display,
      ...(nationality !== undefined ? { nationality } : {}),
      ...(/^(1|true|y|yes)$/i.test(r["sidearm"] ?? "") ? { sidearm: true } : {}),
      ...(origin !== undefined ? { origin: OriginTagSchema.safeParse(origin.toUpperCase()).data ?? fail(`bad origin "${origin}"`) } : {}),
      ...(classes.length > 0 ? { classes: classes.map((c) => ClassTagSchema.safeParse(c.toUpperCase()).data ?? fail(`bad class "${c}"`)) } : {}),
    };
    return row;
  });
}

export function parseTeamsCsv(text: string): PackTeam[] {
  return parseCsv(text).map((r) =>
    PackTeamSchema.parse(Object.fromEntries(Object.entries(r).filter(([, v]) => v.trim() !== ""))),
  );
}
