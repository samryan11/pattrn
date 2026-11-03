// Margen de costura y PDF 1:1: lo que se imprime tiene que medir lo que dice.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  aplanar, borde, cm, distancia, exportarFragmentoPdf, largoPolilinea, lineaDeCorte, MM_A_PT,
  tramoDeBorde, type Fragmento, type Punto,
} from "../index";

const EJEMPLOS = join(__dirname, "..", "..", "esquemas", "ejemplos");
const leer = (n: string): Fragmento => JSON.parse(readFileSync(join(EJEMPLOS, n), "utf-8"));
const D = leer("frg-cua4m8d1.json"); // delantero inferior a cuadros
const A = leer("frg-oxf7a2c1.json"); // delantero Oxford, con curvas

// distancia de un punto a la recta a→b
const aRecta = (p: Punto, a: Punto, b: Punto) =>
  Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / distancia(a, b);

describe("margen del delantero inferior", () => {
  const corte = lineaDeCorte(D);
  const tramo = (id: string) => corte.find((t) => t.borde === id)!;

  test("solo el lateral lleva margen: 1,00 cm", () => {
    expect(corte.map((t) => [t.borde, t.margen])).toEqual([["b1", 0], ["b2", 10], ["b3", 0], ["b4", 0]]);
  });

  test("la línea de corte del lateral queda a 10,000 mm de la neta, en perpendicular, de punta a punta", () => {
    const { p0, p1 } = tramoDeBorde(D, borde(D, "b2")) as { p0: Punto; p1: Punto };
    for (const q of tramo("b2").puntos) expect(Math.abs(aRecta(q, p0, p1) - 10)).toBeLessThan(1e-9);
  });

  test("en el corte: ruedo 26,00 cm, lateral 38,02 cm, canesú 27,20 cm, centro frente 38,00 cm", () => {
    expect(corte.map((t) => cm(largoPolilinea(t.puntos)))).toEqual(["26,00 cm", "38,02 cm", "27,20 cm", "38,00 cm"]);
  });

  test("el margen prolonga las rectas vecinas: la esquina cae sobre la recta del ruedo y la del canesú", () => {
    const lat = tramo("b2").puntos;
    expect(Math.abs(lat[0][1] - 0)).toBeLessThan(1e-9);
    expect(Math.abs(lat[lat.length - 1][1] - 380)).toBeLessThan(1e-9);
  });
});

describe("margen sobre curvas", () => {
  test("la sisa del delantero Oxford queda a 10 mm de su línea neta en toda su extensión", () => {
    const sisa = aplanar(tramoDeBorde(A, borde(A, "b3")));
    const offset = lineaDeCorte(A).find((t) => t.borde === "b3")!.puntos;
    // lejos de las esquinas, cada punto de la línea de corte está a 10 mm de la curva neta
    for (const q of offset.slice(5, -5)) {
      const d = Math.min(...sisa.map((s) => distancia(q, s)));
      expect(Math.abs(d - 10)).toBeLessThan(0.01);
    }
  });
});

describe("PDF A4 1:1", () => {
  const { pdf, hojas, medidas } = exportarFragmentoPdf(D);
  const texto = new TextDecoder("latin1").decode(pdf);

  test("es un PDF con hoja de control más el mosaico", () => {
    expect(texto.startsWith("%PDF-1.4")).toBe(true);
    expect(texto.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(hojas).toEqual({ columnas: 2, filas: 2 });
    expect(texto.match(/\/Type \/Page /g)).toHaveLength(1 + 2 * 2);
  });

  test("cada hoja mide 210 × 297 mm y se dibuja en milímetros con una sola escala", () => {
    const cajas = [...texto.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    for (const c of cajas) {
      expect(Number(c[1]) / MM_A_PT).toBeCloseTo(210, 2);
      expect(Number(c[2]) / MM_A_PT).toBeCloseTo(297, 2);
    }
    expect(texto.match(/2\.835 0 0 2\.835 0 0 cm/g)).toHaveLength(5);
  });

  test("pide que no se escale al imprimir", () => {
    expect(texto).toContain("/PrintScaling /None");
  });

  test("la hoja de control trae el cuadrado de 100 mm y las medidas que se verifican con la regla", () => {
    const rects = [...texto.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) \2 l\n\3 ([\d.]+) l\n\1 \4 l\nh/g)]
      .map((r) => [Number(r[3]) - Number(r[1]), Number(r[4]) - Number(r[2])].map((v) => Math.round(v * 1000) / 1000));
    expect(rects).toContainEqual([100, 100]);
    for (const s of ["neto 38,02 cm", "margen 1,00 cm, en perpendicular", "en la l\xednea de corte 26,00 cm", "10,00 cm"]) {
      expect(texto).toContain(s);
    }
    expect(medidas.find((m) => m.borde === "b2")!.margen).toBe(10);
  });
});
