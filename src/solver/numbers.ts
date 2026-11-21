// Reconocimiento de valores exactos, raíces de polinomios (nerdamer) y raíces numéricas.
import nerdamer from "nerdamer";

const TOL = 1e-9;
const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const M = "−";

type Exact =
  | { k: "rat"; p: number; q: number }
  | { k: "surd"; p: number; n: number; q: number } // p√n/q
  | { k: "quad"; a: number; b: number; n: number; q: number }; // (a + b√n)/q

function rat(v: number, maxQ = 12): { p: number; q: number } | null {
  for (let q = 1; q <= maxQ; q++) {
    const p = Math.round(v * q);
    if (Math.abs(p) < 1e7 && near(p / q, v)) {
      const g = gcd(p, q) || 1;
      return { p: p / g, q: q / g };
    }
  }
  return null;
}

export function recognize(v: number): Exact | null {
  if (!Number.isFinite(v)) return null;
  const r = rat(v);
  if (r) return { k: "rat", ...r };
  for (const n of [2, 3, 5, 6, 7, 10]) {
    const s = rat(v / Math.sqrt(n));
    if (s && s.p !== 0) return { k: "surd", p: s.p, n, q: s.q };
  }
  for (const n of [2, 3, 5, 6, 7, 10]) {
    for (let q = 1; q <= 6; q++) {
      for (let b = -3; b <= 3; b++) {
        if (!b) continue;
        const a = v * q - b * Math.sqrt(n);
        if (near(Math.round(a), a) && Math.round(a) !== 0) return { k: "quad", a: Math.round(a), b, n, q };
      }
    }
  }
  return null;
}

const sq = (n: number) => `√${n}`;

/** Número lindo para la hoja: 1/2, −√3/2, (1 + √5)/2 o ≈ 1.2346. */
export function fmtNum(v: number): string {
  const e = recognize(v);
  if (!e) return `≈ ${(Math.round(v * 1e4) / 1e4).toString().replace("-", M)}`;
  if (e.k === "rat") return `${e.p < 0 ? M : ""}${Math.abs(e.p)}${e.q !== 1 ? `/${e.q}` : ""}`;
  if (e.k === "surd") {
    const c = Math.abs(e.p) === 1 ? "" : String(Math.abs(e.p));
    return `${e.p < 0 ? M : ""}${c}${sq(e.n)}${e.q !== 1 ? `/${e.q}` : ""}`;
  }
  const bb = Math.abs(e.b) === 1 ? "" : String(Math.abs(e.b));
  const inner = `${e.a < 0 ? M : ""}${Math.abs(e.a)} ${e.b < 0 ? M : "+"} ${bb}${sq(e.n)}`;
  return e.q === 1 ? inner : `(${inner})/${e.q}`;
}

export const isExact = (v: number) => recognize(v) !== null;

/** Sintaxis nerdamer de un valor reconocido. */
function nerd(v: number): string | null {
  const e = recognize(v);
  if (!e) return null;
  if (e.k === "rat") return `(${e.p}/${e.q})`;
  if (e.k === "surd") return `(${e.p}*sqrt(${e.n})/${e.q})`;
  return `((${e.a}+(${e.b})*sqrt(${e.n}))/${e.q})`;
}

/** Ángulo en fracciones de π: π/6, 5π/3, 2π… */
export function fmtAngle(th: number): string {
  const r = rat(th / Math.PI, 24);
  if (!r) return fmtNum(th);
  if (r.p === 0) return "0";
  const sign = r.p < 0 ? M : "";
  const p = Math.abs(r.p);
  return `${sign}${p === 1 ? "" : p}π${r.q !== 1 ? `/${r.q}` : ""}`;
}

/** Fracción de π como la muestra la Casio: 1/6π. */
export function casioAngle(th: number): string {
  const r = rat(th / Math.PI, 24);
  if (!r) return (Math.round(th * 1e6) / 1e6).toString();
  if (r.p === 0) return "0";
  return `${r.p < 0 ? "-" : ""}${Math.abs(r.p)}${r.q !== 1 ? `/${r.q}` : ""}π`;
}

// ---------- Polinomios en una variable (coeficientes de menor a mayor grado) ----------

export function evalPoly(c: number[], t: number) {
  return c.reduceRight((acc, k) => acc * t + k, 0);
}

function trim(c: number[]): number[] {
  const out = [...c];
  const scale = Math.max(1, ...out.map(Math.abs));
  while (out.length > 1 && Math.abs(out[out.length - 1]) < 1e-12 * scale) out.pop();
  return out;
}

function dedupe(xs: number[]): number[] {
  const s = [...xs].sort((a, b) => a - b);
  return s.filter((x, i) => i === 0 || !near(x, s[i - 1], 1e-7));
}

