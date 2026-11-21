// Convierte la notación "de hoja" que escribe el solver (√((2x − 4)/(x² − 9)), log_(1/2)(x), 5π/6…)
// a LaTeX para KaTeX, y separa cada renglón en texto y fórmulas.

type Tok = { v: string; sp: boolean }; // sp: había un espacio antes

const SUP: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
const SUB: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4" };
const REL: Record<string, string> = {
  "=": "=", "≠": "\\neq", "<": "<", ">": ">", "≤": "\\leq", "≥": "\\geq", "⇒": "\\Rightarrow", "≈": "\\approx",
  "∈": "\\in", U: "\\cup", "\\": "\\setminus", "→": "\\to",
};
const FUNCS = new Set(["sin", "cos", "tan", "ln"]);
const LETTERS = new Set(["x", "t", "u", "k", "e", "f", "A", "B", "C", "N", "D", "T", "X", "R", "Df", "C0", "a", "b"]);
const GREEK: Record<string, string> = { "π": "\\pi", "α": "\\alpha", "θ": "\\theta" };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s+|\d+(?:\.\d+)?|[A-Za-z]+\d?|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+|[₀₁₂₃₄]|./gu;
  let sp = false;
  for (const m of s.matchAll(re)) {
    if (/^\s+$/.test(m[0])) { sp = true; continue; }
    out.push({ v: m[0], sp });
    sp = false;
  }
  return out;
}

type Unit = { tex: string; inner?: string };

class Parser {
  i = 0;
  constructor(private t: Tok[]) {}
  peek(o = 0) { return this.t[this.i + o]?.v; }
  next() { return this.t[this.i++]?.v; }
  eat(v: string) {
    if (this.peek() !== v) throw new Error(`esperaba ${v}`);
    this.i++;
  }
  done() { return this.i >= this.t.length; }

