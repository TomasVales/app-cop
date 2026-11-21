// Muestra cómo se separa cada renglón en texto / fórmula (y si alguna fórmula no se pudo convertir).
// Uso: npm run tex-check -- 5 "ln(x-1) - 2"
import { solve } from "../src/solver/index.ts";
import { segments, toTex } from "../src/render/displayTex.ts";
const [ex, ...rest] = process.argv.slice(2);
const r = solve(Number(ex) as 5 | 6, rest.join(" "));
if (!r.ok) throw new Error(r.error);
for (const l of [{ kind: "fx", text: `f(x) = ${r.fx}` }, ...r.lines]) {
  if (!l.text || l.kind === "casio" || l.kind === "h" || l.kind === "sub") continue;
  const segs = segments(l.text);
  console.log(segs.map((s) => (s.math ? `⟦${toTex(s.s)}⟧` : s.s)).join(""));
}
