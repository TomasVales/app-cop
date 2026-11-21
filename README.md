# Hoja Ej 5 y 6

App para el celular que te dice, paso a paso, qué escribir en la hoja para los ejercicios 5 (logaritmos y exponenciales) y 6 (trigonometría), con las teclas exactas de la Casio fx-570 ES PLUS.

Todo el cálculo se hace en el celular: funciona sin internet y no usa ninguna clave de API.

## Instalar en el iPhone

1. Abrí el link de GitHub Pages en **Safari**.
2. Compartir → **Agregar a pantalla de inicio**.
3. Abrila una vez con internet. Después anda en modo avión.

## Desarrollo

```bash
npm install
npm run dev      # servidor local (también en la red Wi-Fi)
npm run build    # genera dist/
npm run try -- 6 "sin(x)/(2sin(x)+1)"   # probar el motor en la terminal
```

Cada push a `main` publica la app sola en GitHub Pages.
