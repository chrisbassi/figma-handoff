export function parseVars(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  const re = /^\s*(--[\w-]+)\s*:\s*(.+?);\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) vars.set(m[1], m[2]);
  return vars;
}

export interface Diff {
  added: Array<[string, string]>;
  removed: Array<[string, string]>;
  changed: Array<{ name: string; from: string; to: string }>;
}

export function compareVars(before: Map<string, string>, after: Map<string, string>): Diff {
  const diff: Diff = { added: [], removed: [], changed: [] };
  for (const [name, value] of after) {
    if (!before.has(name)) diff.added.push([name, value]);
    else if (before.get(name) !== value) diff.changed.push({ name, from: before.get(name)!, to: value });
  }
  for (const [name, value] of before) {
    if (!after.has(name)) diff.removed.push([name, value]);
  }
  return diff;
}

export const isEmpty = (d: Diff) => !d.added.length && !d.removed.length && !d.changed.length;
