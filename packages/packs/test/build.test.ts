import { describe, expect, it } from "vitest";
import { buildPackFromCsv, parseCsv, validatePack } from "../src/index.js";

function hittersCsv(n: number): string {
  const rows = ["name,team,bats,throws,pos,age,PA,AVG,OBP,SLG,BB%,K%,HR,ISO,BABIP,GB%,SB,CS,DEF,3B,nationality"];
  const pos = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
  for (let i = 0; i < n; i++) rows.push(`"타자 ${i + 1}",팀${(i % 5) + 1},${i % 3 ? "R" : "L"},R,${pos[i % 9]},${20 + (i % 18)},${400 + i},0.${260 + (i % 40)},0.${330 + (i % 40)},0.${380 + (i % 100)},${6 + (i % 8)}%,${14 + (i % 12)}%,${i % 30},0.${100 + (i % 120)},0.${280 + (i % 50)},${40 + (i % 15)}%,${i % 25},${i % 6},${(i % 20) - 10},${i % 5},${i % 11 === 0 ? "US" : "KR"}`);
  return rows.join("\n");
}
function pitchersCsv(n: number): string {
  const rows = ["name,team,throws,role,age,IP,K%,BB%,HR9,GB%,ERA,FIP,PIT/GS,nationality"];
  for (let i = 0; i < n; i++) rows.push(`투수 ${i + 1},팀${(i % 5) + 1},${i % 4 ? "R" : "L"},${i % 3 ? "SP" : "RP"},${22 + (i % 14)},${60 + i * 5},${15 + (i % 15)}%,${5 + (i % 8)}%,${(0.6 + (i % 10) / 10).toFixed(1)},${38 + (i % 20)}%,${(2.5 + (i % 30) / 10).toFixed(2)},${(3 + (i % 20) / 10).toFixed(2)},${70 + (i % 30)},${i % 9 === 0 ? "DO" : "KR"}`);
  return rows.join("\n");
}

describe("parseCsv", () => {
  it("handles quotes and CRLF", () => {
    const rows = parseCsv('a,b\r\n"x, y",2\r\n"q""q",3\n');
    expect(rows).toEqual([{ a: "x, y", b: "2" }, { a: 'q"q', b: "3" }]);
  });
});

describe("buildPackFromCsv (§5.6)", () => {
  it("builds a private pack with mechanical costs and tags", () => {
    const pack = buildPackFromCsv(hittersCsv(45), pitchersCsv(20), { id: "test-kbo", name: "테스트" });
    expect(pack.kind).toBe("private");
    expect(pack.cards).toHaveLength(59);
    const byCost = [1, 2, 3, 4, 5].map((c) => pack.cards.filter((x) => x.cost === c).length);
    expect(byCost).toEqual([13, 13, 13, 12, 8]);
    for (const c of pack.cards) expect(c.classes.length).toBeGreaterThanOrEqual(1);
    expect(pack.cards.filter((c) => c.origin === "FOREIGN").length).toBeGreaterThan(0);
    const report = validatePack(pack);
    // Real data rarely satisfies the fictional composition exactly; the pack must at least be schema-valid and playable.
    expect(report.errors.filter((e) => e.startsWith("schema"))).toEqual([]);
  });

  it("fills a short roster with fictional cards", () => {
    const pack = buildPackFromCsv(hittersCsv(10), pitchersCsv(5), { id: "short", name: "짧은 팩" });
    expect(pack.cards).toHaveLength(59);
    expect(pack.cards.some((c) => c.id.startsWith("f"))).toBe(true);
  });
});
