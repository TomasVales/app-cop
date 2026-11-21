import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import MathInput from "./MathInput";
import Result from "./Result";
import type { Line } from "./solver";

// El motor (nerdamer + mathjs) se carga aparte, en segundo plano, para que la pantalla aparezca rápido.
type Engine = typeof import("./solver");
const loadEngine = () => import("./solver");

type Exercise = 5 | 6;

/** Botón del teclado: inserta LaTeX en el campo visual (#0 = cursor / selección, #? = casillero). */
type Key = { label: string; latex: string; wide?: boolean; aria?: string };
const k = (label: string, latex: string, wide = false, aria?: string): Key => ({ label, latex, wide, aria });
const fn = (name: string): Key => k(`${name} □`, `\\${name}\\left(#0\\right)`);

const DIGITS: Key[] = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "x"].map((d) => k(d, d));
const FIXED: Key[] = [
  k("□⁄□  fracción", "\\frac{#0}{#?}", true, "Fracción"),
  k("√□", "\\sqrt{#0}", false, "Raíz cuadrada"),
  k("x²", "^2", false, "Al cuadrado"),
  k("x^□", "^{#0}", false, "Exponente"),
  k("x⁻¹", "^{-1}", false, "Exponente menos uno"),
  k("( □ )", "\\left(#0\\right)", false, "Paréntesis"),
  k("+", "+"),
  k("−", "-"),
  k("·", "\\cdot"),
];
const KEYS: Record<Exercise, Key[]> = {
  5: [
    k("ln □", "\\ln\\left(#0\\right)"),
    k("log□ □  (base)", "\\log_{#0}\\left(#?\\right)", true, "Logaritmo con base"),
    k("log₂ □", "\\log_2\\left(#0\\right)"),
    k("log₃ □", "\\log_3\\left(#0\\right)"),
    k("e^□", "e^{#0}"),
    k("2^□", "2^{#0}"),
    k("3^□", "3^{#0}"),
  ],
  6: [fn("sin"), fn("cos"), fn("tan"), k("π", "\\pi"), k("π/2", "\\frac{\\pi}{2}"), k("2x", "2x")],
};

