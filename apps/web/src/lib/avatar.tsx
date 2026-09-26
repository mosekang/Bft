/**
 * Card portrait (DESIGN §15.3, §18.2): a KBO trading-card style head-and-
 * shoulders SVG. Drawn in code from `appearanceOf`, so no photo or third-
 * party art is involved and the face matches the 3D figure.
 */
import { useId } from "react";
import type { CardDef } from "@dugout/protocol";
import { appearanceOf, replacementAppearance, type Appearance } from "./appearance.js";

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
};

function Hair({ ap, helmet }: { ap: Appearance; helmet: boolean }) {
  const c = ap.hair;
  if (ap.hairStyle === 6) return null;
  // Under a helmet/cap only sideburns and the back show.
  const sides = <><path d="M19.5 27 Q19 33 21 36 L22.5 36 Q21.5 31 22 27 Z" fill={c} /><path d="M44.5 27 Q45 33 43 36 L41.5 36 Q42.5 31 42 27 Z" fill={c} /></>;
  switch (ap.hairStyle) {
    case 0: return <>{sides}</>;
    case 4: return <>{sides}<path d="M19 30 Q17 42 22 46 L24 40 Z M45 30 Q47 42 42 46 L40 40 Z" fill={c} /></>;
    case 5: return <>{sides}<circle cx="20" cy="29" r="2.6" fill={c} /><circle cx="44" cy="29" r="2.6" fill={c} /><circle cx="20.5" cy="33" r="2.2" fill={c} /><circle cx="43.5" cy="33" r="2.2" fill={c} /></>;
    case 7: return helmet ? <>{sides}</> : <>{sides}<path d="M29 10 L35 10 L34 16 L30 16 Z" fill={c} /></>;
    default: return <>{sides}</>;
  }
}

function Beard({ ap }: { ap: Appearance }) {
  const c = ap.hair;
  if (ap.beard === 1) return <path d="M22 34 Q24 44 32 45 Q40 44 42 34 Q40 40 32 41 Q24 40 22 34 Z" fill={c} opacity="0.35" />;
  if (ap.beard === 2) return <path d="M28.5 39.5 Q32 46 35.5 39.5 Q32 41.5 28.5 39.5 Z M28 37 Q32 35.6 36 37 L36 37.8 Q32 36.8 28 37.8 Z" fill={c} opacity="0.9" />;
  if (ap.beard === 3) return <path d="M21 31 Q22 46 32 47 Q42 46 43 31 Q41 39 36.5 39 Q32 37 27.5 39 Q23 39 21 31 Z" fill={c} opacity="0.92" />;
  return null;
}

function Eyes({ ap }: { ap: Appearance }) {
  const ink = "#1b1410";
  if (ap.eyes === 1) return <><path d="M24.6 30 Q26.8 28.4 29 30" stroke={ink} strokeWidth="1.4" fill="none" strokeLinecap="round" /><path d="M35 30 Q37.2 28.4 39.4 30" stroke={ink} strokeWidth="1.4" fill="none" strokeLinecap="round" /></>;
  if (ap.eyes === 2) return <><ellipse cx="26.8" cy="30" rx="1.9" ry="1.2" fill={ink} /><ellipse cx="37.2" cy="30" rx="1.9" ry="1.2" fill={ink} /><circle cx="27.3" cy="29.6" r="0.4" fill="#fff" /><circle cx="37.7" cy="29.6" r="0.4" fill="#fff" /></>;
  return <><circle cx="26.8" cy="30" r="1.5" fill={ink} /><circle cx="37.2" cy="30" r="1.5" fill={ink} /><circle cx="27.3" cy="29.5" r="0.45" fill="#fff" /><circle cx="37.7" cy="29.5" r="0.45" fill="#fff" /></>;
}

function Brows({ ap }: { ap: Appearance }) {
  const c = ap.hairStyle === 6 ? "#3b2a1a" : ap.hair;
  const d = ap.brow === 0 ? ["M24 26.6 L29.5 26", "M34.5 26 L40 26.6"] : ap.brow === 1 ? ["M24 25.6 L29.5 27", "M34.5 27 L40 25.6"] : ["M24 26.8 Q26.8 25 29.5 26.6", "M34.5 26.6 Q37.2 25 40 26.8"];
  return <><path d={d[0]} stroke={c} strokeWidth="1.7" strokeLinecap="round" fill="none" /><path d={d[1]} stroke={c} strokeWidth="1.7" strokeLinecap="round" fill="none" /></>;
}

