// EJERCICIO 5: Logaritmos y Exponenciales — Dominio y Ceros.
import { casio, constValue, evaluate, hasX, linear, logLabel, show, SolverError, sup, walk, type E } from "./ast";
import { join, Out } from "./lines";
import { fmtNum, isExact, near, realRoots, scanRoots } from "./numbers";
import { Poly, Rational, showFactor, showPoly, toRational, Unsupported, type Names } from "./poly";

type Op = ">" | ">=" | "!=";
type Cond = { g: E; op: Op; why: string };
/** s: forma exacta (e, ln(2), e^2 + 1…); approx: además mostrar el decimal. */
type Pt = { v: number; s: string; approx?: boolean };
type FnNode = Extract<E, { t: "fn" }>;

const OPS: Record<Op, string> = { ">": ">", ">=": "≥", "!=": "≠" };
const XN: Names = { x: "x" };

const atomX = (n: E): Rational | null => {
  if (!hasX(n)) return null;
  if (n.t === "x") return Rational.of(Poly.v("x"));
  if (n.t === "fn") throw new Unsupported("función con x");
  if (n.t === "pow" && hasX(n.b)) throw new Unsupported("exponente con x");
  return null;
};

const dec = (v: number) => `≈ ${(Math.round(v * 1e4) / 1e4).toString().replace("-", "−")}`;
const pt = (v: number): Pt => ({ v, s: fmtNum(v).replace(/^≈ /, "") });
const lbl = (p: Pt) => (p.approx ? `${p.s} ${dec(p.v)}` : p.s);
const par = (s: string) => (/^[\wπ²³⁴⁵.]+$/.test(s) ? s : `(${s})`);
/** b^k con paréntesis donde hagan falta: (1/2)^(−1), e^2, e. */
const powStr = (b: string, k: string) => (k === "1" ? b : `${par(b)}^${/^([\d.]+|[a-z])$/.test(k) ? k : `(${k})`}`);
const isLogFn = (n: E): n is FnNode => n.t === "fn" && (n.f === "ln" || n.f === "log");
const logBase = (n: FnNode) => (n.f === "ln" ? Math.E : n.base!);
const logBaseStr = (n: FnNode) => (n.f === "ln" ? "e" : n.baseStr ?? fmtNum(n.base!));
const logNameOf = (n: FnNode) => (n.f === "ln" ? "ln" : logLabel(logBaseStr(n)));

function dedupePts(ps: Pt[]): Pt[] {
  const s = [...ps].sort((a, b) => a.v - b.v);
  return s.filter((p, i) => i === 0 || !near(p.v, s[i - 1].v, 1e-7));
}

// ---------- Puntos críticos (para tablas de signos) ----------

/** Raíces exactas de g = 0 sin escribir pasos (se reutilizan los motores de ceros). */
function silentZeros(g: E): Pt[] | null {
  for (const engine of [logZeros, expZeros]) {
    try {
      const r = engine(g, new Out());
      if (r) return r.filter((p) => Math.abs(evaluate(g, p.v)) < 1e-9);
    } catch (err) {
      if (!(err instanceof Unsupported)) throw err;
    }
  }
  return null;
}

/** Puntos donde g cambia de signo (raíces de numerador y denominador). */
function criticalPoints(g: E): { roots: Pt[]; poles: Pt[] } {
  if (g.t === "fn" && g.f === "sqrt") return { roots: criticalPoints(g.a).roots, poles: [] };
  if (isLogFn(g)) return { roots: criticalPoints({ t: "sub", a: g.a, b: { t: "num", v: 1 } }).roots, poles: [] };
  try {
    const R = toRational(g, atomX);
    return { roots: realRoots(R.n.coeffs("x")).map(pt), poles: realRoots(R.d.coeffs("x")).map(pt) };
  } catch (err) {
    if (!(err instanceof Unsupported)) throw err;
  }
  const exact = silentZeros(g);
  if (exact) return { roots: exact, poles: [] };
  return { roots: scanRoots((x) => evaluate(g, x), -100, 100, 200000).map(pt), poles: [] };
}

function check(c: Cond, x: number) {
  const v = evaluate(c.g, x);
  if (!Number.isFinite(v)) return false;
  if (c.op === ">") return v > 1e-9;
  if (c.op === ">=") return v >= -1e-9;
  return Math.abs(v) > 1e-9;
}