export default function App() {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [ascii, setAscii] = useState("");
  const [result, setResult] = useState<{ fx: string; lines: Line[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [abc, setAbc] = useState(false);
  const mfRef = useRef<MathfieldElement | null>(null);
  const latexRef = useRef(""); // se conserva al volver de la pantalla de resultado

  const [engine, setEngine] = useState<Engine | null>(null);
  useEffect(() => {
    loadEngine().then((m) => setEngine(m));
  }, []);

  const mf = () => mfRef.current;

  function onReady(field: MathfieldElement) {
    mfRef.current = field;
    if (latexRef.current) {
      field.value = latexRef.current;
      setAscii(field.getValue("ascii-math"));
    }
    requestAnimationFrame(() => field.focus());
  }

  function changed() {
    const field = mf();
    if (!field) return;
    latexRef.current = field.value;
    setAscii(field.getValue("ascii-math"));
    setError(null);
  }

  function press(key: Key) {
    const field = mf();
    if (!field) return;
    field.focus();
    field.insert(key.latex, { format: "latex", selectionMode: "placeholder", focus: true });
    changed();
  }

  function command(cmd: "moveToPreviousChar" | "moveToNextChar" | "deleteBackward") {
    const field = mf();
    if (!field) return;
    field.focus();
    field.executeCommand(cmd);
    changed();
  }

  /** Salta al próximo casillero vacío; si no hay, sale del bloque actual (fracción, raíz, exponente…). */
  function next() {
    const field = mf();
    if (!field) return;
    field.focus();
    const before = field.position;
    field.executeCommand("moveToNextPlaceholder");
    if (field.position === before) field.executeCommand("moveAfterParent");
    if (field.position === before) field.executeCommand("moveToNextChar");
  }

  function clear() {
    const field = mf();
    if (!field) return;
    field.value = "";
    field.focus();
    changed();
  }

  function toggleAbc() {
    const kb = window.mathVirtualKeyboard;
    if (abc) kb.hide();
    else {
      mf()?.focus();
      kb.show();
    }
    setAbc(!abc);
  }

  function solve() {
    const field = mf();
    if (!exercise || !field) return;
    // ascii-math de MathLive: paréntesis ya balanceados, fracciones como (N)/(D)
    const input = field.getValue("ascii-math");
    if (!input.trim()) return;
    window.mathVirtualKeyboard?.hide();
    setAbc(false);
    setLoading(true);
    setError(null);
    setTimeout(async () => {
      const r = (engine ?? (await loadEngine())).solve(exercise, input);
      if (r.ok) setResult({ fx: r.fx, lines: r.lines });
      else setError(r.error);
      setLoading(false);
    }, 20);
  }

  if (result !== null) {
    return <Result fx={result.fx} exercise={exercise ?? 5} lines={result.lines} onBack={() => setResult(null)} />;
  }

  const keyCls =
    "rounded-xl bg-neutral-800 text-white text-xl font-semibold py-4 active:bg-neutral-600 select-none touch-manipulation";
  // que los botones no le roben el foco (ni el cursor) al campo matemático
  const keep = (e: React.PointerEvent) => e.preventDefault();
  const read = ascii.trim() && engine ? engine.preview(ascii) : null;

  return (
    <main className="min-h-dvh bg-neutral-950 text-white px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 max-w-xl mx-auto">
      <div className="grid gap-3">
        {([5, 6] as const).map((n) => (
          <button
            key={n}
            onClick={() => setExercise(n)}
            className={`rounded-2xl py-6 px-4 text-left border-4 transition ${
              exercise === n
                ? "bg-yellow-400 text-black border-yellow-400"
                : "bg-neutral-900 text-white border-neutral-700"
            }`}
          >
            <div className="text-2xl font-black">EJERCICIO {n}</div>
            <div className="text-lg font-medium opacity-80">
              {n === 5 ? "Logaritmos / Exponenciales" : "Trigonometría"}
            </div>
          </button>
        ))}
      </div>

      {exercise && (
        <>
          <div>
            <div className="flex items-center gap-2 rounded-2xl bg-white text-black px-4 py-3">
              <span className="text-2xl font-bold shrink-0">f(x) =</span>
              <MathInput
                placeholder={exercise === 5 ? "\\ln(x-1)" : "\\sin(x)"}
                onReady={onReady}
                onInput={changed}
              />
            </div>
            <p className="mt-1 min-h-6 px-1 font-mono text-base text-neutral-400 break-all">
              {ascii.trim() && engine && (read ? `Se lee como: ${read}` : "… (completá los casilleros)")}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {KEYS[exercise].map((key) => (
              <button key={key.label} aria-label={key.aria} onPointerDown={keep} onClick={() => press(key)} className={`${keyCls} bg-yellow-900/60 ${key.wide ? "col-span-2" : ""}`}>
                {key.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {FIXED.map((key) => (
              <button key={key.label} aria-label={key.aria} onPointerDown={keep} onClick={() => press(key)} className={`${keyCls} ${key.wide ? "col-span-2" : ""}`}>
                {key.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {DIGITS.map((key) => (
              <button key={key.label} onPointerDown={keep} onClick={() => press(key)} className={keyCls}>
                {key.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button onPointerDown={keep} onClick={() => command("moveToPreviousChar")} className={`${keyCls} bg-sky-900`} aria-label="Cursor a la izquierda">←</button>
            <button onPointerDown={keep} onClick={() => command("moveToNextChar")} className={`${keyCls} bg-sky-900`} aria-label="Cursor a la derecha">→</button>
            <button onPointerDown={keep} onClick={next} className={`${keyCls} col-span-2 bg-sky-700`}>Siguiente →|</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onPointerDown={keep} onClick={() => command("deleteBackward")} className={`${keyCls} bg-red-900`}>⌫ Borrar</button>
            <button onPointerDown={keep} onClick={clear} className={`${keyCls} bg-red-950`}>Limpiar</button>
            <button onPointerDown={keep} onClick={toggleAbc} className={`${keyCls} ${abc ? "bg-neutral-500" : ""}`}>
              {abc ? "Ocultar ABC" : "ABC"}
            </button>
          </div>

          {error && <p className="rounded-xl bg-red-600 px-4 py-3 text-lg font-bold">{error}</p>}

          <button
            onClick={solve}
            disabled={loading || !ascii.trim()}
            className="w-full rounded-2xl bg-green-500 text-black text-2xl font-black py-6 disabled:opacity-40 active:scale-[0.98]"
          >
            {loading ? "RESOLVIENDO…" : "GENERAR PASOS PARA LA HOJA"}
          </button>
        </>
      )}
    </main>
  );
}
