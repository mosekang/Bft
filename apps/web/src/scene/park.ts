/**
 * Ballpark layout in metres (DESIGN §15.2, §16.5). Home plate at the origin,
 * +z toward centre field. Render space puts the 3B side on +x so that a
 * camera behind home plate sees left field on the left; spec coordinates
 * (protocol FIELD_COORDS, cinematic paths: 3B on −x) go through `specToWorld`.
 */
import type { StadiumId } from "@dugout/protocol";

export interface ParkDims { lf: number; cf: number; rf: number; fenceH: number; turf: boolean; sea: boolean; dome: boolean }

export function parkDims(id: StadiumId): ParkDims {
  switch (id) {
    case "HITTER_FRIENDLY": return { lf: 95, cf: 110, rf: 95, fenceH: 2.5, turf: false, sea: false, dome: false };
    case "PITCHER_FRIENDLY": return { lf: 105, cf: 125, rf: 105, fenceH: 4, turf: false, sea: false, dome: false };
    case "ARTIFICIAL_TURF": return { lf: 99, cf: 120, rf: 99, fenceH: 3, turf: true, sea: false, dome: false };
    case "SEA_BREEZE": return { lf: 100, cf: 118, rf: 100, fenceH: 3.2, turf: false, sea: true, dome: false };
    case "DOME": return { lf: 99, cf: 122, rf: 99, fenceH: 4, turf: true, sea: false, dome: true };
  }
}

const DEG = Math.PI / 180;
/** Spec/cinematic coordinates (3B on −x) → render space (3B on +x). */
export const specToWorld = (p: readonly [number, number, number]): [number, number, number] => [-p[0], p[1], p[2]];
/** Fence distance at angle θ (radians, 0 = centre, ±45° = foul poles). */
export function fenceDistance(d: ParkDims, theta: number): number {
  const u = Math.min(1, Math.abs(theta) / (45 * DEG));
  const corner = theta < 0 ? d.rf : d.lf;
  return corner + (d.cf - corner) * (1 - Math.pow(u, 1.7));
}
export const polar = (theta: number, r: number): [number, number] => [Math.sin(theta) * r, Math.cos(theta) * r];

/** Closed wall path around the field (x,z), counter-clockwise seen from above. */
export function wallPath(d: ParkDims): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 36; i++) {
    const th = (-45 + (90 * i) / 36) * DEG;
    pts.push(polar(th, fenceDistance(d, th) + 0.5));
  }
  // RF foul side: parallel to the RF line, 15 m out.
  const off = 15;
  const rfPole = polar(45 * DEG, d.rf);
  pts.push([rfPole[0] + off * 0.7071, rfPole[1] - off * 0.7071 + 4]);
  pts.push([off * 0.7071 + 10, -off * 0.7071 + 10]);
  // Behind home plate.
  for (let i = 0; i <= 10; i++) {
    const a = (135 + (90 * i) / 10) * DEG;
    pts.push(polar(a, 19));
  }
  pts.push([-(off * 0.7071 + 10), -off * 0.7071 + 10]);
  const lfPole = polar(-45 * DEG, d.lf);
  pts.push([lfPole[0] - off * 0.7071, lfPole[1] - off * 0.7071 + 4]);
  return pts;
}

/**
 * Slot spots for the prep board (§15.1). Infielders stand at their §16.5
 * spots; outfielders are pulled in so chess-piece-sized figures stay legible
 * on a phone. Render space: 3B / LF on +x.
 */
export const BOARD_SPOTS: Record<string, [number, number, number]> = {
  C: [0, 0, -2], "1B": [-19, 0, 24], "2B": [-11, 0, 37], SS: [11, 0, 37], "3B": [19, 0, 24],
  LF: [26, 0, 46], CF: [0, 0, 52], RF: [-26, 0, 46], DH: [-12, 0, -5], P1: [0, 0.25, 18.4],
  // Bullpen mounds in LF foul territory.
  P2: [24, 0, 6], P3: [30, 0, 11],
};

export const DUGOUT_SPACING = 4.6;

/** Dugouts along the foul lines: home = 3B side, away = 1B side. Seat spots face the field. */
export function dugoutSeats(side: "home" | "away", n = 6, spacing = DUGOUT_SPACING, first = 5): { pos: [number, number, number]; yaw: number }[] {
  const sx = side === "home" ? 1 : -1;
  const out: { pos: [number, number, number]; yaw: number }[] = [];
  for (let i = 0; i < n; i++) {
    const along = first + i * spacing;
    out.push({ pos: [sx * 0.7071 * (along + 11), -0.9, 0.7071 * (along - 11)], yaw: -sx * Math.PI / 4 });
  }
  return out;
}
/** Dugout box around the seats (scale = figure scale on the bench). */
export function dugoutFrame(side: "home" | "away", n = 6, spacing = DUGOUT_SPACING, first = 5, scale = 1): { center: [number, number]; yaw: number; length: number } {
  const sx = side === "home" ? 1 : -1;
  const along = first + ((n - 1) * spacing) / 2;
  const back = 11 + 0.9 * scale;
  return { center: [sx * 0.7071 * (along + back), 0.7071 * (along - back)], yaw: -sx * Math.PI / 4, length: (n - 1) * spacing + 2.4 * scale };
}
/** KBO cheer stage (응원단상) on the 1B side. */
export const CHEER_STAGE: { pos: [number, number, number]; yaw: number } = { pos: [-24, 2.6, 4], yaw: Math.atan2(24, -4) };