// ---------- Conjuntos de intervalos ----------

type Interval = { lo: Pt | null; loIn: boolean; hi: Pt | null; hiIn: boolean };

const testPoint = (lo: number, hi: number) =>
  !Number.isFinite(lo) ? hi - Math.max(1, Math.abs(hi)) : !Number.isFinite(hi) ? lo + Math.max(1, Math.abs(lo)) : (lo + hi) / 2;

function solveSet(pred: (x: number) => boolean, crits: Pt[]): Interval[] {
  const pts = dedupePts(crits);
  if (!pts.length) return pred(0) ? [{ lo: null, loIn: false, hi: null, hiIn: false }] : [];
  const out: Interval[] = [];
  let cur: { lo: Pt | null; loIn: boolean } | null = null;
  for (let i = 0; i <= pts.length; i++) {
    const lo = i ? pts[i - 1].v : -Infinity;
    const hi = i < pts.length ? pts[i].v : Infinity;
    if (pred(testPoint(lo, hi))) {
      if (!cur) cur = { lo: i ? pts[i - 1] : null, loIn: false };
    } else if (cur) {
      out.push({ ...cur, hi: pts[i - 1], hiIn: true });
      cur = null;
    }
    if (i < pts.length) {
      const p = pts[i];
      if (pred(p.v)) {
        if (!cur) cur = { lo: p, loIn: true };
      } else if (cur) {
        out.push({ ...cur, hi: p, hiIn: false });
        cur = null;
      }
    }
  }
  if (cur) out.push({ ...cur, hi: null, hiIn: false });
  return out;
}

function fmtSet(set: Interval[]): string {
  if (!set.length) return "∅";
  if (set.length === 1 && !set[0].lo && !set[0].hi) return "R";
  return set
    .map((iv) => {
      if (iv.lo && iv.hi && near(iv.lo.v, iv.hi.v)) return `{ ${iv.lo.s} }`;
      const l = iv.lo ? `${iv.loIn ? "[" : "("}${iv.lo.s}` : "(−∞";
      const r = iv.hi ? `${iv.hi.s}${iv.hiIn ? "]" : ")"}` : "+∞)";
      return `${l} ; ${r}`;
    })
    .join(" U ");
}

function fmtSimple(set: Interval[]): string {
  if (set.length === 1) {
    const iv = set[0];
    if (!iv.lo && iv.hi) return `x ${iv.hiIn ? "≤" : "<"} ${iv.hi.s}`;
    if (iv.lo && !iv.hi) return `x ${iv.loIn ? "≥" : ">"} ${iv.lo.s}`;
  }
  return `x ∈ ${fmtSet(set)}`;
}

// ---------- Dominio ----------

const isSqrt = (n: E): n is FnNode => n.t === "fn" && n.f === "sqrt";

