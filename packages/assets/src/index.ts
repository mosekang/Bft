/**
 * Asset manifest validator (DESIGN §15.5). Every asset is procedural; the
 * manifest records where each one is generated and under which licence, and
 * this validator keeps it in sync with the shared clip and sound catalogues.
 */
import { CLIPS, CLIP_FALLBACKS, SFX, SFX_LOOPS } from "@dugout/protocol";
import manifest from "../sources.json" with { type: "json" };

export interface Manifest {
  formatVersion: number;
  policy: string;
  models: { id: string; kind: string; source: string; license: string }[];
  clips: { id: string; source: string; loop: boolean; license: string }[];
  sounds: { id: string; source: string; loop: boolean; license: string }[];
  music: { id: string; source: string; license: string }[];
  fonts: { id: string; license: string; source: string }[];
  budgets: Record<string, number>;
}

export const MANIFEST = manifest as Manifest;
const ALLOWED_LICENSES = new Set(["project", "CC0-1.0", "OFL-1.1", "MIT"]);

export function validateManifest(m: Manifest = MANIFEST): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const clipIds = new Set(m.clips.map((c) => c.id));
  for (const c of CLIPS) if (!clipIds.has(c)) (CLIP_FALLBACKS[c] ? warnings : errors).push(`clip missing: ${c}${CLIP_FALLBACKS[c] ? ` (falls back to ${CLIP_FALLBACKS[c]})` : ""}`);
  for (const c of m.clips) if (!(CLIPS as readonly string[]).includes(c.id)) errors.push(`unknown clip: ${c.id}`);
  const sfxIds = new Set(m.sounds.map((s) => s.id));
  for (const s of SFX) if (!sfxIds.has(s)) errors.push(`sound missing: ${s}`);
  for (const s of m.sounds) {
    if (!(SFX as readonly string[]).includes(s.id)) errors.push(`unknown sound: ${s.id}`);
    if (s.loop !== SFX_LOOPS.includes(s.id as never)) errors.push(`loop flag mismatch: ${s.id}`);
  }
  for (const a of [...m.models, ...m.clips, ...m.sounds, ...m.music, ...m.fonts]) {
    if (!ALLOWED_LICENSES.has(a.license)) errors.push(`licence not allowed for ${a.id}: ${a.license}`);
    if (!a.source) errors.push(`no source for ${a.id}`);
  }
  if ((m.budgets["draw_calls_per_30_figures"] ?? 999) > 60) errors.push("draw-call budget above §3 limit (60)");
  if ((m.budgets["bundle_gzip_kb"] ?? 999) > 600) errors.push("bundle budget above §14.2 limit (600 KB)");
  return { errors, warnings };
}
