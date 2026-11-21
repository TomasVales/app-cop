// Polinomios multivariables (coeficientes reales) y funciones racionales N/D sobre "átomos"
// como sin(x), cos(x), tan(x), 2^x, ln(x+1) o la misma x.
import { constValue, hasX, type E, SolverError, sup } from "./ast";
import { fmtNum } from "./numbers";

export type Mono = Record<string, number>;
type Term = { c: number; m: Mono };

const key = (m: Mono) =>
  Object.keys(m)
    .filter((k) => m[k])
    .sort()
    .map((k) => `${k}^${m[k]}`)
    .join("*");

export class Poly {
  terms = new Map<string, Term>();

  static const(c: number) {
    const p = new Poly();
    p.addTerm(c, {});
    return p;
  }
  static v(name: string) {
    const p = new Poly();
    p.addTerm(1, { [name]: 1 });
    return p;
  }

  addTerm(c: number, m: Mono) {
    const mm: Mono = {};
    for (const k of Object.keys(m)) if (m[k]) mm[k] = m[k];
    const k = key(mm);
    const cur = this.terms.get(k);
    const nc = (cur?.c ?? 0) + c;
    if (Math.abs(nc) < 1e-12) this.terms.delete(k);
    else this.terms.set(k, { c: nc, m: mm });
  }

  list(): Term[] {
    return [...this.terms.values()];
  }
  add(o: Poly) {
    const r = this.clone();
    for (const t of o.list()) r.addTerm(t.c, t.m);
    return r;
  }
  scale(s: number) {
    const r = new Poly();
    for (const t of this.list()) r.addTerm(t.c * s, t.m);
    return r;
  }
  sub(o: Poly) {
    return this.add(o.scale(-1));
  }
  mul(o: Poly) {
    const r = new Poly();
    for (const a of this.list())
      for (const b of o.list()) {
        const m: Mono = { ...a.m };
        for (const k of Object.keys(b.m)) m[k] = (m[k] ?? 0) + b.m[k];
        r.addTerm(a.c * b.c, m);
      }
    return r;
  }
  pow(n: number) {
    let r = Poly.const(1);
    for (let i = 0; i < n; i++) r = r.mul(this);
    return r;
  }
  clone() {
    const r = new Poly();
    for (const t of this.list()) r.addTerm(t.c, t.m);
    return r;
  }
  isZero() {
    return this.terms.size === 0;
  }
  constValue(): number | null {
    if (this.isZero()) return 0;
    if (this.terms.size === 1 && this.terms.has("")) return this.terms.get("")!.c;
    return null;
  }
  vars(): string[] {
    const s = new Set<string>();
    for (const t of this.list()) for (const k of Object.keys(t.m)) s.add(k);
    return [...s].sort();
  }
  degree(v: string) {
    return Math.max(0, ...this.list().map((t) => t.m[v] ?? 0));
  }
  totalDegree() {
    return Math.max(0, ...this.list().map((t) => Object.values(t.m).reduce((a, b) => a + b, 0)));
  }
  /** Coeficientes [c0, c1, …] si el polinomio depende de una sola variable. */
  coeffs(v: string): number[] {
    const out = Array(this.degree(v) + 1).fill(0);
    for (const t of this.list()) out[t.m[v] ?? 0] += t.c;
    return out;
  }
  /** Factor común monomial (mínimo exponente de cada variable). */
  commonMono(): Mono {
    const ts = this.list();
    const m: Mono = {};
    if (!ts.length) return m;
    for (const v of this.vars()) {
      const e = Math.min(...ts.map((t) => t.m[v] ?? 0));
      if (e > 0) m[v] = e;
    }
    return m;
  }
  divMono(d: Mono) {
    const r = new Poly();
    for (const t of this.list()) {
      const m: Mono = { ...t.m };
      for (const k of Object.keys(d)) m[k] -= d[k];
      r.addTerm(t.c, m);
    }
    return r;
  }
  /** Reemplaza v^(2j) por q^j (todas las potencias de v deben ser pares). */
  substSquare(v: string, q: Poly) {
    let r = new Poly();
    for (const t of this.list()) {
      const e = t.m[v] ?? 0;
      const m: Mono = { ...t.m };
      delete m[v];
      const base = new Poly();
      base.addTerm(t.c, m);
      r = r.add(base.mul(q.pow(e / 2)));
    }
    return r;
  }
  /** Reemplaza una variable por una función racional. */
  substitute(v: string, val: Rational): Rational {
    let r = Rational.of(Poly.const(0));
    for (const t of this.list()) {
      const e = t.m[v] ?? 0;
      const m: Mono = { ...t.m };
      delete m[v];
      const base = new Poly();
      base.addTerm(t.c, m);
      r = r.add(Rational.of(base).mul(val.pow(e)));
    }
    return r;
  }
  evalAt(vals: Record<string, number>) {
    let s = 0;
    for (const t of this.list()) {
      let p = t.c;
      for (const k of Object.keys(t.m)) p *= Math.pow(vals[k], t.m[k]);
      s += p;
    }
    return s;
  }
  /** Normaliza para que el coeficiente principal sea positivo (no cambia la ecuación = 0). */
  monicSign() {
    if (this.constValue() !== null) return this;
    const lead = this.sorted()[0];
    return lead && lead.c < 0 ? this.scale(-1) : this;
  }
  sorted(): Term[] {
    const deg = (t: Term) => Object.values(t.m).reduce((a, b) => a + b, 0);
    return this.list().sort((a, b) => deg(b) - deg(a) || key(a.m).localeCompare(key(b.m)));
  }
}

