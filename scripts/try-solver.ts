// Uso: npm run try -- 6 "sin(x)/(2sin(x)+1)"
//      npm run try -- 5 --latex "1+\\log_{\\frac{1}{2}}\\left(\\frac{5x+8}{4+3x-x^2}\\right)"
import { convertLatexToAsciiMath } from "mathlive";
import { solve } from "../src/solver/index.ts";

const [ex, ...rest] = process.argv.slice(2);
const latex = rest[0] === "--latex";
const input = latex ? convertLatexToAsciiMath(rest.slice(1).join(" ")) : rest.join(" ");
if (latex) console.log("ascii-math:", input);
const r = solve(Number(ex) as 5 | 6, input);
if (!r.ok) {
  console.log("ERROR:", r.error);
  process.exit(1);
}
const tag: Record<string, string> = { h: "## ", sub: "-- ", casio: "[CASIO] ", strike: "~~ ", ok: "OK ", result: ">> ", note: "(!) ", p: "   " };
console.log("f(x) =", r.fx);
for (const l of r.lines) {
  console.log((tag[l.kind] ?? "") + l.text);
  if (l.table) {
    console.log("   | " + ["", ...l.table.head].join(" | "));
    for (const row of l.table.rows) console.log("   | " + [row.label, ...row.cells].join(" | "));
  }
}
