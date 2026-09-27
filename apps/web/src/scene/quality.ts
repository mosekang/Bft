/**
 * Quality tiers (DESIGN §15.6). high: shadows + 3D crowd; mid (default):
 * no shadows, billboard crowd, half particles; low: the 2D board/playback.
 */
export type Quality = "high" | "mid" | "low";
export type QualitySetting = Quality | "auto";

export function webgl2Available(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const cv = document.createElement("canvas");
    return !!cv.getContext("webgl2");
  } catch {
    return false;
  }
}

/** Initial tier before FPS sampling. Automation (webdriver) starts on low unless `?q=` forces a tier. */
export function initialQuality(setting: QualitySetting): Quality {
  if (typeof window !== "undefined") {
    const forced = new URLSearchParams(window.location.search).get("q");
    if (forced === "high" || forced === "mid" || forced === "low") return forced;
  }
  if (setting !== "auto") return setting;
  if (!webgl2Available()) return "low";
  if (typeof navigator !== "undefined" && navigator.webdriver) return "low";
  return "mid";
}

/** True when the URL pins a tier (`?q=high|mid|low`); auto-tuning is then off. */
export function qualityForced(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("q");
  return q === "high" || q === "mid" || q === "low";
}

/**
 * Tier from the average FPS of the first seconds (auto mode only). Never
 * drops to the 2D fallback: a phone that stutters while shaders compile
 * still gets the 3D game, just without the high-tier extras.
 */
export function tierFromFps(avg: number, current: Quality): Quality {
  if (current === "low") return "low";
  return avg >= 55 ? "high" : "mid";
}

export const PARTICLE_SCALE: Record<Quality, number> = { high: 1, mid: 0.5, low: 0.25 };
export const TARGET_FPS: Record<Quality, number> = { high: 60, mid: 60, low: 30 };

/** Tier chosen on the run screen, reused by the playback stage. */
let current: Quality | null = null;
export const setCurrentQuality = (q: Quality): void => { current = q; };
export const currentQuality = (): Quality | null => current;
