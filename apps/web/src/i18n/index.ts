import ko from "./ko.json";

type Dict = Record<string, string>;
const dict: Dict = ko;

/** Translate a key; unknown keys return the key itself so missing strings are visible. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dict[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const hasKey = (key: string): boolean => key in dict;
