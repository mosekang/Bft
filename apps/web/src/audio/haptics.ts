/**
 * Vibration feedback (§17.4) via navigator.vibrate. Silent no-op where the
 * Vibration API is missing (iOS Safari, desktop, jsdom) or when disabled.
 */
import { HAPTICS, type HapticId } from "@dugout/protocol";

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/** True when the browser exposes navigator.vibrate. */
export function canVibrate(): boolean {
  const nav = globalThis.navigator as (Navigator & { vibrate?: unknown }) | undefined;
  return !!nav && typeof nav.vibrate === "function";
}

/** Fires the named vibration pattern. Never throws. */
export function haptic(id: HapticId): void {
  if (!enabled || !canVibrate()) return;
  try {
    globalThis.navigator.vibrate([...HAPTICS[id]]);
  } catch {
    /* some browsers throw without a prior user gesture */
  }
}
