export function mm(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} mm`;
}

export function kg(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}

export function num(v: number | null | undefined, digits = 0): string {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function basename(p: string | null | undefined): string {
  if (!p) return "";
  return p.split(/[\\/]/).pop() || p;
}
