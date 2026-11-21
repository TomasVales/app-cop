// EJERCICIO 6: Trigonometría — Período, Dominio y Ceros en [0 ; T].
import { casio, evaluate, hasX, linear, show, SolverError, walk, type E } from "./ast";
import { join, Out } from "./lines";
import { casioAngle, fmtAngle, fmtNum, near, realRoots, scanRoots } from "./numbers";
import { Poly, Rational, showFactor, showPoly, toRational, Unsupported, type Names } from "./poly";

const PI = Math.PI;
type G = "sin" | "cos" | "tan";

const kStr = (k: number) => (near(k, 1) ? "" : fmtNum(k));
const vname = (g: G, k: number) => `${g}|${k}`;
const parseVar = (v: string) => {
  const [g, k] = v.split("|");
  return { g: g as G, k: Number(k) };
};
const label = (g: G, k: number) => `${g}(${kStr(k)}x)`;

function trigNodes(e: E) {
  const out: Extract<E, { t: "fn" }>[] = [];
  walk(e, (n) => {
    if (n.t === "fn" && (n.f === "sin" || n.f === "cos" || n.f === "tan")) out.push(n);
  });
  return out;
}

function lin(n: Extract<E, { t: "fn" }>) {
  const l = linear(n.a);
  if (!l || near(l.a, 0)) throw new SolverError(`El argumento de ${show(n)} tiene que ser de la forma k·x + c.`);
  return l;
}

/** Ángulos θ = base + n·P dentro de [0 ; U]. */
function inRange(bases: number[], P: number, U: number): number[] {
  const out: number[] = [];
  for (const b0 of bases) {
    const b = ((b0 % P) + P) % P;
    for (let th = b; th <= U + 1e-9; th += P) out.push(th);
  }
  return dedupeAngles(out);
}
function dedupeAngles(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.filter((x, i) => i === 0 || !near(x, s[i - 1], 1e-7));
}

// ---------- Ecuación trigonométrica expr = 0 en [0 ; T] ----------

type Solved = { xs: number[]; numeric: boolean };

function buildAtoms(expr: E, expandDouble: boolean, ids: string[]) {
  const sinPresent = trigNodes(expr).some((n) => n.f === "sin" && near(Math.abs(lin(n).a), 1));
  const atom = (n: E): Rational | null => {
    if (n.t === "x") throw new Unsupported("x fuera de sin/cos/tan");
    if (!hasX(n) || n.t !== "fn" || (n.f !== "sin" && n.f !== "cos" && n.f !== "tan")) return null;
    const { a, b } = lin(n);
    const s = Math.sign(a);
    const k = Math.abs(a);
    const q = b / (PI / 2);
    const nq = Math.round(q);
    if (!near(q, nq, 1e-9)) throw new Unsupported("desfase no múltiplo de π/2");
    const n4 = ((nq % 4) + 4) % 4;
    // f(θ + n·π/2) con θ = s·k·x
    let g: G;
    let sign = 1;
    let inv = false;
    if (n.f === "sin") [g, sign] = ([["sin", 1], ["cos", 1], ["sin", -1], ["cos", -1]] as const)[n4];
    else if (n.f === "cos") [g, sign] = ([["cos", 1], ["sin", -1], ["cos", -1], ["sin", 1]] as const)[n4];
    else {
      g = "tan";
      if (n4 % 2) { sign = -1; inv = true; }
    }
    if (s < 0 && g !== "cos") sign = -sign;

    const changed = !near(b, 0) || s < 0;
    const lab = label(g, k);
    const rhs = `${sign < 0 ? "−" : ""}${inv ? `1/${lab}` : lab}`;
    if (changed) ids.push(`${show(n)} = ${rhs}`);

    let base: Rational;
    if (expandDouble && near(k, 2) && g !== "tan") {
      const S = Rational.of(Poly.v(vname("sin", 1)));
      const C = Rational.of(Poly.v(vname("cos", 1)));
      if (g === "sin") {
        ids.push("sin(2x) = 2sin(x)·cos(x)");
        base = S.mul(C).mul(Rational.of(Poly.const(2)));
      } else if (sinPresent) {
        ids.push("cos(2x) = 1 − 2sin²(x)");
        base = Rational.of(Poly.const(1)).sub(S.mul(S).mul(Rational.of(Poly.const(2))));
      } else {
        ids.push("cos(2x) = 2cos²(x) − 1");
        base = C.mul(C).mul(Rational.of(Poly.const(2))).sub(Rational.of(Poly.const(1)));
      }
    } else base = Rational.of(Poly.v(vname(g, k)));
    if (inv) base = Rational.of(Poly.const(1)).div(base);
    return sign < 0 ? base.neg() : base;
  };
  return atom;
}