function numericRoots(c: number[]): number[] {
  const deg = c.length - 1;
  if (deg < 1) return [];
  if (deg === 1) return [-c[0] / c[1]];
  if (deg === 2) {
    const [C, B, A] = c;
    const d = B * B - 4 * A * C;
    if (d < -1e-12 * Math.max(1, B * B)) return [];
    const s = Math.sqrt(Math.max(0, d));
    return dedupe([(-B - s) / (2 * A), (-B + s) / (2 * A)]);
  }
  // Durand–Kerner
  const a = c.map((k) => k / c[deg]);
  let z = Array.from({ length: deg }, (_, i) => ({ re: Math.cos(0.4 + (2 * Math.PI * i) / deg) * 1.3, im: Math.sin(0.4 + (2 * Math.PI * i) / deg) * 1.3 }));
  const mul = (p: { re: number; im: number }, q: { re: number; im: number }) => ({ re: p.re * q.re - p.im * q.im, im: p.re * q.im + p.im * q.re });
  for (let it = 0; it < 800; it++) {
    z = z.map((zi, i) => {
      let num = { re: 1, im: 0 };
      let val = { re: 0, im: 0 };
      for (let k = deg; k >= 0; k--) val = { re: mul(val, zi).re + (k === deg ? 1 : a[k]), im: mul(val, zi).im };
      for (let j = 0; j < deg; j++) if (j !== i) num = mul(num, { re: zi.re - z[j].re, im: zi.im - z[j].im });
      const den = num.re * num.re + num.im * num.im || 1e-30;
      const q = { re: (val.re * num.re + val.im * num.im) / den, im: (val.im * num.re - val.re * num.im) / den };
      return { re: zi.re - q.re, im: zi.im - q.im };
    });
  }
  const dc = c.map((k, i) => k * i).slice(1);
  const real = z.filter((r) => Math.abs(r.im) < 1e-6).map((r) => {
    let x = r.re;
    for (let i = 0; i < 30; i++) {
      const d = evalPoly(dc, x);
      if (!d) break;
      x -= evalPoly(c, x) / d;
    }
    return x;
  });
  return dedupe(real);
}

/** Raíces reales: primero exactas con nerdamer.solve, verificadas contra el cálculo numérico. */
export function realRoots(coeffs: number[]): number[] {
  const c = trim(coeffs);
  const numeric = numericRoots(c);
  const parts = c.map((k, i) => (Math.abs(k) < 1e-14 ? null : [nerd(k), i] as const)).filter((p) => p !== null);
  if (c.length > 2 && parts.every((p) => p[0] !== null)) {
    try {
      const poly = parts.map(([k, i]) => `${k}*x^${i}`).join("+");
      const out = nerdamer.solve(poly, "x").toString().replace(/^\{|\}$/g, "");
      const vals = out
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !/\bi\b/.test(s))
        .map((s) => Number(nerdamer(s).evaluate().text("decimals" as never)))
        .filter((v) => Number.isFinite(v) && Math.abs(evalPoly(c, v)) < 1e-7 * Math.max(1, ...c.map(Math.abs)));
      const exact = dedupe(vals);
      if (exact.length === numeric.length && exact.every((v, i) => near(v, numeric[i], 1e-6))) return exact;
    } catch {
      // nerdamer no pudo: se usa el resultado numérico
    }
  }
  return numeric;
}

// ---------- Raíces numéricas de cualquier función ----------

export function scanRoots(f: (x: number) => number, lo: number, hi: number, samples = 20000): number[] {
  const out: number[] = [];
  const h = (hi - lo) / samples;
  let px = lo;
  let py = f(lo);
  const isZero = (y: number) => Number.isFinite(y) && Math.abs(y) < 1e-9;
  if (isZero(py)) out.push(lo);
  let ppy = NaN;
  for (let i = 1; i <= samples; i++) {
    const x = lo + i * h;
    const y = f(x);
    if (isZero(y)) out.push(x);
    else if (Number.isFinite(py) && Number.isFinite(y) && py * y < 0) {
      let a = px, b = x, fa = py;
      for (let k = 0; k < 80; k++) {
        const m = (a + b) / 2, fm = f(m);
        if (!Number.isFinite(fm)) break;
        if (fa * fm <= 0) b = m;
        else { a = m; fa = fm; }
      }
      const r = (a + b) / 2;
      if (Math.abs(f(r)) < 1e-6) out.push(r); // descarta polos (cambio de signo por ±∞)
    } else if (Number.isFinite(ppy) && Number.isFinite(py) && Number.isFinite(y) && Math.abs(py) < Math.abs(ppy) && Math.abs(py) < Math.abs(y) && Math.abs(py) < 1e-3) {
      // raíz doble (toca y rebota): minimizar |f|
      let a = px - h, b = x;
      for (let k = 0; k < 100; k++) {
        const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
        if (Math.abs(f(m1)) < Math.abs(f(m2))) b = m2;
        else a = m1;
      }
      const r = (a + b) / 2;
      if (Math.abs(f(r)) < 1e-8) out.push(r);
    }
    ppy = py;
    px = x;
    py = y;
  }
  return dedupe(out).map((r) => {
    const e = recognize(r);
    return e ? snap(r) : r;
  });
}

/** Redondea a su valor exacto reconocido (evita 0.49999999). */
export function snap(v: number): number {
  const e = recognize(v);
  if (!e) return v;
  if (e.k === "rat") return e.p / e.q;
  if (e.k === "surd") return (e.p * Math.sqrt(e.n)) / e.q;
  return (e.a + e.b * Math.sqrt(e.n)) / e.q;
}

export { near };