export class Rational {
  constructor(public n: Poly, public d: Poly) {}
  static of(p: Poly) {
    return new Rational(p, Poly.const(1));
  }
  private norm() {
    const dc = this.d.constValue();
    if (dc !== null && dc !== 0 && dc !== 1) return new Rational(this.n.scale(1 / dc), Poly.const(1));
    return this;
  }
  add(o: Rational) {
    if (this.d.constValue() === 1 && o.d.constValue() === 1) return Rational.of(this.n.add(o.n));
    return new Rational(this.n.mul(o.d).add(o.n.mul(this.d)), this.d.mul(o.d)).norm();
  }
  neg() {
    return new Rational(this.n.scale(-1), this.d);
  }
  sub(o: Rational) {
    return this.add(o.neg());
  }
  mul(o: Rational) {
    return new Rational(this.n.mul(o.n), this.d.mul(o.d)).norm();
  }
  div(o: Rational) {
    if (o.n.isZero()) throw new SolverError("División por cero.");
    return new Rational(this.n.mul(o.d), this.d.mul(o.n)).norm();
  }
  pow(k: number): Rational {
    if (k === 0) return Rational.of(Poly.const(1));
    if (k < 0) return Rational.of(Poly.const(1)).div(this.pow(-k));
    let r = Rational.of(Poly.const(1));
    for (let i = 0; i < k; i++) r = r.mul(this);
    return r;
  }
}

export class Unsupported extends Error {}

/** Convierte el AST en N/D sobre átomos. `atom` decide qué hacer con cada subexpresión con x. */
export function toRational(e: E, atom: (e: E) => Rational | null): Rational {
  const a = atom(e);
  if (a) return a;
  if (!hasX(e)) {
    const v = constValue(e);
    if (!Number.isFinite(v)) throw new Unsupported("constante inválida");
    return Rational.of(Poly.const(v));
  }
  const R = (x: E) => toRational(x, atom);
  switch (e.t) {
    case "neg": return R(e.a).neg();
    case "add": return R(e.a).add(R(e.b));
    case "sub": return R(e.a).sub(R(e.b));
    case "mul": return R(e.a).mul(R(e.b));
    case "div": return R(e.a).div(R(e.b));
    case "pow": {
      if (hasX(e.b)) throw new Unsupported("exponente con x");
      const k = constValue(e.b);
      if (!Number.isInteger(k) || Math.abs(k) > 12) throw new Unsupported("exponente no entero");
      return R(e.a).pow(k);
    }
  }
  throw new Unsupported("subexpresión no soportada");
}

// ---------- Impresión ----------

export type Names = Record<string, string>; // variable → texto ("sin|1" → "sin(x)")

function powName(name: string, k: number): string {
  if (k === 1) return name;
  const m = /^(sin|cos|tan|ln|log_(?:\([^)]*\)|[\w.π]+))\((.*)\)$/.exec(name);
  if (m) return `${m[1]}${sup(k)}(${m[2]})`;
  if (/^[a-zA-Z]$/.test(name)) return `${name}${sup(k)}`;
  return `(${name})${sup(k)}`;
}

export function showPoly(p: Poly, names: Names): string {
  const ts = p.sorted();
  if (!ts.length) return "0";
  return ts
    .map((t, i) => {
      const mono = Object.keys(t.m)
        .sort()
        .map((v) => powName(names[v] ?? v, t.m[v]))
        .join("·");
      const abs = Math.abs(t.c);
      let coef = mono && Math.abs(abs - 1) < 1e-12 ? "" : fmtNum(abs);
      if (coef.startsWith("≈ ")) coef = coef.slice(2);
      const sep = coef && mono ? (/^\d+$/.test(coef) && /^[a-z(]/.test(mono) ? "" : "·") : "";
      const body = `${coef}${sep}${mono}`;
      const neg = t.c < 0;
      return i === 0 ? `${neg ? "−" : ""}${body}` : ` ${neg ? "−" : "+"} ${body}`;
    })
    .join("");
}

/** a·(b) para mostrar factores. */
export function showFactor(p: Poly, names: Names): string {
  const s = showPoly(p, names);
  return p.terms.size > 1 ? `(${s})` : s;
}