type Leaf = Poly; // polinomio en una sola variable

/** Factoriza / reemplaza hasta dejar ecuaciones en UNA sola función. */
function reduce(P: Poly, names: Names, o: Out): Leaf[] | null {
  const vars = P.vars();
  if (vars.length === 0) return [P];
  if (vars.length === 1) {
    const v = vars[0];
    const m = P.commonMono();
    if (P.degree(v) > 2 && m[v]) {
      const rest = P.divMono(m);
      o.p(`${names[v]}·${showFactor(rest, names)} = 0`);
      o.p(`⇒ ${names[v]} = 0  ó  ${showPoly(rest, names)} = 0`);
      return [Poly.v(v), ...(reduce(rest, names, o) ?? [])];
    }
    return [P];
  }
  const m = P.commonMono();
  if (Object.keys(m).length) {
    const rest = P.divMono(m);
    const restConst = rest.constValue() !== null;
    const mono = new Poly();
    mono.addTerm(restConst ? rest.constValue()! : 1, m);
    (restConst ? o.pOnce.bind(o) : o.p.bind(o))(restConst ? `${showPoly(mono, names)} = 0` : `Factor común: ${showPoly(mono, names)}·${showFactor(rest, names)} = 0`);
    const parts = Object.keys(m).map((v) => `${names[v]} = 0`);
    if (!restConst) parts.push(`${showPoly(rest, names)} = 0`);
    o.p(`⇒ ${parts.join("  ó  ")}`);
    const restLeaves = restConst ? [] : reduce(rest, names, o);
    if (!restLeaves) return null;
    return [...Object.keys(m).map((v) => Poly.v(v)), ...restLeaves];
  }
  const byG = (g: G) => vars.find((v) => parseVar(v).g === g);
  const t = byG("tan");
  const s = byG("sin");
  const c = byG("cos");
  if (t && (s || c)) {
    const k = parseVar(t).k;
    const S = vname("sin", k);
    const C = vname("cos", k);
    names[S] ??= label("sin", k);
    names[C] ??= label("cos", k);
    const R = P.substitute(t, Rational.of(Poly.v(S)).div(Rational.of(Poly.v(C))));
    o.p(`${names[t]} = ${names[S]}/${names[C]}  (multiplico todo por ${names[C]})`);
    const N = R.n.monicSign();
    o.p(`${showPoly(N, names)} = 0`);
    return reduce(N, names, o);
  }
  if (s && c) {
    const allEven = (v: string) => P.list().every((tm) => (tm.m[v] ?? 0) % 2 === 0);
    if (allEven(c)) {
      const N = P.substSquare(c, Poly.const(1).sub(Poly.v(s).pow(2))).monicSign();
      o.p(`cos²(${kStr(parseVar(c).k)}x) = 1 − sin²(${kStr(parseVar(c).k)}x)`);
      o.p(`${showPoly(N, names)} = 0`);
      return reduce(N, names, o);
    }
    if (allEven(s)) {
      const N = P.substSquare(s, Poly.const(1).sub(Poly.v(c).pow(2))).monicSign();
      o.p(`sin²(${kStr(parseVar(s).k)}x) = 1 − cos²(${kStr(parseVar(s).k)}x)`);
      o.p(`${showPoly(N, names)} = 0`);
      return reduce(N, names, o);
    }
  }
  return null;
}