function Mouth({ ap }: { ap: Appearance }) {
  const c = "#7a3b2e";
  if (ap.mouth === 0) return <path d="M28.5 38 Q32 40.4 35.5 38" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round" />;
  if (ap.mouth === 1) return <path d="M29 38.4 L35 38.4" stroke={c} strokeWidth="1.4" strokeLinecap="round" />;
  return <path d="M28.6 37.8 Q32 41.5 35.4 37.8 Q32 39 28.6 37.8 Z" fill="#5a2320" stroke={c} strokeWidth="0.6" />;
}

export function Portrait({ ap, headgear, label, size = 48, className = "" }: { ap: Appearance; headgear: "helmet" | "cap"; label?: string; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const jaw = ap.build === 2 ? 13.6 : ap.build === 0 ? 11.2 : 12.4;
  const shoulder = ap.build === 2 ? 31 : ap.build === 0 ? 25 : 28;
  const skinDark = shade(ap.skin, 0.82);
  const hat = ap.primary;
  const hatDark = shade(ap.primary, 0.62);
  const helmet = headgear === "helmet";
  const eyeBlack = !ap.replacement && helmet && ap.number % 3 === 0;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id={`bg${id}`} cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor={shade(ap.primary, 1.15)} />
          <stop offset="1" stopColor={shade(ap.primary, 0.32)} />
        </radialGradient>
        <linearGradient id={`hel${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(hat, 1.35)} />
          <stop offset="0.55" stopColor={hat} />
          <stop offset="1" stopColor={hatDark} />
        </linearGradient>
        <linearGradient id={`face${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={skinDark} />
          <stop offset="0.35" stopColor={ap.skin} />
          <stop offset="1" stopColor={skinDark} />
        </linearGradient>
        <clipPath id={`clip${id}`}><rect width="64" height="64" rx="6" /></clipPath>
        {ap.uniform === "pinstripe" && (
          <pattern id={`pin${id}`} width="3" height="6" patternUnits="userSpaceOnUse"><rect width="3" height="6" fill="#f4f4f2" /><rect x="1.2" width="0.55" height="6" fill={ap.primary} /></pattern>
        )}
      </defs>
      <g clipPath={`url(#clip${id})`}>
        <rect width="64" height="64" fill={`url(#bg${id})`} />
        {/* stadium light bokeh */}
        <circle cx="10" cy="9" r="5" fill="#fff" opacity="0.10" /><circle cx="54" cy="13" r="3.5" fill="#fff" opacity="0.12" /><circle cx="47" cy="5" r="2" fill="#fff" opacity="0.18" />
        {/* jersey */}
        <path d={`M${32 - shoulder} 66 C${32 - shoulder} 52 ${32 - shoulder * 0.55} 47 32 47 C${32 + shoulder * 0.55} 47 ${32 + shoulder} 52 ${32 + shoulder} 66 Z`}
          fill={ap.replacement ? "#8b9096" : ap.uniform === "pinstripe" ? `url(#pin${id})` : "#f4f4f2"} />
        {!ap.replacement && ap.uniform !== "pinstripe" && <path d={`M${32 - shoulder} 66 C${32 - shoulder} 52 ${32 - shoulder * 0.55} 47 32 47 C${32 + shoulder * 0.55} 47 ${32 + shoulder} 52 ${32 + shoulder} 66 Z`} fill={ap.uniform === "plain" ? ap.primary : "#f4f4f2"} opacity={ap.uniform === "plain" ? 1 : 0} />}
        {ap.uniform === "sleeve" && <><path d={`M${32 - shoulder} 66 C${32 - shoulder} 54 ${32 - shoulder * 0.7} 49 ${32 - shoulder * 0.45} 48 L${32 - shoulder * 0.62} 66 Z`} fill={ap.primary} /><path d={`M${32 + shoulder} 66 C${32 + shoulder} 54 ${32 + shoulder * 0.7} 49 ${32 + shoulder * 0.45} 48 L${32 + shoulder * 0.62} 66 Z`} fill={ap.primary} /></>}
        {ap.uniform === "sash" && <path d="M14 66 L50 47 L56 50 L22 66 Z" fill={ap.primary} opacity="0.95" />}
        {/* collar piping + sleeve band (cost colour) */}
        <path d="M25.5 47.6 L32 55 L38.5 47.6" fill="none" stroke={ap.replacement ? "#6b7280" : ap.secondary} strokeWidth="2.2" />
        {!ap.replacement && <path d={`M${32 - shoulder + 1} 60 L${32 - shoulder + 7} 57`} stroke={ap.sleeve} strokeWidth="2.4" strokeLinecap="round" />}
        {/* chest wordmark + number */}
        {!ap.replacement && <text x="45" y="61" textAnchor="middle" fontSize="6.5" fontFamily="Bebas Neue, Black Han Sans, sans-serif" fill={ap.uniform === "plain" ? ap.secondary : ap.primary} stroke={ap.uniform === "plain" ? ap.primary : ap.secondary} strokeWidth="0.35">{ap.short}</text>}
        <text x="20" y="62.5" textAnchor="middle" fontSize="7" fontFamily="Bebas Neue, sans-serif" fill={ap.replacement ? "#d1d5db" : ap.uniform === "plain" ? ap.secondary : ap.primary}>{ap.replacement ? "00" : ap.number}</text>
        {/* neck + head */}
        <path d="M27 40 L27 49 Q32 52 37 49 L37 40 Z" fill={skinDark} />
        <ellipse cx="19.4" cy="31" rx="2.3" ry="3.2" fill={skinDark} /><ellipse cx="44.6" cy="31" rx="2.3" ry="3.2" fill={skinDark} />
        <path d={`M${32 - jaw} 27 Q${32 - jaw} 44 32 45 Q${32 + jaw} 44 ${32 + jaw} 27 Q${32 + jaw} 14 32 14 Q${32 - jaw} 14 ${32 - jaw} 27 Z`} fill={ap.replacement ? "#9aa0a6" : `url(#face${id})`} />
        {!ap.replacement && <>
          <Hair ap={ap} helmet={helmet} />
          <Brows ap={ap} />
          <Eyes ap={ap} />
          {eyeBlack && <><rect x="24.5" y="32.4" width="4.6" height="1.4" rx="0.6" fill="#111" opacity="0.85" /><rect x="34.9" y="32.4" width="4.6" height="1.4" rx="0.6" fill="#111" opacity="0.85" /></>}
          <path d="M32 30.5 L30.6 35.6 Q32 36.4 33.4 35.6" fill="none" stroke={skinDark} strokeWidth="1" strokeLinecap="round" />
          <Beard ap={ap} />
          <Mouth ap={ap} />
        </>}
        {ap.replacement && <text x="32" y="36" textAnchor="middle" fontSize="12" fontFamily="Bebas Neue, sans-serif" fill="#e5e7eb" opacity="0.8">?</text>}
        {/* headgear */}
        {helmet ? (
          <>
            <path d="M18 27 Q17 11 32 10 Q47 11 46 27 L46 29 Q32 25 18 29 Z" fill={ap.replacement ? "#6b7280" : `url(#hel${id})`} />
            <path d="M43 22 Q49 25 48 33 Q45 35 42.5 33 Z" fill={ap.replacement ? "#6b7280" : hatDark} />
            <path d="M17 27 Q32 23.5 47 27 L47.5 29.5 Q32 26.5 16.5 29.5 Z" fill={ap.replacement ? "#4b5563" : hatDark} />
            <ellipse cx="26" cy="15" rx="6" ry="2.2" fill="#fff" opacity="0.28" />
          </>
        ) : (
          <>
            <path d="M18.5 25 Q18 11 32 10.5 Q46 11 45.5 25 Z" fill={ap.replacement ? "#6b7280" : `url(#hel${id})`} />
            <path d="M16 25 Q32 21.5 48 25 Q48 28 44 28 Q32 25.5 20 28 Q16 28 16 25 Z" fill={ap.replacement ? "#4b5563" : hatDark} />
            <circle cx="32" cy="11" r="1.1" fill={hatDark} />
          </>
        )}
        {!ap.replacement && ap.short && <text x="32" y={helmet ? 21.5 : 21} textAnchor="middle" fontSize="6.2" fontFamily="Bebas Neue, sans-serif" fill={ap.secondary} stroke={hatDark} strokeWidth="0.3">{ap.short.slice(0, 1)}</text>}
        {label && <text x="60" y="8.5" textAnchor="end" fontSize="6.5" fontFamily="Bebas Neue, sans-serif" fill="#fff" opacity="0.9">{label}</text>}
      </g>
    </svg>
  );
}

/** Portrait for a card definition (hitters wear the batting helmet, pitchers the cap). */
export function Avatar({ def, size = 48, className = "" }: { def: CardDef; size?: number; className?: string }) {
  return <Portrait ap={appearanceOf(def)} headgear={def.role === "H" ? "helmet" : "cap"} size={size} className={className} />;
}

/** Grey replacement portrait (김대체). */
export function ReplacementAvatar({ seed, size = 48, className = "" }: { seed: string; size?: number; className?: string }) {
  return <Portrait ap={replacementAppearance(seed)} headgear="cap" size={size} className={className} />;
}