/** Draw the playing surface into a canvas: x ∈ [−X, X], z ∈ [Z0, Z1]. */
export const FIELD_EXTENT = { X: 100, Z0: -30, Z1: 140 };

export function drawField(g: CanvasRenderingContext2D, w: number, h: number, d: ParkDims): void {
  const { X, Z0, Z1 } = FIELD_EXTENT;
  const sx = w / (2 * X), sz = h / (Z1 - Z0);
  // Plane rotated −90° about x with flipY: canvas left = world −x, canvas top = world z0.
  const P = (x: number, z: number): [number, number] => [(x + X) * sx, (z - Z0) * sz];
  const grassA = d.turf ? "#1f8f47" : "#23833f";
  const grassB = d.turf ? "#1a7c3d" : "#1d7236";
  const dirt = "#b8733f";
  // Foul-territory base.
  g.fillStyle = d.turf ? "#1b7a3c" : "#1a6b33";
  g.fillRect(0, 0, w, h);
  // Fair territory with mowing stripes (KBO-style broad bands + checker).
  g.save();
  g.beginPath();
  g.moveTo(...P(0, 0));
  for (let i = 0; i <= 60; i++) { const th = (-45 + (90 * i) / 60) * DEG; const [x, z] = polar(th, fenceDistance(d, th)); g.lineTo(...P(x, z)); }
  g.closePath();
  g.clip();
  for (let k = -12; k < 14; k++) {
    g.fillStyle = k % 2 === 0 ? grassA : grassB;
    g.beginPath();
    const a = 8 * k, b = a + 8;
    g.moveTo(...P(a, -10)); g.lineTo(...P(a - 140, 130)); g.lineTo(...P(b - 140, 130)); g.lineTo(...P(b, -10));
    g.closePath(); g.fill();
  }
  g.globalAlpha = 0.18;
  for (let k = -12; k < 14; k++) {
    if (k % 2) continue;
    g.fillStyle = "#0e3d1e";
    g.beginPath();
    const a = 8 * k, b = a + 8;
    g.moveTo(...P(-a, -10)); g.lineTo(...P(-a + 140, 130)); g.lineTo(...P(-b + 140, 130)); g.lineTo(...P(-b, -10));
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
  // Warning track.
  g.strokeStyle = "#9c6436";
  g.lineWidth = 4.5 * sx;
  g.beginPath();
  for (let i = 0; i <= 60; i++) { const th = (-45 + (90 * i) / 60) * DEG; const [x, z] = polar(th, fenceDistance(d, th) - 2); if (i) g.lineTo(...P(x, z)); else g.moveTo(...P(x, z)); }
  g.stroke();
  g.restore();
  // Infield dirt arc (radius 29 m from the rubber) and grass square.
  g.fillStyle = dirt;
  g.beginPath();
  g.moveTo(...P(0, 0));
  // Arc of radius 29 m around the rubber, meeting the foul lines at (±27.5, 27.5).
  const arcEnd = 71.7 * DEG;
  for (let i = 0; i <= 48; i++) { const th = -arcEnd + (2 * arcEnd * i) / 48; g.lineTo(...P(Math.sin(th) * 29, 18.4 + Math.cos(th) * 29)); }
  g.closePath(); g.fill();
  g.fillStyle = grassA;
  g.beginPath();
  g.moveTo(...P(0, 3.2)); g.lineTo(...P(17.2, 19.4)); g.lineTo(...P(0, 35.6)); g.lineTo(...P(-17.2, 19.4)); g.closePath(); g.fill();
  // Base cut-outs, mound, home circle.
  const disc = (x: number, z: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); const [cx, cz] = P(x, z); g.ellipse(cx, cz, r * sx, r * sz, 0, 0, Math.PI * 2); g.fill(); };
  disc(0, 0, 4.2, dirt); disc(19.4, 19.4, 2.4, dirt); disc(0, 38.8, 2.4, dirt); disc(-19.4, 19.4, 2.4, dirt); disc(0, 18.4, 2.8, "#c07d47");
  // Base paths.
  g.strokeStyle = dirt; g.lineWidth = 1.6 * sx;
  g.beginPath(); g.moveTo(...P(0, 0)); g.lineTo(...P(19.4, 19.4)); g.lineTo(...P(0, 38.8)); g.lineTo(...P(-19.4, 19.4)); g.closePath(); g.stroke();
  // Chalk: foul lines, batter's boxes, catcher's box, coaches' boxes, on-deck circles.
  g.strokeStyle = "#f4f4f0"; g.lineWidth = Math.max(1.2, 0.12 * sx);
  g.beginPath(); g.moveTo(...P(0, 0)); g.lineTo(...P(...polar(45 * DEG, d.rf))); g.moveTo(...P(0, 0)); g.lineTo(...P(...polar(-45 * DEG, d.lf))); g.stroke();
  const rect = (x0: number, z0: number, x1: number, z1: number) => { const [a, b] = P(x0, z1); const [c2, e] = P(x1, z0); g.strokeRect(a, b, c2 - a, e - b); };
  rect(-2.1, -0.9, -0.5, 0.9); rect(0.5, -0.9, 2.1, 0.9); rect(-0.55, -3.2, 0.55, -1.0);
  g.fillStyle = "rgba(244,244,240,0.35)";
  for (const [x, z] of [[-11, -4], [11, -4]] as const) { const [cx, cz] = P(x, z); g.beginPath(); g.ellipse(cx, cz, 0.8 * sx, 0.8 * sz, 0, 0, Math.PI * 2); g.fill(); }
  // Bullpen mounds.
  disc(24, 6, 2.6, "#b8733f"); disc(30, 11, 2.6, "#b8733f");
}
