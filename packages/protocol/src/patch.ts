/** Minimal RFC 6902 JSON Patch: diff (add/replace/remove) and apply, for plain JSON values. */
export interface PatchOp {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
}

const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
const unesc = (k: string) => k.replace(/~1/g, "/").replace(/~0/g, "~");
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function diff(a: unknown, b: unknown, path = "", out: PatchOp[] = []): PatchOp[] {
  if (a === b) return out;
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) if (!(k in b)) out.push({ op: "remove", path: `${path}/${esc(k)}` });
    for (const k of Object.keys(b)) {
      if (!(k in a)) out.push({ op: "add", path: `${path}/${esc(k)}`, value: b[k] });
      else diff(a[k], b[k], `${path}/${esc(k)}`, out);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    // Arrays: element-wise when same length, otherwise replace whole array (simple and correct).
    if (a.length === b.length) {
      for (let i = 0; i < a.length; i++) diff(a[i], b[i], `${path}/${i}`, out);
      return out;
    }
    out.push({ op: "replace", path: path || "", value: b });
    return out;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  out.push({ op: "replace", path: path || "", value: b });
  return out;
}

export function applyPatch<T>(doc: T, ops: PatchOp[]): T {
  let root: unknown = structuredClone(doc);
  for (const op of ops) {
    if (op.path === "") {
      root = structuredClone(op.value);
      continue;
    }
    const parts = op.path.split("/").slice(1).map(unesc);
    let cur: unknown = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      cur = Array.isArray(cur) ? cur[Number(p)] : (cur as Record<string, unknown>)[p];
    }
    const last = parts[parts.length - 1]!;
    if (Array.isArray(cur)) {
      const idx = Number(last);
      if (op.op === "remove") cur.splice(idx, 1);
      else cur[idx] = structuredClone(op.value);
    } else {
      const o = cur as Record<string, unknown>;
      if (op.op === "remove") delete o[last];
      else o[last] = structuredClone(op.value);
    }
  }
  return root as T;
}
