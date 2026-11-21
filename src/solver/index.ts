import { parseInput, show, SolverError } from "./ast";
import { solveExpLog } from "./explog";
import type { Line } from "./lines";
import { solveTrig } from "./trig";

export type { Line, LineKind, SignTable } from "./lines";
export { SolverError };

export type Result = { ok: true; fx: string; lines: Line[] } | { ok: false; error: string };

/** Cierra los "(" que quedaron abiertos al final. */
export function autoClose(input: string): string {
  let open = 0;
  for (const c of input) {
    if (c === "(") open++;
    else if (c === ")" && open > 0) open--;
  }
  return input + ")".repeat(open);
}

/** Cómo interpreta el motor lo que se escribió (o null si todavía no se entiende). */
export function preview(input: string): string | null {
  try {
    return show(parseInput(autoClose(input)));
  } catch {
    return null;
  }
}

/** Resuelve 100% local y determinístico. */
export function solve(exercise: 5 | 6, input: string): Result {
  try {
    const f = parseInput(input);
    const out = exercise === 6 ? solveTrig(f) : solveExpLog(f);
    return { ok: true, fx: show(f), lines: out.lines };
  } catch (err) {
    if (err instanceof SolverError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "No pude resolver esta función. Revisá cómo está escrita." };
  }
}
