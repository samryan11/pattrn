// Verificación del núcleo contra los ejemplos del formato v0.1.
// Si alguno de estos números no da idéntico, algo se rompió en el camino.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  analizarCosturas, analizarFusiones, cm, cruces, dividir, huella, largo, largoDeBorde, parametroEnLargo,
  redondear, tramoDeBorde, borde, type Fragmento, type Molde, type Punto,
} from "../index";

const EJEMPLOS = join(__dirname, "..", "..", "esquemas", "ejemplos");
const leer = <T>(...ruta: string[]): T => JSON.parse(readFileSync(join(EJEMPLOS, ...ruta), "utf-8"));

const A = leer<Fragmento>("frg-oxf7a2c1.json"); // delantero importado
const B = leer<Fragmento>("frg-oxf9k3b2.json"); // corte, lado A (canesú)
const C = leer<Fragmento>("frg-oxf9k3b3.json"); // corte, lado B
const D = leer<Fragmento>("frg-cua4m8d1.json"); // inferior a cuadros
const B2 = leer<Fragmento>("frg-oxf9k3b2@2.json"); // canesú con la unión pasada a costura
const D3 = leer<Fragmento>("frg-cua4m8d1@3.json"); // inferior con la unión pasada a costura
const M = leer<Molde>("mol-cam0001a.json"); // las dos telas, cosidas
const DEMO = leer<Molde>("demo", "mol-demo0telas.json"); // la fusión entre telas de antes
const fragmentos = [A, B, C, D];

const resolver = (ref: string, h: string) => {
  const f = [...fragmentos, B2, D3].find((x) => `${x.id}@${x.version}` === ref);
  if (!f || f.huella !== h) throw new Error(`no resuelve ${ref}`);
  return f;
};

describe("la unión canesú / parte inferior", () => {
  const [c] = analizarCosturas(M, resolver);

  test("23,72 cm contra 26,20 cm, diferencia 2,48 cm", () => {
    expect(cm(c.largoA)).toBe("23,72 cm");
    expect(cm(c.largoB)).toBe("26,20 cm");
    expect(cm(Math.abs(c.desvio))).toBe("2,48 cm");
  });

  test("sobra en la parte a cuadros, y queda fuera de tolerancia", () => {
    expect(c.sobra).toBe("b");
    expect(c.costura.b.bordes).toEqual(["inferior#b3"]);
    expect(c.dentroDeTolerancia).toBe(false);
  });

  test("en mm, al centésimo", () => {
    expect(redondear(c.largoA)).toBe(237.19);
    expect(redondear(c.largoB)).toBe(262);
    expect(redondear(c.desvio)).toBe(-24.81);
  });

  test("la misma diferencia que tenía como fusión, antes de convertirla en costura", () => {
    const [u] = analizarFusiones(DEMO, resolver);
    expect(redondear(u.largoA)).toBe(237.19);
    expect(redondear(u.largoB)).toBe(262);
    expect(u.separacion).toBeLessThan(1e-9);
  });
});

describe("largos de todos los bordes", () => {
  // los mismos valores que muestran los dibujos de los ejemplos
  const esperados: Record<string, Record<string, string>> = {
    [A.id]: { b1: "25,50", b2: "46,01", b3: "19,06", b4: "13,93", b5: "11,96", b6: "61,00" },
    [B.id]: { b1: "23,72", b2: "12,44", b3: "13,93", b4: "11,96", b5: "9,00" },
    [C.id]: { b1: "25,50", b2: "46,01", b3: "6,62", b4: "23,72", b5: "52,00" },
    [D.id]: { b1: "25,00", b2: "38,02", b3: "26,20", b4: "38,00" },
  };
  for (const f of fragmentos) {
    test(f.nombre, () => {
      const obtenidos = Object.fromEntries(f.bordes.map((b) => [b.id, cm(largoDeBorde(f, b.id)).replace(" cm", "")]));
      expect(obtenidos).toEqual(esperados[f.id]);
    });
  }

  test("la medida con cinta de la sisa queda dentro del error de importación", () => {
    const calculado = largoDeBorde(A, "b3");
    const cinta = (A.origen as any).medidas_verificadas[0].largo_mm;
    expect(cm(Math.abs(cinta - calculado))).toBe("0,04 cm");
    expect(Math.abs(cinta - calculado)).toBeLessThanOrEqual((A.origen as any).calibracion.error_estimado_mm);
  });
});

describe("el corte del delantero", () => {
  const sisa = tramoDeBorde(A, borde(A, "b3"));
  const linea = (B.origen as any).linea;
  const desde: Punto = linea.inicio, hasta: Punto = linea.tramos[0].hasta;
  const [cruce] = cruces(sisa, desde, hasta);
  const [abajo, arriba] = dividir(sisa, cruce.t);
  const r = (p: Punto) => [redondear(p[0]), redondear(p[1])];

  test("la línea cruza la sisa una vez, en el vértice que tienen los dos lados", () => {
    expect(cruces(sisa, desde, hasta)).toHaveLength(1);
    expect(r(cruce.punto)).toEqual(B.vertices.v2);
    expect(r(cruce.punto)).toEqual(C.vertices.v4);
  });

  test("los puntos de control de cada mitad son los guardados", () => {
    if (abajo.tipo !== "bezier" || arriba.tipo !== "bezier") throw new Error("la sisa es curva");
    expect([r(arriba.c1), r(arriba.c2)]).toEqual([borde(B, "b2").curva!.c1, borde(B, "b2").curva!.c2]);
    expect([r(abajo.c1), r(abajo.c2)]).toEqual([borde(C, "b3").curva!.c1, borde(C, "b3").curva!.c2]);
  });

  test("cortar no pierde nada: las dos mitades suman la sisa original", () => {
    expect(Math.abs(largo(abajo) + largo(arriba) - largo(sisa))).toBeLessThan(1e-9);
  });

  test("el piquete pasa al lado A a 5,38 cm y no queda en el lado B", () => {
    const pos = borde(A, "b3").piquetes![0].pos_mm - largo(abajo);
    expect(redondear(pos)).toBe(borde(B, "b2").piquetes![0].pos_mm);
    expect(cm(pos)).toBe("5,38 cm");
    expect(borde(C, "b3").piquetes).toBeUndefined();
    expect(largo(abajo)).toBeLessThan(borde(A, "b3").piquetes![0].pos_mm);
  });

  test("ubicar un largo sobre la curva y medir hasta ahí devuelven lo mismo", () => {
    const t = parametroEnLargo(sisa, 120);
    expect(Math.abs(largo(sisa, 0, t) - 120)).toBeLessThan(1e-9);
  });
});

describe("huellas", () => {
  const copias = ["frg-oxf9k3b2@2.json", "frg-cua4m8d1@3.json"].map((n) =>
    leer<Fragmento>("proyecto-camisa-canesu", "fragmentos", n));
  for (const f of [...fragmentos, B2, D3, ...copias]) {
    test(`${f.id}@${f.version}`, async () => {
      expect(await huella(f)).toBe(f.huella);
    });
  }

  test("cambiar un centésimo de milímetro cambia la huella", async () => {
    const otro = structuredClone(D);
    otro.vertices.v3 = [262.01, 380];
    expect(await huella(otro)).not.toBe(D.huella);
  });
});
