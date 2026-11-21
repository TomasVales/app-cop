import { useEffect, useRef } from "react";
import { MathfieldElement } from "mathlive";
import "mathlive/fonts.css";

// Las fuentes las empaqueta Vite desde mathlive/fonts.css; sin sonidos de tecla.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

type Props = {
  placeholder: string;
  onReady: (mf: MathfieldElement) => void;
  onInput: (ascii: string) => void;
};

/** Campo matemático visual (fracciones, raíces, exponentes y bases dibujadas). */
export default function MathInput({ placeholder, onReady, onInput }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onReady, onInput });
  cb.current = { onReady, onInput };

  useEffect(() => {
    const mf = new MathfieldElement();
    mf.className = "math-input";
    // primero se monta en la página: varias opciones (menuItems) fallan si el campo no está montado
    host.current!.appendChild(mf);
    mf.mathVirtualKeyboardPolicy = "manual"; // usamos nuestro teclado
    mf.smartFence = true;
    mf.popoverPolicy = "off";
    mf.menuItems = [];
    mf.placeholder = placeholder;
    mf.addEventListener("input", () => cb.current.onInput(mf.getValue("ascii-math")));
    cb.current.onReady(mf);
    return () => mf.remove();
    // el campo se crea una sola vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="min-w-0 flex-1" />;
}
