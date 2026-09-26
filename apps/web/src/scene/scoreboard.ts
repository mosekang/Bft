/**
 * KBO-style electronic scoreboard drawn into a 1024×512 canvas (§16.6):
 * line score 1–12, R H E, B/S/O lamps, current batter/pitcher and a flashing
 * message banner (HOME RUN, DRAW…).
 */
export interface BoardTeam { short: string; color: string; line: number[]; r: number; h: number; e: number }
export interface BoardData {
  away: BoardTeam;
  home: BoardTeam;
  inning: number;
  half: "T" | "B";
  balls?: number;
  strikes?: number;
  outs?: number;
  batter?: string;
  pitcher?: string;
  /** Big banner text (already localised or an English code). */
  message?: string;
  flash?: boolean;
  /** Small header, e.g. round "S2-3". */
  header?: string;
}

export const BOARD_W = 1024;
export const BOARD_H = 512;

export function drawScoreboard(g: CanvasRenderingContext2D, d: BoardData, blink = false): void {
  g.fillStyle = "#07090c";
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.strokeStyle = "#1e293b"; g.lineWidth = 10; g.strokeRect(5, 5, BOARD_W - 10, BOARD_H - 10);
  const led = "#ffcf3f", dim = "#3a3320", white = "#f8fafc";
  g.textBaseline = "middle";
  g.font = "bold 30px 'Bebas Neue', 'Arial Narrow', sans-serif";
  g.fillStyle = "#94a3b8"; g.textAlign = "left";
  g.fillText(d.header ?? "DUGOUT TACTICS", 24, 34);
  // Header row.
  const x0 = 170, cw = 50;
  g.textAlign = "center";
  for (let i = 1; i <= 12; i++) { g.fillStyle = i === d.inning ? led : "#64748b"; g.fillText(String(i), x0 + (i - 0.5) * cw, 80); }
  const rx = x0 + 12 * cw + 10;
  ["R", "H", "E"].forEach((t, i) => { g.fillStyle = "#e2e8f0"; g.fillText(t, rx + i * 58 + 29, 80); });
  const row = (t: BoardTeam, y: number, batting: boolean) => {
    g.fillStyle = t.color; g.fillRect(20, y - 28, 140, 56);
    g.fillStyle = white; g.font = "bold 40px 'Bebas Neue', 'Arial Narrow', sans-serif"; g.fillText(t.short || "—", 90, y + 2);
    if (batting) { g.fillStyle = led; g.beginPath(); g.moveTo(164, y); g.lineTo(152, y - 9); g.lineTo(152, y + 9); g.fill(); }
    g.font = "bold 40px 'Bebas Neue', 'Arial Narrow', sans-serif";
    for (let i = 0; i < 12; i++) { const v = t.line[i]; g.fillStyle = v === undefined ? dim : led; g.fillText(v === undefined ? "·" : String(v), x0 + (i + 0.5) * cw, y + 2); }
    [t.r, t.h, t.e].forEach((v, i) => { g.fillStyle = i === 0 ? "#fb923c" : led; g.fillText(String(v), rx + i * 58 + 29, y + 2); });
  };
  row(d.away, 132, d.half === "T");
  row(d.home, 196, d.half === "B");
  // B S O lamps.
  const lamps = (label: string, n: number, max: number, on: string, y: number) => {
    g.fillStyle = "#cbd5e1"; g.textAlign = "left"; g.font = "bold 30px 'Bebas Neue', sans-serif"; g.fillText(label, 24, y);
    for (let i = 0; i < max; i++) { g.fillStyle = i < n ? on : "#1f2937"; g.beginPath(); g.arc(70 + i * 34, y, 12, 0, Math.PI * 2); g.fill(); }
  };
  lamps("B", d.balls ?? 0, 3, "#22c55e", 262);
  lamps("S", d.strikes ?? 0, 2, "#facc15", 300);
  lamps("O", d.outs ?? 0, 2, "#ef4444", 338);
  g.textAlign = "left"; g.font = "bold 32px 'Noto Sans KR', sans-serif"; g.fillStyle = "#e2e8f0";
  if (d.batter) g.fillText(`타자  ${d.batter}`, 200, 268);
  if (d.pitcher) g.fillText(`투수  ${d.pitcher}`, 200, 318);
  g.textAlign = "right"; g.fillStyle = "#94a3b8"; g.font = "bold 30px 'Bebas Neue', sans-serif";
  g.fillText(`${d.inning}${d.half === "T" ? "회초" : "회말"}`, BOARD_W - 26, 34);
  // Message banner.
  if (d.message && (!d.flash || !blink)) {
    g.fillStyle = d.flash ? "#b91c1c" : "#0f172a";
    g.fillRect(20, 372, BOARD_W - 40, 118);
    g.textAlign = "center"; g.fillStyle = d.flash ? "#fde047" : white;
    g.font = "bold 92px 'Black Han Sans', 'Bebas Neue', sans-serif";
    g.fillText(d.message, BOARD_W / 2, 434);
  }
  // LED dot mask.
  g.fillStyle = "rgba(0,0,0,0.28)";
  for (let y = 0; y < BOARD_H; y += 4) g.fillRect(0, y, BOARD_W, 1);
}
