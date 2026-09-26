import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { LEAGUE, STADIUMS, createRng, defsById, resolveTeam, sampleRoster, simulateGame, type GameOutput, type SimTeam } from "@dugout/engine";
import { PackSchema, type GameEvent, type Pack, type StadiumId } from "@dugout/protocol";

const require = createRequire(import.meta.url);

export function loadPack(path?: string): Pack {
  const file = path ?? require.resolve("@dugout/packs/fictional-v1.json");
  return PackSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export interface SimGameOptions {
  seed: string;
  games: number;
  level: number;
  stadium: StadiumId;
  pack: string | undefined;
  json: boolean;
}

const KO: Record<string, string> = {
  BB: "볼넷", K: "삼진", HR: "홈런", "1B": "안타", "2B": "2루타", "3B": "3루타", GO: "땅볼 아웃", FO: "뜬공 아웃", LO: "직선타 아웃", PO: "팝플라이 아웃",
  DP: "병살타", SF: "희생플라이", SH: "희생번트", E: "실책 출루", FC: "야수선택", SB: "도루 성공", CS: "도루 실패",
};

export function describeEvent(e: GameEvent): string {
  const who = String(e.meta?.["batterName"] ?? e.batter);
  const pit = String(e.meta?.["pitcherName"] ?? e.pitcher);
  const runs = Number(e.meta?.["runs"] ?? 0);
  const inn = `${e.inning}회${e.half === "T" ? "초" : "말"}`;
  const score = `${e.scoreAfter[0]}:${e.scoreAfter[1]}`;
  if (e.type === "SB" || e.type === "CS") return `${inn} ${String(e.meta?.["runnerName"])} ${KO[e.type]}`;
  if (e.type === "PITCHING_CHANGE") return `${inn} 투수 교체: ${String(e.meta?.["fromName"])} → ${String(e.meta?.["toName"])} (${String(e.meta?.["reason"])})`;
  if (e.type === "INNING_END") return `${inn} 종료 ${score}`;
  if (e.type === "GAME_END") return e.meta?.["draw"] ? `경기 종료 — 무승부 ${score}` : `경기 종료 ${score}`;
  const base = `${inn} ${who} ${KO[e.type] ?? e.type} (투수 ${pit})`;
  return runs > 0 ? `${base} ${runs}득점 → ${score}` : base;
}

function teamLabel(t: SimTeam): string {
  return `${t.name} [선발 ${t.starter.name}${t.starter.tired ? "(피로)" : ""}]`;
}

export function formatBox(g: GameOutput, home: SimTeam, away: SimTeam): string {
  const lines: string[] = [];
  const innings = Math.max(g.home.lineScore.length, g.away.lineScore.length);
  const header = ["팀".padEnd(6), ...Array.from({ length: innings }, (_, i) => String(i + 1).padStart(2)), " R", " H", " E"].join(" ");
  const row = (name: string, s: typeof g.home) => [name.padEnd(6), ...Array.from({ length: innings }, (_, i) => String(s.lineScore[i] ?? (i >= s.lineScore.length ? "X" : 0)).padStart(2)), String(s.runs).padStart(2), String(s.hits).padStart(2), String(s.errors).padStart(2)].join(" ");
  lines.push(header, row(away.name, g.away), row(home.name, g.home), "");
  lines.push(`원정 ${teamLabel(away)} · 홈 ${teamLabel(home)}`);
  for (const [label, team, box] of [["원정", away, g.away], ["홈", home, g.home]] as const) {
    lines.push(`\n[${label} 타격]  ${"선수".padEnd(10)} PA AB  H 2B 3B HR BB  K RBI  R SB`);
    team.lineup.forEach((h, i) => {
      const b = box.batting.get(h.id)!;
      lines.push(`  ${i + 1}. ${h.name.padEnd(10)} ${[b.pa, b.ab, b.h, b.doubles, b.triples, b.hr, b.bb, b.k, b.rbi, b.r, b.sb].map((v) => String(v).padStart(2)).join(" ")}  ${h.pos}${h.isReplacement ? " (대체)" : ""}`);
    });
    lines.push(`[${label} 투수]   ${"선수".padEnd(10)}  IP  H  R BB  K HR  P`);
    for (const p of box.pitching.values()) {
      lines.push(`     ${p.name.padEnd(10)} ${(Math.floor(p.outs / 3) + "." + (p.outs % 3)).padStart(4)} ${[p.h, p.r, p.bb, p.k, p.hr].map((v) => String(v).padStart(2)).join(" ")} ${String(p.pitches).padStart(3)} ${p.decision ?? ""}`);
    }
  }
  lines.push("\n[하이라이트]");
  for (const i of g.highlights) lines.push(`  ${describeEvent(g.events[i]!)}`);
  if (g.mvp) lines.push(`\nMVP: ${g.mvp.name} (${g.mvp.side === "home" ? home.name : away.name})`);
  return lines.join("\n");
}

export function runSimGame(opts: SimGameOptions, out: (s: string) => void): number {
  const pack = loadPack(opts.pack);
  const defs = defsById(pack);
  const stadium = STADIUMS[opts.stadium];
  const build = (seed: string, id: string, name: string): SimTeam => {
    const roster = sampleRoster(pack, createRng(seed, "roster"), opts.level, { prefix: id });
    return resolveTeam({ teamId: id, name, board: roster.board, cards: roster.cards, defs, stadium: opts.stadium });
  };
  if (opts.games <= 1) {
    const home = build(`${opts.seed}:home`, "H", "홈팀");
    const away = build(`${opts.seed}:away`, "A", "원정팀");
    const g = simulateGame({ home, away, stadium, seed: opts.seed });
    if (opts.json) {
      out(JSON.stringify({ ...g, home: { ...g.home, batting: [...g.home.batting], pitching: [...g.home.pitching] }, away: { ...g.away, batting: [...g.away.batting], pitching: [...g.away.pitching] } }, null, 2));
    } else {
      out(`seed "${opts.seed}" · 구장 ${stadium.nameKo} · 레벨 ${opts.level}\n`);
      out(formatBox(g, home, away));
    }
    return 0;
  }
  let runs = 0, draws = 0, k = 0, bb = 0, hr = 0, h = 0, pa = 0, innings = 0, events = 0, homeWins = 0;
  const t0 = performance.now();
  for (let i = 0; i < opts.games; i++) {
    const home = build(`${opts.seed}:h${i}`, "H", "홈");
    const away = build(`${opts.seed}:a${i}`, "A", "원정");
    const g = simulateGame({ home, away, stadium, seed: `${opts.seed}:${i}` });
    runs += g.score[0] + g.score[1];
    innings += g.innings;
    events += g.events.length;
    if (g.winner === null) draws++;
    if (g.winner === "home") homeWins++;
    for (const s of [g.home, g.away]) for (const b of s.batting.values()) { k += b.k; bb += b.bb; hr += b.hr; h += b.h; pa += b.pa; }
  }
  const ms = (performance.now() - t0) / opts.games;
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const target = (x: number, lo: number, hi: number) => (x >= lo && x <= hi ? "OK" : "OUT");
  const rpg = runs / (2 * opts.games);
  const report = {
    games: opts.games,
    runsPerTeam: rpg.toFixed(2),
    runsTarget: `${target(rpg, LEAGUE.targetRuns - LEAGUE.targetRunsTolerance, LEAGUE.targetRuns + LEAGUE.targetRunsTolerance)} (4.4~5.2)`,
    draws: `${pct(draws / opts.games)} ${target(draws / opts.games, 0.03, 0.07)} (3~7%)`,
    homeWin: pct(homeWins / (opts.games - draws)),
    kRate: `${pct(k / pa)} (기준 ${pct(LEAGUE.kRate)})`,
    bbRate: `${pct(bb / pa)} (기준 ${pct(LEAGUE.bbRate)})`,
    hrRate: `${pct(hr / pa)} (기준 ${pct(LEAGUE.hrRate)})`,
    hitsPerTeamGame: (h / (2 * opts.games)).toFixed(2),
    avgInnings: (innings / opts.games).toFixed(2),
    avgEvents: (events / opts.games).toFixed(1),
    msPerGame: `${ms.toFixed(2)} ${ms <= 30 ? "OK" : "OUT"} (≤30ms)`,
  };
  if (opts.json) out(JSON.stringify(report, null, 2));
  else for (const [k2, v] of Object.entries(report)) out(`${k2.padEnd(16)} ${v}`);
  return 0;
}
