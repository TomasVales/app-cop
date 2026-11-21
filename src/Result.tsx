import { memo, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Line, SignTable } from "./solver";
import { segments, toTex } from "./render/displayTex";

// ---------- Fórmulas ----------

function texHtml(math: string, display = false): string | null {
  try {
    return katex.renderToString(toTex(math), { throwOnError: true, displayMode: display, output: "html" });
  } catch {
    return null;
  }
}

/** Renglón con texto normal y fórmulas en KaTeX. */
const Rich = memo(function Rich({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((s, i) => {
        if (!s.math) return <span key={i}>{s.s}</span>;
        const html = texHtml(s.s);
        return html ? <span key={i} dangerouslySetInnerHTML={{ __html: html }} /> : <span key={i}>{s.s}</span>;
      })}
    </>
  );
});

// ---------- Estructura en tarjetas ----------

type Block = { title?: string; items: Line[] };
type Card = { title: string; blocks: Block[] };
type CasioItem = { ctx: string; text: string };

function build(lines: Line[]) {
  const cards: Card[] = [];
  const casio: CasioItem[] = [];
  let card: Card | null = null;
  let block: Block | null = null;
  for (const l of lines) {
    if (l.kind === "h") {
      card = { title: l.text.replace(/^\d+\.\s*/, "").replace(/:$/, ""), blocks: [] };
      cards.push(card);
      block = null;
      continue;
    }
    if (!card) continue;
    if (l.kind === "sub") {
      block = { title: l.text.replace(/:$/, ""), items: [] };
      card.blocks.push(block);
      continue;
    }
    if (l.kind === "casio") {
      casio.push({ ctx: block?.title ? `${card.title} · ${block.title}` : card.title, text: l.text });
      continue;
    }
    if (!l.text && l.kind === "p") continue;
    if (!block) {
      block = { items: [] };
      card.blocks.push(block);
    }
    block.items.push(l);
  }
  return { cards, casio };
}

// ---------- Piezas ----------