/** Paso 2: valores de t para cada ecuación de una sola función. */
function leafValues(L: Leaf, names: Names, o: Out): { g: G; k: number; ts: number[] }[] {
  const vars = L.vars();
  if (!vars.length) {
    o.strike(`${showPoly(L, names)} = 0  ✗ absurdo, no aporta soluciones`);
    return [];
  }
  const v = vars[0];
  const { g, k } = parseVar(v);
  const c = L.coeffs(v);
  const deg = c.length - 1;
  let ts: number[];
  if (deg === 1) {
    ts = [-c[0] / c[1]];
    const eq = `${showPoly(L, names)} = 0`;
    const sol = `${names[v]} = ${fmtNum(ts[0])}`;
    if (eq !== sol) o.p(o.last() === eq ? `⇒ ${sol}` : `${eq} ⇒ ${sol}`);
    else o.p(sol);
  } else if (deg === 2) {
    const tn: Names = { [v]: "t" };
    o.p(`t = ${names[v]}`);
    o.p(`${showPoly(L, tn)} = 0`);
    o.p(`A = ${fmtNum(c[2])} ; B = ${fmtNum(c[1])} ; C = ${fmtNum(c[0])}`);
    o.casio(`MODE → 5 → 3 → ${fmtNum(c[2])} = ${fmtNum(c[1])} = ${fmtNum(c[0])} = → = =`);
    ts = realRoots(c);
    if (!ts.length) o.strike("Δ < 0 ⇒ no hay t real");
    else o.p(ts.length === 1 ? `t = ${fmtNum(ts[0])} (raíz doble)` : `t₁ = ${fmtNum(ts[0])} ; t₂ = ${fmtNum(ts[1])}`);
    o.casio("Volver: MODE → 1");
  } else {
    ts = realRoots(c);
    o.p(`${showPoly(L, names)} = 0 ⇒ ${names[v]} = ${join(ts.map(fmtNum))}`);
  }
  if (g !== "tan") {
    ts = ts.filter((t) => {
      if (Math.abs(t) > 1 + 1e-12) {
        o.strike(`${names[v]} = ${fmtNum(t)}  ✗ (${g} no puede ser > 1 ni < −1)`);
        return false;
      }
      return true;
    });
  }
  return [{ g, k, ts }];
}

/** Paso 3: ángulos α y espejo, pasados a x en [0 ; T]. */
function anglesFor(g: G, k: number, t: number, T: number, o: Out): number[] {
  const lab = label(g, k);
  const tStr = fmtNum(t);
  let a0: number;
  let bases: number[];
  let P = 2 * PI;
  if (g === "sin") {
    a0 = Math.asin(Math.max(-1, Math.min(1, t)));
    o.p(`${lab} = ${tStr}`);
    o.casio(`SHIFT → sin → ${tStr} → = ⇒ ${casioAngle(a0)}`);
    let a = a0;
    if (a0 < -1e-12) { a = a0 + 2 * PI; o.p(`α = ${fmtAngle(a0)} < 0 ⇒ α + 2π = ${fmtAngle(a)}`); }
    else o.p(`α = ${fmtAngle(a0)}`);
    const a0s = a0 < -1e-12 ? `(${fmtAngle(a0)})` : fmtAngle(a0);
    o.p(`Espejo: π − α = π − ${a0s} = ${fmtAngle(PI - a0)}`);
    bases = [a, PI - a0];
  } else if (g === "cos") {
    a0 = Math.acos(Math.max(-1, Math.min(1, t)));
    o.p(`${lab} = ${tStr}`);
    o.casio(`SHIFT → cos → ${tStr} → = ⇒ ${casioAngle(a0)}`);
    o.p(`α = ${fmtAngle(a0)}`);
    o.p(`Espejo: 2π − α = ${fmtAngle(2 * PI - a0)}`);
    bases = [a0, 2 * PI - a0];
  } else {
    P = PI;
    a0 = Math.atan(t);
    o.p(`${lab} = ${tStr}`);
    o.casio(`SHIFT → tan → ${tStr} → = ⇒ ${casioAngle(a0)}`);
    let a = a0;
    if (a0 < -1e-12) { a = a0 + PI; o.p(`α = ${fmtAngle(a0)} < 0 ⇒ α + π = ${fmtAngle(a)}`); }
    else o.p(`α = ${fmtAngle(a0)}`);
    o.p(`Espejo: π + α = ${fmtAngle(a + PI)}`);
    bases = [a, a + PI];
  }
  const U = k * T;
  const all = [...bases, ...bases.map((b) => b + P), ...bases.map((b) => b + 2 * P)];
  const thetas = inRange(all, P, U);
  const outside = dedupeAngles(bases.filter((b) => b > U + 1e-9 || b < -1e-9));
  for (const th of outside) o.strike(`${fmtAngle(th)}  ✗ (fuera de [0 ; ${fmtAngle(U)}])`);
  const extra = thetas.filter((th) => !bases.some((b) => near(b, th, 1e-7)));
  if (extra.length) o.p(`Sumando ${g === "tan" ? "π" : "2π"} dentro de [0 ; ${fmtAngle(U)}]: ${join(extra.map(fmtAngle))}`);
  if (!near(k, 1)) {
    const xs = thetas.map((th) => th / k);
    o.p(`${kStr(k)}x = θ ⇒ x = θ/${kStr(k)}: ${join(xs.map(fmtAngle))}`);
    return xs;
  }
  return thetas;
}

