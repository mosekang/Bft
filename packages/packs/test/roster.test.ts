import { describe, expect, it } from "vitest";
import { PACK_COMPOSITION, cardDisplay, cardOvr } from "@dugout/engine";
import type { CardDef } from "@dugout/protocol";
import {
  FICTIONAL_TEAMS,
  buildPackFromRoster,
  generatePack,
  hitterClassMargins,
  parseRosterCsv,
  parseTeamsCsv,
  pitcherClassMargins,
  ruleOrigin,
  validatePack,
  type DisplayFive,
  type RosterRow,
} from "../src/index.js";

const source = generatePack({ seed: "fictional-v1" });
const teams = FICTIONAL_TEAMS.map((t) => ({ ...t }));

function toRow(c: CardDef, keepTags: boolean): RosterRow {
  return {
    name: c.name,
    team: c.team,
    role: c.role,
    pos: c.pos,
    pos2: c.pos2,
    cost: c.cost,
    bats: c.bats,
    throws: c.throws,
    age: c.age,
    ...(c.nationality !== undefined ? { nationality: c.nationality } : {}),
    display: Object.values(cardDisplay(c)) as unknown as DisplayFive,
    ...(keepTags ? { origin: c.origin, classes: c.classes } : {}),
  };
}

describe("buildPackFromRoster", () => {
  it("round-trips a valid pack when tags are pinned", () => {
    const { pack } = buildPackFromRoster(source.cards.map((c) => toRow(c, true)), teams, { id: "roster-test", name: "테스트" });
    expect(pack.kind).toBe("private");
    expect(validatePack(pack).errors).toEqual([]);
    pack.cards.forEach((c, i) => {
      const src = source.cards[i]!;
      expect(c.cost).toBe(src.cost);
      expect(c.classes).toEqual(src.classes);
      const [lo, hi] = PACK_COMPOSITION[c.cost].ovr;
      expect(cardOvr(c)).toBeGreaterThanOrEqual(lo);
      expect(cardOvr(c)).toBeLessThanOrEqual(hi);
      expect(c.nickname.length).toBeGreaterThan(0);
    });
  });

  it("derives tags by rule and meets the pack-wide tag minimums", () => {
    const { pack } = buildPackFromRoster(source.cards.map((c) => toRow(c, false)), teams, { id: "roster-rules", name: "규칙" });
    const report = validatePack(pack);
    expect(report.errors.filter((e) => e.startsWith("synergy"))).toEqual([]);
    for (const c of pack.cards) {
      if (c.cost === 5) expect(c.classes).toHaveLength(2);
      if (c.role === "H") expect(c.classes.includes("CATCHER")).toBe(c.pos === "C");
      if (c.nationality && c.nationality !== "KR") expect(c.origin).toBe("FOREIGN");
      else if (c.age <= 22) expect(c.origin).toBe("HS_PROSPECT");
      else if (c.age >= 32) expect(c.origin).toBe("VETERAN");
    }
  });

  it("is deterministic per seed", () => {
    const rows = source.cards.map((c) => toRow(c, false));
    const a = buildPackFromRoster(rows, teams, { id: "det", name: "d", seed: "s1" });
    expect(buildPackFromRoster(rows, teams, { id: "det", name: "d", seed: "s1" })).toEqual(a);
    expect(buildPackFromRoster(rows, teams, { id: "det", name: "d", seed: "s2" }).pack.cards).not.toEqual(a.pack.cards);
  });

  it("keeps display ratings close to the authored values", () => {
    const rows = source.cards.map((c) => toRow(c, true));
    const { pack } = buildPackFromRoster(rows, teams, { id: "close", name: "c", spread: 3 });
    pack.cards.forEach((c, i) => {
      const got = Object.values(cardDisplay(c));
      rows[i]!.display.forEach((v, k) => {
        if (c.role === "H" && c.pos === "DH" && k === 4) return;
        expect(Math.abs(got[k]! - v), `${c.name} #${k}`).toBeLessThanOrEqual(12);
      });
    });
  });
});

describe("roster CSV", () => {
  const csv = [
    "name,team,role,pos,pos2,cost,bats,throws,age,nationality,contact,power,eye,speed,defense,stuff,control,movement,stamina,mental,sidearm,origin,classes",
    "가타자,seoul-a,H,SS,2B|3B,3,L,R,24,,70,50,60,75,80,,,,,,,,",
    "나투수,busan,SP,,,2,R,R,33,US,,,,,,55,70,72,60,58,yes,,FINESSE",
  ].join("\n");

  it("parses hitters, pitchers and overrides", () => {
    const [h, p] = parseRosterCsv(csv);
    expect(h).toMatchObject({ name: "가타자", role: "H", pos: "SS", pos2: ["2B", "3B"], cost: 3, bats: "L", display: [70, 50, 60, 75, 80] });
    expect(h!.nationality).toBeUndefined();
    expect(p).toMatchObject({ role: "SP", pos: "DH", nationality: "US", sidearm: true, classes: ["FINESSE"], display: [55, 70, 72, 60, 58] });
  });

  it("reports the bad line", () => {
    expect(() => parseRosterCsv(csv.replace("70,50,60,75,80", "70,50,60,75,120"))).toThrow(/line 2.*defense/);
    expect(() => parseRosterCsv(csv.replace(",H,SS,", ",X,SS,"))).toThrow(/line 2.*role/);
  });

  it("parses teams with optional columns", () => {
    const t = parseTeamsCsv("id,name,color,nickname,short,secondary,uniform\na,에이,#112233,에이스,A,,pinstripe\n");
    expect(t).toEqual([{ id: "a", name: "에이", color: "#112233", nickname: "에이스", short: "A", uniform: "pinstripe" }]);
  });
});

describe("tag rules (§5.6)", () => {
  it("hitter rules", () => {
    const m = Object.fromEntries(hitterClassMargins({ contact: 72, power: 80, speed: 60, defense: 72 }, "SS").map((x) => [x.tag, x.ok]));
    expect(m).toEqual({ SLUGGER: true, CONTACT_HITTER: true, SPEEDSTER: false, GOLD_GLOVE: true });
    expect(hitterClassMargins({ contact: 80, power: 80, speed: 0, defense: 99 }, "DH").filter((x) => x.ok).map((x) => x.tag)).toEqual(["CONTACT_HITTER"]);
  });

  it("pitcher rules", () => {
    const ok = (role: "SP" | "RP", d: Parameters<typeof pitcherClassMargins>[0]) => pitcherClassMargins(d, role).filter((x) => x.ok).map((x) => x.tag);
    expect(ok("SP", { stuff: 60, movement: 70, stamina: 75, mental: 80 })).toEqual(["FINESSE", "INNING_EATER", "CLUTCH"]);
    expect(ok("RP", { stuff: 75, movement: 70, stamina: 75, mental: 50 })).toEqual(["FIREBALLER", "CLOSER"]);
  });

  it("origin rules", () => {
    expect(ruleOrigin(35, "US")).toBe("FOREIGN");
    expect(ruleOrigin(20, "KR")).toBe("HS_PROSPECT");
    expect(ruleOrigin(32, undefined)).toBe("VETERAN");
    expect(ruleOrigin(27, "KR")).toBeUndefined();
  });
});