  seq(): string {
    const parts = [this.rel()];
    while (this.peek() === ";") { this.i++; parts.push(this.rel()); }
    return parts.join(";\\;");
  }
  rel(): string {
    let out = REL[this.peek() ?? ""] ? "" : this.expr();
    while (REL[this.peek() ?? ""]) {
      const op = REL[this.next()!];
      const right = this.peek() === undefined || this.peek() === ";" ? "" : this.expr();
      out += ` ${op} ${right}`;
    }
    return out;
  }
  expr(): string {
    let out = "";
    if (this.peek() === "−" || this.peek() === "-") { this.i++; out = "-"; }
    else if (this.peek() === "+") { this.i++; out = "+"; }
    out += this.term();
    while (this.peek() === "+" || this.peek() === "−" || this.peek() === "-") {
      const op = this.next() === "+" ? "+" : "-";
      out += ` ${op} ${this.term()}`;
    }
    return out;
  }
  startsUnit(v: string | undefined) {
    if (v === undefined) return false;
    return /^\d/.test(v) || v === "(" || v === "[" || v === "{" || v === "√" || v in GREEK || v === "∞" || v === "∅" ||
      FUNCS.has(v) || v === "log" || v === "sqrt" || (LETTERS.has(v) && v !== "U");
  }
  term(): string {
    const fs: Unit[] = [this.pow()];
    const seps: string[] = [];
    for (;;) {
      const v = this.peek();
      if (v === "·" || v === "*") { this.i++; seps.push("\\cdot "); fs.push(this.pow()); }
      else if (v === "/" || v === "÷") {
        this.i++;
        const a = fs.pop()!;
        const b = this.pow();
        fs.push({ tex: `\\frac{${a.inner ?? a.tex}}{${b.inner ?? b.tex}}` });
      } else if (this.startsUnit(v)) { seps.push(" "); fs.push(this.pow()); }
      else break;
    }
    return fs.map((f, k) => (k ? seps[k - 1] : "") + f.tex).join("");
  }
  pow(): Unit {
    let u = this.unit();
    for (;;) {
      const v = this.peek();
      if (v && /^[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+$/.test(v)) {
        this.i++;
        u = { tex: `${u.tex}^{${[...v].map((c) => SUP[c]).join("")}}` };
      } else if (v === "^") {
        this.i++;
        let e: string;
        if (this.peek() === "(") e = this.group().inner!;
        else if (this.peek() === "−" || this.peek() === "-") { this.i++; e = `-${this.unit().tex}`; }
        else e = this.unit().tex;
        u = { tex: `${u.tex}^{${e}}` };
      } else if (v && v in SUB) {
        this.i++;
        u = { tex: `${u.tex}_{${SUB[v]}}` };
      } else return u;
    }
  }
  group(): Unit {
    const open = this.next()!;
    const close = open === "(" ? ")" : open === "[" ? "]" : "}";
    // intervalo o conjunto: (a ; b), [a ; b), { a ; b }
    const start = this.i;
    let depth = 0;
    let interval = false;
    for (let j = this.i; j < this.t.length; j++) {
      const v = this.t[j].v;
      if (v === "(" || v === "[" || v === "{") depth++;
      else if (v === ")" || v === "]" || v === "}") { if (depth === 0) break; depth--; }
      else if (v === ";" && depth === 0) interval = true;
    }
    this.i = start;
    if (open === "{") {
      const items = this.peek() === "}" ? [] : [this.rel()];
      while (this.peek() === ";") { this.i++; items.push(this.rel()); }
      this.eat("}");
      return { tex: `\\left\\{ ${items.join(";\\; ")} \\right\\}` };
    }
    if (interval) {
      const a = this.expr();
      this.eat(";");
      const b = this.expr();
      const c = this.next();
      if (c !== ")" && c !== "]") throw new Error("intervalo");
      return { tex: `\\left${open === "[" ? "[" : "("} ${a};\\, ${b} \\right${c}` };
    }
    const inner = this.seq();
    this.eat(close);
    return { tex: `\\left(${inner}\\right)`, inner };
  }
  unit(): Unit {
    const v = this.peek();
    if (v === undefined) throw new Error("fin");
    if (/^\d/.test(v)) {
      this.i++;
      // 5π, 2x, 3√2: coeficiente pegado
      const n = this.t[this.i];
      if (n && !n.sp && (n.v in GREEK || n.v === "x" || n.v === "t" || n.v === "e")) {
        this.i++;
        return { tex: `${v}${GREEK[n.v] ?? n.v}` };
      }
      return { tex: v };
    }
    if (v === "(" || v === "[" || v === "{") return this.group();
    if (v === "√" || v === "sqrt") {
      this.i++;
      const u = this.peek() === "(" ? this.group() : this.unit();
      return { tex: `\\sqrt{${u.inner ?? u.tex}}` };
    }
    if (v in GREEK) { this.i++; return { tex: GREEK[v] }; }
    if (v === "∞") { this.i++; return { tex: "\\infty" }; }
    if (v === "∅") { this.i++; return { tex: "\\emptyset" }; }
    if (FUNCS.has(v)) {
      this.i++;
      let p = "";
      const s = this.peek();
      if (s && /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/.test(s)) { this.i++; p = `^{${[...s].map((c) => SUP[c]).join("")}}`; }
      if (this.peek() !== "(") return { tex: `\\${v}${p}` };
      const g = this.group();
      return { tex: `\\${v}${p}${g.tex}` };
    }
    if (v === "log") {
      this.i++;
      let base = "";
      if (this.peek() === "_") {
        this.i++;
        const b = this.peek() === "(" ? this.group() : this.unit();
        base = `_{${b.inner ?? b.tex}}`;
      }
      let p = "";
      const s = this.peek();
      if (s && /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/.test(s)) { this.i++; p = `^{${[...s].map((c) => SUP[c]).join("")}}`; }
      if (this.peek() !== "(") return { tex: `\\log${base}${p}` };
      return { tex: `\\log${base}${p}${this.group().tex}` };
    }
    if (LETTERS.has(v)) {
      this.i++;
      if (v === "R") return { tex: "\\mathbb{R}" };
      if (v === "Df") return { tex: "D_f" };
      if (v === "C0") return { tex: "C_0" };
      return { tex: v };
    }
    throw new Error(`no sé leer ${v}`);
  }
}

/** Fórmula de hoja → LaTeX (lanza error si no la entiende). */
export function toTex(math: string): string {
  const p = new Parser(tokenize(math));
  const out = p.seq();
  if (!p.done()) throw new Error("sobra texto");
  return out;
}

// ---------- Separar renglones en texto y fórmulas ----------

export type Seg = { math: boolean; s: string };

const MATH_WORDS = new Set(["sin", "cos", "tan", "ln", "log", "sqrt", "Df", "C0", "U"]);
const TEXT_SINGLE = new Set(["ó", "o", "y", "a", "é"]);

function isTextWord(w: string) {
  if (!/^[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]+\d?$/.test(w)) return false;
  if (MATH_WORDS.has(w)) return false;
  if (w.length === 1) return TEXT_SINGLE.has(w);
  return true;
}

function balance(s: string) {
  let d = 0;
  for (const c of s) {
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
  }
  return d;
}

export function segments(line: string): Seg[] {
  const parts = line.match(/[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]+\d?|\s+|./gu) ?? [];
  const raw: Seg[] = [];
  for (const p of parts) {
    const text = isTextWord(p) || /[✓✗⚠🖩]/u.test(p);
    const last = raw[raw.length - 1];
    if (/^\s+$/.test(p) && last) { last.s += p; continue; }
    if (last && last.math === !text) last.s += p;
    else raw.push({ math: !text, s: p });
  }
  // recortar puntuación y paréntesis sueltos en los bordes de cada fórmula
  const out: Seg[] = [];
  const pushText = (s: string) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && !last.math) last.s += s;
    else out.push({ math: false, s });
  };
  // ": " corta fórmulas ("Sumando 2π dentro de [0 ; 2π]: 2π")
  const pieces: Seg[] = raw.flatMap((seg) =>
    seg.math ? seg.s.split(/(:\s+)/).map((s, i) => ({ math: i % 2 === 0, s })) : [seg],
  );
  for (const seg of pieces) {
    if (!seg.math) { pushText(seg.s); continue; }
    let s = seg.s;
    let pre = "";
    let post = "";
    for (;;) {
      const m = /^(\s+|[:,.]|\()/.exec(s);
      if (!m) break;
      if (m[0] === "(" && balance(s) <= 0) break;
      pre += m[0];
      s = s.slice(m[0].length);
    }
    for (;;) {
      const m = /(\s+|[:,.]|\)|\()$/.exec(s);
      if (!m) break;
      if (m[0] === ")" && balance(s) >= 0) break;
      if (m[0] === "(" && balance(s) <= 0) break;
      post = m[0] + post;
      s = s.slice(0, -m[0].length);
    }
    pushText(pre);
    if (s.trim()) {
      try {
        toTex(s);
        out.push({ math: true, s });
      } catch {
        pushText(s);
      }
    }
    pushText(post);
  }
  return out;
}