function solveEq(expr: E, T: number, o: Out, opts: { steps: boolean }): Solved {
  for (const expandDouble of [true, false]) {
    const ids: string[] = [];
    const work = new Out(o.last());
    try {
      const R = toRational(expr, buildAtoms(expr, expandDouble, ids));
      let N = R.n;
      const ks = new Set(N.vars().map((v) => parseVar(v).k));
      if (ks.size > 1) continue;
      const names: Names = {};
      for (const v of N.vars()) names[v] = label(parseVar(v).g, parseVar(v).k);
      N = N.monicSign();

      if (opts.steps) work.sub("Paso 1:");
      [...new Set(ids)].forEach((l) => work.p(l));
      if (R.d.constValue() === null) work.p("(multiplico por el denominador)");
      work.pOnce(`${showPoly(N, names)} = 0`);
      const leaves = reduce(N, names, work);
      if (!leaves) continue;

      if (opts.steps) { work.gap(); work.sub("Paso 2:"); }
      const vals = leaves.flatMap((L) => leafValues(L, names, work));

      if (opts.steps) { work.gap(); work.sub("Paso 3:"); }
      const xs: number[] = [];
      for (const { g, k, ts } of vals) for (const t of ts) xs.push(...anglesFor(g, k, t, T, work));
      o.append(work);
      return { xs: dedupeAngles(xs).filter((x) => x >= -1e-9 && x <= T + 1e-9), numeric: false };
    } catch (err) {
      if (err instanceof SolverError) throw err;
      continue;
    }
  }
  // Respaldo numérico
  if (opts.steps) o.sub("Paso 1-3:");
  o.note("No se pudo dejar una sola función: busqué los ángulos numéricamente (verificalos con CALC).");
  const xs = scanRoots((x) => evaluate(expr, x), 0, T, 40000).map(snapAngle);
  o.p(xs.length ? `Ángulos: ${join(xs.map(fmtAngle))}` : "No hay ángulos que la anulen.");
  return { xs, numeric: true };
}

function snapAngle(x: number) {
  const r = x / PI;
  for (let q = 1; q <= 24; q++) {
    const p = Math.round(r * q);
    if (Math.abs(r - p / q) < 1e-7) return (p / q) * PI;
  }
  return x;
}

// ---------- Ejercicio completo ----------

