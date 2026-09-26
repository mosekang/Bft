import type { CardDef } from "@dugout/protocol";
import { hashSeed } from "@dugout/engine";
import { teamColor } from "./pack.js";

/** Deterministic look for a card: skin, hair, face, build. Everything derives from the card id. */
export interface AvatarTraits {
  skin: string;
  hair: string;
  hairStyle: 0 | 1 | 2 | 3 | 4;
  eyes: 0 | 1 | 2;
  mouth: 0 | 1 | 2;
  brow: 0 | 1;
  beard: boolean;
  build: number; // 0.85..1.2 body width
  cap: string;
  jersey: string;
  number: number;
}

const SKINS = ["#f6d5b8", "#e8b894", "#d9a066", "#b5773f", "#8d5524", "#f2c9a8"];
const HAIRS = ["#1b1b1b", "#2b1a0e", "#4b2e13", "#6b4423", "#c9a227", "#3a3a3a"];

export function avatarTraits(def: CardDef): AvatarTraits {
  const [a, b, c, d] = hashSeed(def.id);
  const pick = <T,>(arr: readonly T[], n: number) => arr[n % arr.length]!;
  const foreign = def.origin === "FOREIGN";
  const skinIdx = foreign ? (a % 6) : (a % 3);
  return {
    skin: pick(SKINS, skinIdx),
    hair: pick(HAIRS, foreign ? b % 6 : b % 4),
    hairStyle: ((b >> 3) % 5) as AvatarTraits["hairStyle"],
    eyes: ((c >> 2) % 3) as AvatarTraits["eyes"],
    mouth: ((c >> 5) % 3) as AvatarTraits["mouth"],
    brow: ((d >> 1) % 2) as AvatarTraits["brow"],
    beard: def.origin === "VETERAN" ? d % 2 === 0 : d % 7 === 0,
    build: def.role === "H" && def.classes.includes("SLUGGER") ? 1.18 : def.classes.includes("SPEEDSTER") ? 0.9 : 1 + ((d >> 4) % 5) * 0.04,
    cap: teamColor(def.team),
    jersey: teamColor(def.team),
    number: (parseInt(def.id.replace(/\D/g, "").slice(-2) || "7", 10) % 99) + 1,
  };
}

/** Portrait (head and shoulders) as SVG. `size` in px. */
export function Avatar({ def, size = 48, className = "" }: { def: CardDef; size?: number; className?: string }) {
  const tr = avatarTraits(def);
  const w = 32 * tr.build;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      {/* shoulders / jersey */}
      <path d={`M${32 - w} 64 C${32 - w} 48 ${32 - w * 0.6} 44 32 44 C${32 + w * 0.6} 44 ${32 + w} 48 ${32 + w} 64 Z`} fill={tr.jersey} />
      <path d="M26 44 L32 52 L38 44" fill="#fff" opacity="0.9" />
      {/* neck */}
      <rect x="28" y="36" width="8" height="10" fill={tr.skin} />
      {/* head */}
      <ellipse cx="32" cy="27" rx="12" ry="14" fill={tr.skin} />
      {/* ears */}
      <circle cx="20" cy="28" r="2.5" fill={tr.skin} /><circle cx="44" cy="28" r="2.5" fill={tr.skin} />
      {/* hair */}
      {tr.hairStyle === 0 && <path d="M20 26 C20 12 44 12 44 26 L44 22 C40 16 24 16 20 22 Z" fill={tr.hair} />}
      {tr.hairStyle === 1 && <path d="M19 30 C18 12 46 12 45 30 L42 22 C36 18 28 18 22 22 Z" fill={tr.hair} />}
      {tr.hairStyle === 2 && <path d="M20 24 C22 10 42 10 44 24 C40 20 36 22 32 18 C28 22 24 20 20 24 Z" fill={tr.hair} />}
      {tr.hairStyle === 3 && <path d="M20 28 C19 10 45 10 44 28 L44 20 L36 16 L30 22 L24 18 L20 24 Z" fill={tr.hair} />}
      {tr.hairStyle === 4 && <ellipse cx="32" cy="17" rx="12" ry="6" fill={tr.hair} />}
      {/* cap */}
      <path d="M18 22 C18 8 46 8 46 22 Z" fill={tr.cap} />
      <path d="M14 22 L50 22 L50 25 L14 25 Z" fill={tr.cap} opacity="0.9" />
      <path d="M46 22 L56 24 L46 26 Z" fill={tr.cap} />
      <text x="32" y="19" textAnchor="middle" fontSize="7" fontFamily="Bebas Neue, sans-serif" fill="#fff" opacity="0.85">{def.role === "H" ? def.pos : def.role}</text>
      {/* brows */}
      <path d={tr.brow === 0 ? "M25 25 L29 24" : "M25 24 L29 25"} stroke="#3b2a1a" strokeWidth="1.5" strokeLinecap="round" />
      <path d={tr.brow === 0 ? "M35 24 L39 25" : "M35 25 L39 24"} stroke="#3b2a1a" strokeWidth="1.5" strokeLinecap="round" />
      {/* eyes */}
      {tr.eyes === 0 && <><circle cx="27" cy="28" r="1.6" fill="#1f1f1f" /><circle cx="37" cy="28" r="1.6" fill="#1f1f1f" /></>}
      {tr.eyes === 1 && <><path d="M25 28 Q27 26 29 28" stroke="#1f1f1f" strokeWidth="1.5" fill="none" /><path d="M35 28 Q37 26 39 28" stroke="#1f1f1f" strokeWidth="1.5" fill="none" /></>}
      {tr.eyes === 2 && <><rect x="25.5" y="27" width="3" height="2" fill="#1f1f1f" /><rect x="35.5" y="27" width="3" height="2" fill="#1f1f1f" /></>}
      {/* mouth */}
      {tr.mouth === 0 && <path d="M29 35 Q32 37 35 35" stroke="#7a3b2e" strokeWidth="1.4" fill="none" strokeLinecap="round" />}
      {tr.mouth === 1 && <path d="M29 35 L35 35" stroke="#7a3b2e" strokeWidth="1.4" strokeLinecap="round" />}
      {tr.mouth === 2 && <path d="M29 36 Q32 33 35 36" stroke="#7a3b2e" strokeWidth="1.4" fill="none" strokeLinecap="round" />}
      {tr.beard && <path d="M22 32 C24 42 40 42 42 32 C40 38 24 38 22 32 Z" fill={tr.hair} opacity="0.8" />}
    </svg>
  );
}
