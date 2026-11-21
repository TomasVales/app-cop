export type LineKind = "h" | "sub" | "p" | "casio" | "strike" | "ok" | "result" | "note" | "table";
/** Tabla de signos: columnas = intervalos, filas = N, D, Total (celdas "+", "−"). */
export type SignTable = { head: string[]; rows: { label: string; cells: string[] }[] };
export type Line = { kind: LineKind; text: string; table?: SignTable };

export class Out {
  lines: Line[] = [];
  /** `before`: última línea ya escrita fuera de este bloque (para no repetirla). */
  constructor(private before = "") {}
  h(text: string) { this.lines.push({ kind: "h", text }); }
  sub(text: string) { this.lines.push({ kind: "sub", text }); }
  p(text: string) { this.lines.push({ kind: "p", text }); }
  last() { return this.lines.length ? this.lines[this.lines.length - 1].text : this.before; }
  /** Agrega la línea solo si no repite la anterior. */
  pOnce(text: string) { if (this.last() !== text) this.p(text); }
  casio(text: string) { this.lines.push({ kind: "casio", text }); }
  strike(text: string) { this.lines.push({ kind: "strike", text }); }
  ok(text: string) { this.lines.push({ kind: "ok", text }); }
  result(text: string) { this.lines.push({ kind: "result", text }); }
  note(text: string) { this.lines.push({ kind: "note", text }); }
  gap() { this.lines.push({ kind: "p", text: "" }); }
  table(t: SignTable, text = "Tabla de signos") { this.lines.push({ kind: "table", text, table: t }); }
  append(o: Out) { this.lines.push(...o.lines); }
}

export const join = (xs: string[]) => xs.join(" ; ");