export function solveTrig(f: E): Out {
  const o = new Out();
  const nodes = trigNodes(f);
  if (!nodes.length) throw new SolverError("No encontré sin, cos ni tan. ¿Es del Ejercicio 5?");
  nodes.forEach(lin);

  // 1. Período
  const sc = nodes.filter((n) => n.f !== "tan");
  const ref = sc.length ? sc : nodes;
  const k = Math.min(...ref.map((n) => Math.abs(lin(n).a)));
  const T = (sc.length ? 2 * PI : PI) / k;
  o.h("1. Período (T):");
  o.casio("Antes de empezar, Casio en RAD: SHIFT → MODE → 4");
  o.p(sc.length ? "Hay sin o cos ⇒ T = 2π/k" : "Es tan pura ⇒ T = π/k");
  const frac = `${sc.length ? "2π" : "π"}/${fmtNum(k)}`;
  o.result(frac === fmtAngle(T) ? `T = ${frac}` : `T = ${frac} = ${fmtAngle(T)}`);
  o.gap();

  // 2. Dominio
  o.h("2. Dominio (Df):");
  const forbidden: number[] = [];
  const dens: E[] = [];
  walk(f, (n) => {
    if (n.t === "div" && nodesHasX(n.b)) dens.push(n.b);
  });
  for (const D of uniqBy(dens, show)) {
    o.p("Fracción ⇒ igualo el denominador a 0:");
    o.p(`${show(D)} = 0`);
    const r = solveEq(D, T, o, { steps: false });
    forbidden.push(...r.xs);
    o.p(r.xs.length ? `Ángulos prohibidos: ${join(r.xs.map(fmtAngle))}` : "El denominador nunca da 0.");
  }
  for (const n of uniqBy(nodes.filter((n) => n.f === "tan"), show)) {
    const { a, b } = lin(n);
    const xs: number[] = [];
    for (let m = -50; m <= 50; m++) {
      const x = (PI / 2 + m * PI - b) / a;
      if (x >= -1e-9 && x <= T + 1e-9) xs.push(snapAngle(x));
    }
    const arg = show(n.a);
    o.p(`${show(n)} = sin(${arg})/cos(${arg}) ⇒ cos(${arg}) ≠ 0`);
    o.p(xs.length ? `⇒ x ≠ ${join(dedupeAngles(xs).map(fmtAngle))}` : "⇒ no hay ángulos prohibidos en el intervalo");
    forbidden.push(...xs);
  }
  const forb = dedupeAngles(forbidden);
  const base = `[0 ; ${fmtAngle(T)}]`;
  if (!dens.length && !nodes.some((n) => n.f === "tan")) o.p("No hay fracción ni tan");
  o.result(`Df = ${base}${forb.length ? ` \\ { ${join(forb.map(fmtAngle))} }` : ""}`);
  o.gap();

  // 3. Ceros
  o.h("3. Ceros (C0):");
  const N = f.t === "div" ? f.a : f;
  if (f.t === "div") o.p(`Hay fracción ⇒ igualo SOLO el numerador: ${show(N)} = 0`);
  else o.p(`f(x) = 0 ⇒ ${show(f)} = 0`);
  const sol = solveEq(N, T, o, { steps: true });

  // Paso 4: filtro de Df y CALC
  o.gap();
  o.sub("Filtro (Df y CALC):");
  o.casio(`Escribir: ${casio(f)} → CALC → X = ángulo → =`);
  const zeros: number[] = [];
  for (const x of sol.xs) {
    const s = fmtAngle(x);
    if (forb.some((p) => near(p, x, 1e-7))) { o.strike(`x = ${s}  ✗ (prohibido por Df)`); continue; }
    const v = evaluate(f, x);
    if (!Number.isFinite(v)) o.strike(`x = ${s}  ✗ (CALC: Math ERROR)`);
    else if (Math.abs(v) > 1e-7) o.strike(`x = ${s}  ✗ (CALC da ${fmtNum(v)} ≠ 0)`);
    else { o.ok(`x = ${s}  ✓ CALC da 0`); zeros.push(x); }
  }
  o.gap();
  o.result(zeros.length ? `C0 = { ${join(zeros.map(fmtAngle))} }` : "C0 = ∅ (no tiene ceros)");
  return o;
}

const nodesHasX = (e: E) => {
  let found = false;
  walk(e, (n) => { if (n.t === "x") found = true; });
  return found;
};
function uniqBy<T>(xs: T[], k: (x: T) => string) {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(k(x)) ? false : (seen.add(k(x)), true)));
}