function Sign({ v }: { v: string }) {
  const cls = v === "+" ? "text-emerald-700 bg-emerald-50" : v === "−" ? "text-rose-700 bg-rose-50" : "text-slate-500 bg-slate-100";
  return <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xl font-black ${cls}`}>{v}</span>;
}

function Table({ t, caption }: { t: SignTable; caption: string }) {
  return (
    <figure className="my-3">
      <figcaption className="mb-2 text-sm font-semibold text-slate-500">
        <Rich text={caption} />
      </figcaption>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-center text-base">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-2" />
              {t.head.map((h, i) => (
                <th key={i} className="whitespace-nowrap border-l border-slate-200 px-2 py-2 text-sm font-normal">
                  <Rich text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => {
              const total = ri === t.rows.length - 1 && t.rows.length > 1;
              return (
                <tr key={ri} className={`border-t border-slate-200 ${total ? "bg-amber-50 font-bold" : ""}`}>
                  <th className={`sticky left-0 whitespace-nowrap px-2 py-1.5 text-left font-semibold ${total ? "bg-amber-50" : "bg-white"}`}>
                    <Rich text={r.label} />
                  </th>
                  {r.cells.map((c, ci) => (
                    <td key={ci} className="border-l border-slate-200 px-1 py-1.5">
                      <Sign v={c} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function Item({ l }: { l: Line }) {
  switch (l.kind) {
    case "table":
      return l.table ? <Table t={l.table} caption={l.text} /> : null;
    case "result":
      return (
        <div className="my-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-xl font-semibold text-slate-900">
          <Rich text={l.text} />
        </div>
      );
    case "strike": {
      const [math, reason] = l.text.split(/\s*✗\s*/);
      return (
        <p className="flex flex-wrap items-baseline gap-x-2 py-1">
          <span className="text-rose-600 line-through decoration-2">
            <Rich text={math} />
          </span>
          <span className="rounded-md bg-rose-100 px-2 text-base font-semibold text-rose-700">
            ✗ <Rich text={(reason ?? "").replace(/^\(|\)$/g, "")} />
          </span>
        </p>
      );
    }
    case "ok": {
      const [math, reason] = l.text.split(/\s*✓\s*/);
      return (
        <p className="flex flex-wrap items-baseline gap-x-2 py-1">
          <span className="text-emerald-700">
            <Rich text={math} />
          </span>
          <span className="rounded-md bg-emerald-100 px-2 text-base font-semibold text-emerald-700">
            ✓ <Rich text={reason ?? ""} />
          </span>
        </p>
      );
    }
    case "note":
      return (
        <p className="my-2 rounded-lg bg-orange-50 px-3 py-2 text-base text-orange-800">
          ⚠ <Rich text={l.text} />
        </p>
      );
    default:
      if (l.text.startsWith("Opción directa:"))
        return (
          <p className="my-2 rounded-lg border border-dashed border-sky-300 bg-sky-50 px-3 py-2 text-sky-900">
            <span className="font-semibold">💡 Opción directa: </span>
            <Rich text={l.text.slice("Opción directa:".length).trim()} />
          </p>
        );
      return (
        <p className="py-1">
          <Rich text={l.text} />
        </p>
      );
  }
}

// ---------- Casio ----------

const KEYS = new Set(["MODE", "SHIFT", "CALC", "=", "▶", "sin", "cos", "tan", "ln", "log□■", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-10 items-center justify-center rounded-lg border-b-4 border-slate-950 bg-slate-700 px-2.5 py-1 font-sans text-base font-bold text-white shadow">
      {children}
    </kbd>
  );
}

function CasioLine({ text }: { text: string }) {
  const m = /^([^:→]+):\s*(.*)$/.exec(text);
  const label = m?.[1];
  const body = m ? m[2] : text;
  const parts: ReactNode[] = [];
  body.split(/\s*→\s*/).forEach((tok, i) => {
    if (i) parts.push(<span key={`a${i}`} className="text-slate-500">→</span>);
    const [main, res] = tok.split(/\s*⇒\s*/);
    if (/^=(\s+=)*$/.test(main)) main.split(/\s+/).forEach((_, j) => parts.push(<Kbd key={`${i}e${j}`}>=</Kbd>));
    else if (KEYS.has(main)) parts.push(<Kbd key={i}>{main === "log□■" ? "log□■" : main}</Kbd>);
    else if (/^[\d.\/−-]+(\s*=\s*[\d.\/−-]+)*\s*=$/.test(main)) {
      // carga de coeficientes: "1 = −1/2 = 0 ="
      main.split(/\s*=\s*/).forEach((v, j, arr) => {
        if (v) parts.push(<span key={`${i}v${j}`} className="font-mono text-amber-200">{v}</span>);
        if (j < arr.length - 1) parts.push(<Kbd key={`${i}k${j}`}>=</Kbd>);
      });
    } else if (label === "Escribir" && i === 0)
      parts.push(<code key={i} className="block w-full rounded-lg bg-slate-950 px-3 py-2 font-mono text-base text-amber-200">{main}</code>);
    else parts.push(<span key={i} className="font-mono text-amber-200">{main}</span>);
    if (res) parts.push(<span key={`r${i}`} className="text-slate-300">⇒ pantalla: <b className="font-mono text-white">{res}</b></span>);
  });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && <span className="mr-1 text-sm font-semibold uppercase tracking-wide text-slate-400">{label}</span>}
      {parts}
    </div>
  );
}

// ---------- Pantalla ----------

export default function Result({ fx, exercise, lines, onBack }: { fx: string; exercise: number; lines: Line[]; onBack: () => void }) {
  const { cards, casio } = build(lines);
  return (
    <main className="min-h-dvh bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <p className="text-sm font-black uppercase tracking-wider text-amber-600">Escribí esto en la hoja · Ej {exercise}</p>
        <p className="mt-1 overflow-x-auto text-xl">
          <Rich text={`f(x) = ${fx}`} />
        </p>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {cards.map((c, ci) => (
          <section key={ci} className="sheet rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-black text-slate-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm text-slate-900">{ci + 1}</span>
              <Rich text={c.title} />
            </h2>
            {c.blocks.map((b, bi) => (
              <div key={bi} className={b.title ? "mt-3 border-l-4 border-amber-300 pl-3" : ""}>
                {b.title && <h3 className="mb-1 text-base font-bold text-amber-700">{b.title}</h3>}
                <div className="text-lg leading-relaxed">
                  {b.items.map((l, li) => (
                    <Item key={li} l={l} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}

        {casio.length > 0 && (
          <section className="rounded-2xl bg-slate-900 p-4 text-white shadow-lg">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
              <span className="rounded-md bg-slate-700 px-2 py-0.5 font-mono text-sm">fx-570</span> Calculadora Casio
            </h2>
            <ol className="flex flex-col gap-3">
              {casio.map((c, i) => (
                <li key={i} className="rounded-xl bg-slate-800 p-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{c.ctx}</p>
                  <CasioLine text={c.text} />
                </li>
              ))}
            </ol>
          </section>
        )}

        <button onClick={onBack} className="w-full rounded-2xl bg-slate-900 py-5 text-xl font-black text-white active:scale-[0.98]">
          ← OTRO EJERCICIO
        </button>
      </div>
    </main>
  );
}
