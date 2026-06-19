import type { Assembly } from "../types";

/**
 * Is this assembly a purlin / cold-formed member? Naming varies by detailer:
 *  - Madar:   "1-PU1 - PURLIN"        (name "PURLIN", PU-prefixed mark)
 *  - ELNAGAR: "P1 - COLD FORMED"      (name "COLD FORMED", P-prefixed mark)
 * Match the name first (most reliable across projects), then a PU/P# mark.
 */
export function isPurlinAssembly(a: Pick<Assembly, "name" | "mark">): boolean {
  const name = (a.name || "").toLowerCase();
  if (name.includes("purlin") || name.includes("cold form") || name.includes("girt")) {
    return true;
  }
  return /(^|[-_ ])pu\d/i.test(a.mark);
}