function domain(f: E, o: Out) {
  const conds: Cond[] = [];
  walk(f, (n) => {
    if (isLogFn(n) && hasX(n.a)) {
      // log(√(u)): la raíz ya es ≥ 0, así que alcanza con u > 0 (una sola tabla)
      if (isSqrt(n.a)) conds.push({ g: n.a.a, op: ">", why: `${show(n)} ⇒ ${show(n.a)} > 0` });
      else conds.push({ g: n.a, op: ">", why: show(n) });
    }
    if (isSqrt(n) && hasX(n.a)) conds.push({ g: n.a, op: ">=", why: show(n) });
    if (n.t === "div" && hasX(n.b)) conds.push({ g: n.b, op: "!=", why: "Fracción" });
    if (n.t === "pow" && hasX(n.a) && !hasX(n.b) && constValue(n.b) < 0) conds.push({ g: n.a, op: "!=", why: "Potencia negativa" });
  });
  // > le gana a ≥ sobre lo mismo; los denominadores que ya están en una tabla no se repiten
  const strict = new Set(conds.filter((c) => c.op === ">").map((c) => show(c.g)));
  const tabulatedDen = new Set(conds.flatMap((c) => (c.op !== "!=" && c.g.t === "div" ? [show(c.g.b)] : [])));
  const seen = new Set<string>();
  const uniq = conds.filter((c) => {
    const g = show(c.g);
    if (c.op === ">=" && strict.has(g)) return false;
    if (c.op === "!=" && c.why === "Fracción" && tabulatedDen.has(g)) return false;
    const key = `${c.op}|${g}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });

  o.h("2. Dominio (Df):");
  if (!uniq.length) {
    o.p("No hay log, raíz ni fracción ⇒ Df = R");
    o.result("Df = R");
    return { inDf: () => true, conds: uniq };
  }
  const all: Pt[] = [];
  for (const c of uniq) {
    const { roots, poles } = criticalPoints(c.g);
    const crit = [...roots, ...poles];
    all.push(...crit);
    if (c.op === "!=") {
      o.p(`${c.why} ⇒ ${show(c.g)} ≠ 0`);
      if (isLogFn(c.g) && c.g.a.t !== "x") o.p(`⇒ ${show(c.g.a)} ≠ 1`);
      if (isSqrt(c.g)) o.p(`⇒ ${show(c.g.a)} ≠ 0`);
      o.p(roots.length ? `⇒ x ≠ ${join(roots.map((r) => r.s))}` : "⇒ nunca es 0");
      continue;
    }
    o.p(`${c.why} ⇒ ${show(c.g)} ${OPS[c.op]} 0`);
    const set = solveSet((x) => check(c, x), crit);
    const l = linear(c.g);
    if (l) {
      const r = -l.b / l.a;
      const op = l.a > 0 ? (c.op === ">" ? ">" : "≥") : c.op === ">" ? "<" : "≤";
      const ax = near(l.a, 1) ? "x" : `${fmtNum(l.a)}x`;
      o.p(near(l.a, 1) ? `⇒ x ${op} ${fmtNum(r)}` : `⇒ ${ax} ${OPS[c.op]} ${fmtNum(-l.b)} ⇒ x ${op} ${fmtNum(r)}`);
      continue;
    }
    if (crit.length) signTable(c, roots, poles, o);
    o.p(`⇒ ${fmtSimple(set)}`);
  }
  const inDf = (x: number) => uniq.every((c) => check(c, x));
  o.result(`Df = ${fmtSet(solveSet(inDf, all))}`);
  return { inDf, conds: uniq };
}

/** Tabla de signos real: una columna por intervalo y filas N, D y total. */
function signTable(c: Cond, roots: Pt[], poles: Pt[], o: Out) {
  const R = (() => {
    try {
      return toRational(c.g, atomX);
    } catch {
      return null;
    }
  })();
  const frac = R && R.d.constValue() === null;
  if (frac) {
    o.p(`N = ${showPoly(R.n, XN)} = 0 ⇒ ${join(roots.map((r) => `x = ${r.s}`)) || "no se anula"}`);
    o.p(`D = ${showPoly(R.d, XN)} = 0 ⇒ ${join(poles.map((r) => `x = ${r.s}`)) || "no se anula"}`);
  } else o.p(`${show(c.g)} = 0 ⇒ ${join(roots.map((r) => `x = ${r.s}`))}`);
  const pts = dedupePts([...roots, ...poles]);
  const head: string[] = [];
  const nRow: string[] = [];
  const dRow: string[] = [];
  const tot: string[] = [];
  const sg = (v: number) => (!Number.isFinite(v) ? "∄" : v > 0 ? "+" : "−");
  for (let i = 0; i <= pts.length; i++) {
    const lo = i ? pts[i - 1] : null;
    const hi = i < pts.length ? pts[i] : null;
    const t = testPoint(lo ? lo.v : -Infinity, hi ? hi.v : Infinity);
    head.push(`(${lo ? lo.s : "−∞"} ; ${hi ? hi.s : "+∞"})`);
    if (frac) {
      nRow.push(sg(R.n.evalAt({ x: t })));
      dRow.push(sg(R.d.evalAt({ x: t })));
    }
    tot.push(sg(evaluate(c.g, t)));
  }
  const rows = frac
    ? [
        { label: "N", cells: nRow },
        { label: "D", cells: dRow },
        { label: "N/D", cells: tot },
      ]
    : [{ label: show(c.g), cells: tot }];
  o.table({ head, rows }, `Tabla de signos de ${show(c.g)} ${OPS[c.op]} 0`);
}

// ---------- Resolver P(x) = 0 polinómico ----------

function solvePolyX(P: Poly, o: Out, v = "x"): Pt[] {
  const c = P.coeffs("x");
  const deg = c.length - 1;
  if (deg <= 0) {
    if (Math.abs(c[0] ?? 0) < 1e-12) o.note("La ecuación se cumple para todo x del dominio.");
    else o.strike(`${fmtNum(c[0])} = 0  ✗ absurdo: no hay ceros`);
    return [];
  }
  if (deg === 1) {
    const r = -c[0] / c[1];
    o.p(near(c[1], 1) ? `⇒ ${v} = ${fmtNum(r)}` : `⇒ ${fmtNum(c[1])}${v} = ${fmtNum(-c[0])} ⇒ ${v} = ${fmtNum(r)}`);
    return [pt(r)];
  }
  const rs = realRoots(c);
  if (deg === 2) {
    o.p(`A = ${fmtNum(c[2])} ; B = ${fmtNum(c[1])} ; C = ${fmtNum(c[0])}`);
    o.casio(`MODE → 5 → 3 → ${fmtNum(c[2])} = ${fmtNum(c[1])} = ${fmtNum(c[0])} = → = =`);
    if (!rs.length) o.strike("Δ < 0 ⇒ no hay raíces reales");
    else o.p(rs.length === 1 ? `${v} = ${fmtNum(rs[0])} (raíz doble)` : `${v}₁ = ${fmtNum(rs[0])} ; ${v}₂ = ${fmtNum(rs[1])}`);
    o.casio("Volver: MODE → 1");
  } else o.p(rs.length ? `Raíces: ${join(rs.map((r) => `${v} = ${fmtNum(r)}`))}` : "No hay raíces reales");
  return rs.map(pt);
}

/** Muestra N/D = 0 ⇒ N = 0 cuando queda una fracción. */
function numeratorOnly(R: Rational, o: Out) {
  if (R.d.constValue() !== null) return;
  o.p(`Queda una fracción N/D = 0 ⇒ igualo SOLO el numerador:`);
  o.p(`N = ${showPoly(R.n, XN)} = 0   (D = ${showPoly(R.d, XN)} ≠ 0 se verifica al final)`);
}

// ---------- Variante polinómica / racional ----------

function polyZeros(N: E, o: Out): Pt[] {
  const R = toRational(N, atomX);
  o.sub("Paso 1:");
  numeratorOnly(R, o);
  const P = R.n.monicSign();
  o.pOnce(`${showPoly(P, XN)} = 0`);
  o.gap();
  o.sub("Paso 2:");
  return solvePolyX(P, o);
}

/** Resuelve u(x) = val: saca raíces cuadradas y despeja (u racional en x). */
function solveEqual(u: E, val: number, valStr: string, o: Out): Pt[] {
  while (u.t === "fn" && u.f === "sqrt") {
    if (val < -1e-12) {
      o.strike(`${show(u)} = ${valStr}  ✗ una raíz no puede dar negativo`);
      return [];
    }
    const sq = val * val;
    const sqStr = isExact(sq) ? fmtNum(sq) : `${par(valStr)}²`;
    o.p(`${show(u)} = ${valStr} ⇒ elevo al cuadrado: ${show(u.a)} = ${sqStr}`);
    u = u.a;
    val = sq;
    valStr = sqStr;
  }
  if (u.t === "x") return [{ v: val, s: valStr, approx: !isExact(val) }];
  const U = toRational(u, atomX);
  if (U.d.constValue() === null) {
    const [nStr, dStr] = u.t === "div" ? [show(u.a), show(u.b)] : [showPoly(U.n, XN), showPoly(U.d, XN)];
    o.p(`Paso el denominador multiplicando: ${nStr} = ${near(val, 1) ? dStr : `${valStr}·${par(dStr)}`}`);
  }
  const eq = U.n.sub(U.d.scale(val)).monicSign();
  if (eq.degree("x") === 1 && !isExact(val)) {
    const r = -eq.coeffs("x")[0] / eq.coeffs("x")[1];
    const p = { v: r, s: linearStr(U, valStr) ?? fmtNum(r).replace(/^≈ /, ""), approx: true };
    o.p(`⇒ x = ${lbl(p)}`);
    return [p];
  }
  o.p(`${showPoly(eq, XN)} = 0`);
  return solvePolyX(eq, o);
}

/** x = (e^2 + 1)/2 en vez de solo el decimal (si u es lineal). */
function linearStr(U: Rational, valStr: string): string | null {
  const d = U.d.constValue();
  const [n0, n1] = U.n.coeffs("x");
  if (d !== 1 || n1 === undefined) return null;
  let s = valStr;
  if (!near(n0, 0)) s += n0 > 0 ? ` − ${fmtNum(n0)}` : ` + ${fmtNum(-n0)}`;
  if (!near(n1, 1)) s = `(${s})/${fmtNum(n1)}`;
  return s;
}

// ---------- Variante logaritmos ----------

type LogAtom = { node: FnNode; base: number; bStr: string; ln: string; v: string; name: string };

function logZeros(N: E, o: Out): Pt[] | null {
  const atoms: LogAtom[] = [];
  const atom = (n: E): Rational | null => {
    if (n.t === "x") throw new Unsupported("x fuera del log");
    if (isLogFn(n) && (hasX(n) || atoms.length)) {
      const s = show(n);
      let a = atoms.find((z) => z.name === s);
      if (!a) {
        a = { node: n, base: logBase(n), bStr: logBaseStr(n), ln: logNameOf(n), v: `L${atoms.length}`, name: s };
        atoms.push(a);
      }
      return Rational.of(Poly.v(a.v));
    }
    if (hasX(n) && (n.t === "fn" || (n.t === "pow" && hasX(n.b)))) throw new Unsupported("otra función con x");
    return null;
  };
  const R = toRational(N, atom);
  if (R.d.constValue() === null) return null;
  let P = R.n;
  const names: Names = Object.fromEntries(atoms.map((a) => [a.v, a.name]));
  const vars = P.vars();

  // Un solo log al cuadrado ⇒ t = log(u)
  if (vars.length === 1 && P.degree(vars[0]) >= 2) {
    const a = atoms.find((z) => z.v === vars[0])!;
    P = P.monicSign();
    o.sub("Paso 1:");
    o.pOnce(`${showPoly(P, names)} = 0`);
    o.gap();
    o.sub("Paso 2:");
    o.p(`t = ${a.name}`);
    o.p(`${showPoly(P, { [a.v]: "t" })} = 0`);
    const tP = new Poly();
    P.coeffs(a.v).forEach((k, i) => tP.addTerm(k, i ? { x: i } : {}));
    const ts = solvePolyX(tP, o, "t");
    o.gap();
    o.sub("Paso 3:");
    const out: Pt[] = [];
    for (const t of ts) {
      const val = Math.pow(a.base, t.v);
      const ex = powStr(a.bStr, t.s);
      const valStr = isExact(val) ? fmtNum(val) : ex;
      o.p(`${a.name} = ${t.s} ⇒ ${show(a.node.a)} = ${ex}${isExact(val) && valStr !== ex ? ` = ${valStr}` : ""}`);
      if (a.node.a.t === "x") {
        const p = { v: val, s: valStr, approx: !isExact(val) };
        if (p.approx) o.p(`⇒ x = ${lbl(p)}`);
        out.push(p);
      } else out.push(...solveEqual(a.node.a, val, valStr, o));
    }
    return out;
  }

  // Lineal en logs: agrupar en un solo log (los números y logs constantes pasan al otro lado)
  if (P.totalDegree() !== 1) return null;
  const coef = (v: string) => P.list().find((t) => t.m[v] === 1)?.c ?? 0;
  const used = atoms.filter((a) => vars.includes(a.v));
  const xs = used.filter((a) => hasX(a.node));
  const cs = used.filter((a) => !hasX(a.node));
  if (!xs.length || xs.some((a) => !near(a.base, xs[0].base))) return null;
  if (xs.some((a) => !near(coef(a.v), Math.round(coef(a.v))))) return null;
  if (xs.every((a) => coef(a.v) < 0)) P = P.scale(-1);
  const { base, bStr, ln } = xs[0];
  const k0 = P.list().find((t) => !Object.keys(t.m).length)?.c ?? 0;
  const right = Poly.const(-k0);
  for (const c of cs) right.addTerm(-coef(c.v), { [c.v]: 1 });
  const K = right.evalAt(Object.fromEntries(cs.map((c) => [c.v, constValue(c.node)])));
  const rightStr = showPoly(right, names);
  const left = new Poly();
  for (const a of xs) left.addTerm(coef(a.v), { [a.v]: 1 });

  o.sub("Paso 1:");
  o.pOnce(`${showPoly(P, names)} = 0`);
  if (right.constValue() !== 0) o.p(`Paso ${cs.length ? "lo que no tiene x" : "el número suelto"} al otro lado: ${showPoly(left, names)} = ${rightStr}`);
  const pos = xs.filter((a) => coef(a.v) > 0);
  const neg = xs.filter((a) => coef(a.v) < 0);
  const powArg = (a: LogAtom) => {
    const n = Math.abs(Math.round(coef(a.v)));
    const s = show(a.node.a);
    return n === 1 ? s : `${par(s)}${sup(n)}`;
  };
  for (const a of xs) {
    const n = Math.abs(Math.round(coef(a.v)));
    if (n !== 1) o.p(`${n}·${a.name} = ${ln}(${powArg(a)})`);
  }
  const prod = (as: LogAtom[]) => as.map((a) => (as.length > 1 ? par(powArg(a)) : powArg(a))).join("·");
  if (pos.length > 1) o.p(`${ln}(A) + ${ln}(B) = ${ln}(A·B)`);
  if (neg.length) o.p(`${ln}(A) − ${ln}(B) = ${ln}(A/B)`);
  const A = prod(pos);
  const B = prod(neg);
  const inside = neg.length ? `${par(A)}/${par(B)}` : A;
  const combined = `${ln}(${inside}) = ${rightStr}`;
  if (combined !== `${showPoly(left, names)} = ${rightStr}`) o.pOnce(combined);
  // Opción directa con dos logs de la misma base igualados a 0
  if (xs.length === 2 && !cs.length && near(k0, 0) && xs.every((a) => Math.abs(Math.round(coef(a.v))) === 1)) {
    const [a1, a2] = pos.length === 1 ? [pos[0], neg[0]] : [xs[0], xs[1]];
    const A1 = show(a1.node.a);
    const B1 = show(a2.node.a);
    if (pos.length === 1) o.p(`Opción directa: paso restando ⇒ ${a1.name} = ${a2.name} ⇒ cancelo ${ln}: ${A1} = ${B1}`);
    else o.p(`Opción directa: ${a1.name} = −${a2.name} = ${ln}(1/${par(B1)}) ⇒ ${A1} = 1/${par(B1)}`);
  }
  o.gap();

  o.sub("Paso 2:");
  const val = Math.pow(base, K);
  const kStr = cs.length ? rightStr : fmtNum(K).replace(/^≈ /, "");
  const ex = powStr(bStr, kStr);
  const cancel = cs.length === 1 && near(k0, 0) && near(coef(cs[0].v), -1) && near(cs[0].base, base);
  const valStr = cancel ? show(cs[0].node.a) : isExact(val) ? fmtNum(val) : ex;
  if (cancel) o.p(`Cancelo ${ln} de ambos lados: ${inside} = ${valStr}`);
  else {
    o.p(`Definición: ${ln}(u) = k ⇒ u = ${powStr(bStr, "k")}`);
    o.p(`${inside} = ${ex}${isExact(val) && valStr !== ex ? ` = ${valStr}` : ""}`);
  }

  // Un solo log: despejo u = valor directamente (soporta raíces y fracciones adentro)
  if (xs.length === 1 && Math.abs(Math.round(coef(xs[0].v))) === 1) {
    const out = solveEqual(xs[0].node.a, val, valStr, o);
    return out;
  }
  let U = Rational.of(Poly.const(1));
  for (const a of xs) U = U.mul(toRational(a.node.a, atomX).pow(Math.round(coef(a.v))));
  const eq = U.n.sub(U.d.scale(val)).monicSign();
  const times = near(val, 1) ? "" : `${valStr}·`;
  if (neg.length) o.p(`Paso el denominador multiplicando: ${A} = ${times ? times + par(B) : B}`);
  else if (U.d.constValue() === null) o.p(`${showPoly(U.n, XN)} = ${times ? times + showFactor(U.d, XN) : showPoly(U.d, XN)}`);
  if (eq.degree("x") === 1 && !isExact(val)) {
    const r = -eq.coeffs("x")[0] / eq.coeffs("x")[1];
    const p = { v: r, s: linearStr(U, valStr) ?? fmtNum(r).replace(/^≈ /, ""), approx: true };
    o.p(`⇒ x = ${lbl(p)}`);
    return [p];
  }
  o.p(`${showPoly(eq, XN)} = 0`);
  o.gap();
  o.sub("Paso 3:");
  return solvePolyX(eq, o);
}

// ---------- Variante exponenciales ----------

type ExpNode = { node: E; b: number; a: number; c: number };

function expZeros(N: E, o: Out): Pt[] | null {
  const nodes: ExpNode[] = [];
  let ok = true;
  walk(N, (n) => {
    let base: number | null = null;
    let ex: E | null = null;
    if (n.t === "pow" && !hasX(n.a) && hasX(n.b)) { base = constValue(n.a); ex = n.b; }
    if (n.t === "fn" && n.f === "exp" && hasX(n.a)) { base = Math.E; ex = n.a; }
    if (base === null || ex === null) return;
    const l = linear(ex);
    if (!l || !(base > 0) || near(base, 1)) { ok = false; return; }
    nodes.push({ node: n, b: base, a: l.a, c: l.b });
  });
  if (!ok || !nodes.length) return null;

  const cands = [...(nodes.some((n) => near(n.b, Math.E)) ? [Math.E] : []), 2, 3, 5, 6, 7, 10, ...nodes.map((n) => n.b)];
  let p = 0;
  const mOf = new Map<ExpNode, number>();
  for (const cand of cands) {
    const okAll = nodes.every((n) => {
      const m = Math.log(n.b) / Math.log(cand);
      const mi = Math.round(m);
      return mi !== 0 && Math.abs(mi) <= 6 && near(m, mi, 1e-9) && near(mi * n.a, Math.round(mi * n.a), 1e-9);
    });
    if (okAll) {
      p = cand;
      for (const n of nodes) mOf.set(n, Math.round(Math.log(n.b) / Math.log(cand)));
      break;
    }
  }
  if (!p) return null;
  const isE = near(p, Math.E);
  const pBase = isE ? "e" : fmtNum(p);
  const pName = `${par(pBase)}^x`;
  const ids: string[] = [];

  const atom = (n: E): Rational | null => {
    if (n.t === "x") throw new Unsupported("x fuera del exponente");
    const en = nodes.find((z) => z.node === n);
    if (!en) {
      if (n.t === "fn" && hasX(n)) throw new Unsupported("otra función con x");
      return null;
    }
    const pw = Math.round(mOf.get(en)! * en.a);
    const k = Math.pow(en.b, en.c);
    const term = Rational.of(Poly.v("t")).pow(pw).mul(Rational.of(Poly.const(k)));
    const pwStr = pw === 1 ? pName : pw === -1 ? `1/${pName}` : pw > 0 ? `(${pName})${sup(pw)}` : `1/(${pName})${sup(-pw)}`;
    const rhs = near(k, 1) ? pwStr : `${fmtNum(k)}·${pwStr}`;
    if (show(n) !== rhs) ids.push(`${show(n)} = ${rhs}`);
    return term;
  };
  const R = toRational(N, atom);
  let P = R.n;
  if (P.vars().some((v) => v !== "t")) return null;
  const m = P.commonMono();
  if (m.t) P = P.divMono(m);
  P = P.monicSign();

  o.sub("Paso 1:");
  [...new Set(ids)].forEach((l) => o.p(l));
  if (R.d.constValue() === null) o.p(`(multiplico por ${pName}, que nunca es 0)`);
  o.pOnce(`${showPoly(P, { t: pName })} = 0`);
  o.gap();
  o.sub("Paso 2:");
  o.p(`t = ${pName}`);
  o.p(`${showPoly(P, { t: "t" })} = 0`);
  const tP = new Poly();
  P.coeffs("t").forEach((k, i) => tP.addTerm(k, i ? { x: i } : {}));
  const ts = solvePolyX(tP, o, "t").filter((t) => {
    if (t.v <= 1e-12) {
      o.strike(`t = ${t.s}  ✗ (${pName} siempre es > 0)`);
      return false;
    }
    return true;
  });
  o.gap();
  o.sub("Paso 3:");
  const lname = isE ? "ln" : logLabel(pBase);
  return ts.map((t) => {
    const r = Math.log(t.v) / Math.log(p);
    const exact = isExact(r);
    const res: Pt = exact ? pt(r) : { v: r, s: `${lname}(${t.s})`, approx: true };
    o.p(`${pName} = ${t.s} ⇒ x = ${lname}(${t.s})${exact ? ` = ${fmtNum(r)}` : ` ${dec(r)}`}`);
    o.casio(isE ? `ln → ${t.s} → =` : `log□■ → ${pBase} → ▶ → ${t.s} → =`);
    return res;
  });
}

// ---------- Ejercicio completo ----------

export function solveExpLog(f: E): Out {
  const o = new Out();
  walk(f, (n) => {
    if (n.t === "fn" && (n.f === "sin" || n.f === "cos" || n.f === "tan"))
      throw new SolverError("Tiene sin/cos/tan: elegí EJERCICIO 6.");
  });
  if (!hasX(f)) throw new SolverError("La función no tiene x.");

  const { inDf, conds } = domain(f, o);
  o.gap();

  o.h("3. Ceros (C0):");
  const N = f.t === "div" ? f.a : f;
  if (f.t === "div") {
    o.p(`f(x) = N/D = 0 ⇒ igualo SOLO el numerador:`);
    o.p(`${show(N)} = 0   (D = ${show(f.b)} ≠ 0 lo verifico al final)`);
  } else o.p(`f(x) = 0 ⇒ ${show(f)} = 0`);

  let M = N;
  while (M.t === "fn" && M.f === "sqrt") {
    o.p(`${show(M)} = 0 ⇒ ${show(M.a)} = 0`);
    M = M.a;
  }
  let hasLog = false;
  let hasExp = false;
  let hasRoot = false;
  walk(M, (n) => {
    if (isLogFn(n) && hasX(n.a)) hasLog = true;
    if ((n.t === "fn" && n.f === "exp" && hasX(n.a)) || (n.t === "pow" && hasX(n.b))) hasExp = true;
    if (n.t === "fn" && n.f === "sqrt" && hasX(n.a) && !hasLog) hasRoot = true;
  });

  const attempt = (fn: (o: Out) => Pt[] | null) => {
    const w = new Out(o.last());
    try {
      const r = fn(w);
      if (r) o.append(w);
      return r;
    } catch (err) {
      if (err instanceof Unsupported) return null;
      throw err;
    }
  };
  let cands: Pt[] | null = null;
  if (hasLog && !hasExp) cands = attempt((w) => logZeros(M, w));
  else if (hasExp && !hasLog) cands = attempt((w) => expZeros(M, w));
  else if (!hasLog && !hasExp && !hasRoot) cands = attempt((w) => polyZeros(M, w));
  if (!cands) {
    o.note("Esta combinación no tiene un despeje directo: busqué los ceros numéricamente (verificalos con CALC).");
    cands = scanRoots((x) => evaluate(N, x), -50, 50, 200000).map(pt);
    o.p(cands.length ? `Candidatos: ${join(cands.map((c) => `x = ${c.s}`))}` : "No encontré valores que la anulen en [−50 ; 50].");
  }

  o.gap();
  o.sub("Filtro (Df, denominador y CALC):");
  o.casio("Modo normal: MODE → 1");
  o.casio(`Escribir: ${casio(f)} → CALC → X = valor → =`);
  const zeros: Pt[] = [];
  for (const c of dedupePts(cands)) {
    const name = `x = ${lbl(c)}`;
    const den = conds.find((k) => k.op === "!=" && !check(k, c.v));
    if (den) { o.strike(`${name}  ✗ (anula el denominador: ${show(den.g)} = 0)`); continue; }
    if (!inDf(c.v)) { o.strike(`${name}  ✗ (fuera de Df)`); continue; }
    const v = evaluate(f, c.v);
    if (!Number.isFinite(v)) o.strike(`${name}  ✗ (CALC: Math ERROR)`);
    else if (Math.abs(v) > 1e-7) o.strike(`${name}  ✗ (CALC da ${fmtNum(v)} ≠ 0)`);
    else { o.ok(`${name}  ✓ CALC da 0`); zeros.push(c); }
  }
  o.gap();
  o.result(zeros.length ? `C0 = { ${join(zeros.map(lbl))} }` : "C0 = ∅ (no tiene ceros)");
  return o;
}
