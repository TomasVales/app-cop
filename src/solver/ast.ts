// Parser (mathjs) → AST propio + evaluador numérico + impresión para hoja y Casio.
import { create, parseDependencies, type MathNode } from "mathjs";

const math = create({ parseDependencies });

export type Fn = "sin" | "cos" | "tan" | "sqrt" | "ln" | "log" | "exp";
export type E =
  | { t: "num"; v: number }
  | { t: "x" }
  | { t: "pi" }
  | { t: "e" }
  | { t: "neg"; a: E }
  | { t: "add" | "sub" | "mul" | "div" | "pow"; a: E; b: E }
  | { t: "fn"; f: Fn; a: E; base?: number; baseStr?: string };

export class SolverError extends Error {}

const PI = Math.PI;
const EPS = 1e-12;

// ---------- Preprocesado del texto del usuario ----------

function findClose(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

export function preprocess(raw: string): string {
  let s = raw
    .replace(/^\s*f\s*\(\s*x\s*\)\s*=/i, "")
    // salida ascii-math de MathLive: "log _(b)(u)", "cos ^2(x)", "sin (x)"
    .replace(/\blog\s+_/g, "log_")
    .replace(/=\s*0\s*$/, "")
    .replace(/[−–]/g, "-")
    .replace(/[·×]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/,/g, ".")
    .replace(/X/g, "x")
    .replace(/π/g, "pi")
    .replace(/\bsen(?=[\s(\d.x^])/g, "sin")
    .replace(/\btg(?=[\s(\d.x^])/g, "tan")
    .replace(/\blog\s*\(/g, "log_(10)(")
    .replace(/\blog_\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?|e|pi|π)\s*\(/g, "log_($1)(")
    .replace(/√\s*(\d+(\.\d+)?|x|pi)/g, "sqrt($1)")
    .replace(/√\s*\(/g, "sqrt(");

  // log_(base)(u)  →  log((u), (base))   [cambio de base al evaluar]
  for (let i = s.indexOf("log_("); i >= 0; i = s.indexOf("log_(")) {
    const bOpen = i + 4;
    const bClose = findClose(s, bOpen);
    if (bClose < 0) throw new SolverError("Falta cerrar el paréntesis de la base del log.");
    let aOpen = bClose + 1;
    while (s[aOpen] === " ") aOpen++;
    if (s[aOpen] !== "(") throw new SolverError("Después de log_(base) va el argumento entre paréntesis: log_(2)(x).");
    const aClose = findClose(s, aOpen);
    if (aClose < 0) throw new SolverError("Falta cerrar el paréntesis del log.");
    const base = s.slice(bOpen + 1, bClose).trim();
    const arg = s.slice(aOpen + 1, aClose).trim();
    if (!base) throw new SolverError("Escribí la base del log: log_(base)(…).");
    if (!arg) throw new SolverError("El log está vacío: escribí su argumento.");
    s = `${s.slice(0, i)}log((${arg}), (${base}))${s.slice(aClose + 1)}`;
  }

  if (/\(\s*\)/.test(s)) throw new SolverError("Hay un casillero vacío: completalo o borralo.");

  // sin^2(x) | sin²(x) | sin2(x)  →  (sin(x))^2
  const powFn = /(sin|cos|tan)\s*(?:\^\s*(\d+)|(\d+))\s*\(/;
  for (let m = powFn.exec(s); m; m = powFn.exec(s)) {
    const open = m.index + m[0].length - 1;
    const close = findClose(s, open);
    if (close < 0) break;
    s = `${s.slice(0, m.index)}(${m[1]}${s.slice(open, close + 1)})^${m[2] ?? m[3]}${s.slice(close + 1)}`;
  }
  // cos^2x | cos ^2 x  →  (cos(x))^2
  s = s.replace(/\b(sin|cos|tan)\s*\^\s*(\d+)\s*(\d*\.?\d*\s*x)(?![\w(])/g, "($1($3))^$2");
  // sinx | sin 2x  →  sin(x) | sin(2x)
  s = s.replace(/\b(sin|cos|tan|ln)\s*(\d*\.?\d*\s*x)(?![\w(])/g, "$1($2)");
  // 1/2sin(x) → (1/2)*sin(x)
  s = s.replace(/(^|[^\w.)])(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(?=[a-z(])/g, "$1($2/$3)*");
  // x(…) y )(…) como multiplicación
  s = s.replace(/(?<![a-z])x\s*\(/g, "x*(").replace(/\)\s*\(/g, ")*(");
  // ")" seguido de algo = multiplicación explícita. Así (1)/(2)sin(x) es (1/2)·sin(x)
  // y no 1/(2·sin(x)): una fracción dibujada vale como un bloque.
  s = s.replace(/\)\s*(?=[a-z\d√])/gi, ")*");
  return s;
}

// ---------- Conversión mathjs → AST propio ----------

function convert(n: MathNode): E {
  const node = n as any;
  switch (n.type) {
    case "ParenthesisNode":
      return convert(node.content);
    case "ConstantNode": {
      const v = Number(node.value);
      if (!Number.isFinite(v)) throw new SolverError(`No entiendo "${node.value}".`);
      return { t: "num", v };
    }
    case "SymbolNode": {
      const name: string = node.name;
      if (name === "x") return { t: "x" };
      if (name === "pi") return { t: "pi" };
      if (name === "e") return { t: "e" };
      throw new SolverError(`No reconozco "${name}". Usá solo la variable x.`);
    }
    case "OperatorNode": {
      const args: E[] = node.args.map(convert);
      switch (node.fn) {
        case "add": return { t: "add", a: args[0], b: args[1] };
        case "subtract": return { t: "sub", a: args[0], b: args[1] };
        case "multiply": return { t: "mul", a: args[0], b: args[1] };
        case "divide": return { t: "div", a: args[0], b: args[1] };
        case "pow": return { t: "pow", a: args[0], b: args[1] };
        case "unaryMinus": return { t: "neg", a: args[0] };
        case "unaryPlus": return args[0];
      }
      throw new SolverError(`Operador no soportado: ${node.op}`);
    }
    case "FunctionNode": {
      const name: string = node.fn.name;
      if (name === "log" && node.args.length === 2) {
        const a = convert(node.args[0]);
        const be = convert(node.args[1]);
        if (hasX(be)) throw new SolverError("La base del log no puede tener x.");
        const base = constValue(be);
        if (!(base > 0) || Math.abs(base - 1) < 1e-12) throw new SolverError("La base del logaritmo tiene que ser positiva y distinta de 1.");
        return { t: "fn", f: "log", a, base, baseStr: show(be) };
      }
      if (node.args.length !== 1) throw new SolverError(`${name}(…) lleva un solo argumento.`);
      const a = convert(node.args[0]);
      if (name === "sin" || name === "cos" || name === "tan" || name === "sqrt" || name === "ln" || name === "exp")
        return { t: "fn", f: name, a };
      if (name === "log2") return { t: "fn", f: "log", a, base: 2, baseStr: "2" };
      if (name === "log10") return { t: "fn", f: "log", a, base: 10, baseStr: "10" };
      if (name.startsWith("log_")) throw new SolverError("Escribí la base del log con números: log_(1/2)(…), log_5(…).");
      throw new SolverError(`Función no soportada: ${name}`);
    }
  }
  throw new SolverError("No pude interpretar la función.");
}

export function parseInput(raw: string): E {
  const s = preprocess(raw);
  if (!s.trim()) throw new SolverError("Escribí una función.");
  let node: MathNode;
  try {
    node = math.parse(s);
  } catch {
    throw new SolverError("Error de sintaxis: revisá paréntesis y operadores.");
  }
  return convert(node);
}

// ---------- Utilidades ----------

export const num = (v: number): E => ({ t: "num", v });

export function hasX(e: E): boolean {
  switch (e.t) {
    case "x": return true;
    case "num": case "pi": case "e": return false;
    case "neg": case "fn": return hasX(e.a);
    default: return hasX(e.a) || hasX(e.b);
  }
}

export function walk(e: E, visit: (n: E) => void): void {
  visit(e);
  if (e.t === "neg" || e.t === "fn") walk(e.a, visit);
  else if ("b" in e) {
    walk(e.a, visit);
    walk(e.b, visit);
  }
}

/** Evalúa f(x). Devuelve NaN donde la Casio daría Math ERROR. */
export function evaluate(e: E, x: number): number {
  switch (e.t) {
    case "num": return e.v;
    case "x": return x;
    case "pi": return PI;
    case "e": return Math.E;
    case "neg": return -evaluate(e.a, x);
    case "add": return evaluate(e.a, x) + evaluate(e.b, x);
    case "sub": return evaluate(e.a, x) - evaluate(e.b, x);
    case "mul": return evaluate(e.a, x) * evaluate(e.b, x);
    case "div": {
      const d = evaluate(e.b, x);
      return Math.abs(d) < EPS ? NaN : evaluate(e.a, x) / d;
    }
    case "pow": {
      const b = evaluate(e.a, x);
      const p = evaluate(e.b, x);
      if (b === 0 && p < 0) return NaN;
      return Math.pow(b, p);
    }
    case "fn": {
      const a = evaluate(e.a, x);
      switch (e.f) {
        case "sin": return Math.sin(a);
        case "cos": return Math.cos(a);
        case "tan": return Math.abs(Math.cos(a)) < 1e-10 ? NaN : Math.tan(a);
        case "sqrt": return a < -1e-12 ? NaN : Math.sqrt(Math.max(0, a));
        case "exp": return Math.exp(a);
        case "ln": return a <= 1e-14 ? NaN : Math.log(a);
        case "log": return a <= 1e-14 ? NaN : Math.log(a) / Math.log(e.base!);
      }
    }
  }
}

export const constValue = (e: E): number => evaluate(e, NaN);

/** Si e es lineal en x devuelve {a, b} con e = a·x + b. */
export function linear(e: E): { a: number; b: number } | null {
  const f = (x: number) => evaluate(e, x);
  const b = f(0);
  const a = f(1) - b;
  if (![a, b].every(Number.isFinite)) return null;
  for (const x of [2, -1.7, 0.37]) if (Math.abs(f(x) - (a * x + b)) > 1e-9 * (1 + Math.abs(a * x + b))) return null;
  return { a, b };
}

// ---------- Impresión ----------

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
export const sup = (n: number) => String(n).split("").map((c) => SUP[c] ?? c).join("");

const PREC: Record<string, number> = { add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4 };
const prec = (e: E) => PREC[e.t] ?? 5;

function numStr(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  return (r < 0 ? "−" : "") + String(Math.abs(r));
}

export const logLabel = (baseStr: string) => (/^[\w.π]+$/.test(baseStr) ? `log_${baseStr}` : `log_(${baseStr})`);
const fnName = (e: Extract<E, { t: "fn" }>) =>
  e.f === "log" ? logLabel(e.baseStr ?? String(e.base)) : e.f === "sqrt" ? "√" : e.f;

/** Texto “de hoja”: 2sin(x), cos²(x), π/2 − x, e^(2x)… */
export function show(e: E): string {
  const wrap = (c: E, min: number) => (prec(c) < min ? `(${show(c)})` : show(c));
  switch (e.t) {
    case "num": return numStr(e.v);
    case "x": return "x";
    case "pi": return "π";
    case "e": return "e";
    case "neg": return `−${wrap(e.a, 3)}`;
    case "add": return `${show(e.a)} + ${wrap(e.b, 1)}`;
    case "sub": return `${show(e.a)} − ${wrap(e.b, 2)}`;
    case "mul": {
      const left = wrap(e.a, 2);
      const right = wrap(e.b, 3);
      const implicit = e.a.t === "num" && /^[a-zπ√(]/.test(right) && !right.startsWith("(") ;
      return implicit ? `${left}${right}` : `${left}·${right}`;
    }
    case "div": return `${wrap(e.a, 3)}/${wrap(e.b, 3)}`;
    case "pow": {
      if (e.a.t === "fn" && e.a.f !== "sqrt" && e.b.t === "num" && Number.isInteger(e.b.v) && e.b.v > 1)
        return `${fnName(e.a)}${sup(e.b.v)}(${show(e.a.a)})`;
      if (e.b.t === "num" && Number.isInteger(e.b.v) && e.b.v > 1) return `${wrap(e.a, 5)}${sup(e.b.v)}`;
      const ex = show(e.b);
      return `${wrap(e.a, 5)}^${/^(\d+(\.\d+)?|x|π|e)$/.test(ex) ? ex : `(${ex})`}`;
    }
    case "fn":
      if (e.f === "sqrt" && (e.a.t === "num" || e.a.t === "x")) return `√${show(e.a)}`;
      return `${fnName(e)}(${show(e.a)})`;
  }
}

/** Texto para tipear en la Casio (X, ÷, paréntesis explícitos). */
export function casio(e: E): string {
  const wrap = (c: E, min: number) => (prec(c) < min ? `(${casio(c)})` : casio(c));
  switch (e.t) {
    case "num": return numStr(e.v).replace("−", "-");
    case "x": return "X";
    case "pi": return "π";
    case "e": return "e";
    case "neg": return `-${wrap(e.a, 3)}`;
    case "add": return `${casio(e.a)} + ${wrap(e.b, 1)}`;
    case "sub": return `${casio(e.a)} - ${wrap(e.b, 2)}`;
    case "mul": return `${wrap(e.a, 2)}${wrap(e.b, 3)}`;
    case "div": return `(${wrap(e.a, 3)} ÷ ${wrap(e.b, 3)})`;
    case "pow": {
      const base = e.a.t === "x" || e.a.t === "e" || e.a.t === "pi" || e.a.t === "num" && e.a.v >= 0 ? casio(e.a) : `(${casio(e.a)})`;
      return `${base}^${e.b.t === "num" && e.b.v >= 0 ? casio(e.b) : `(${casio(e.b)})`}`;
    }
    case "fn":
      if (e.f === "log") return `${logLabel(e.baseStr ?? String(e.base)).replace("−", "-")}(${casio(e.a)})`;
      return `${e.f === "sqrt" ? "√" : e.f}(${casio(e.a)})`;
  }
}
