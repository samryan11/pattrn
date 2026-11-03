// Resolución de la unión canesú / parte inferior: tres opciones, nada automático.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  aplicarResolucion, cm, contornoResuelto, derivadaEn, distancia, largo, opcionesDeResolucion, puntoEn,
  redondear, type Fragmento, type Molde, type TramoDePieza,
} from "../index";

const PRJ = join(__dirname, "..", "..", "esquemas", "ejemplos", "proyecto-camisa-canesu");
const leer = <T>(...r: string[]): T => JSON.parse(readFileSync(join(PRJ, ...r), "utf-8"));
const M = leer<Molde>("moldes", "mol-cam0base.json"); // unión sin resolver
const fragmentos = [leer<Fragmento>("fragmentos", "frg-oxf9k3b2@1.json"), leer<Fragmento>("fragmentos", "frg-cua4m8d1@2.json")];
const resolver = (ref: string, h: string) => {
  const f = fragmentos.find((x) => `${x.id}@${x.version}` === ref);
  if (!f || f.huella !== h) throw new Error(`no resuelve ${ref}`);
  return f;
};

const cerrado = (c: TramoDePieza[]) =>
  c.every((t, i) => distancia(t.tramo.p1, c[(i + 1) % c.length].tramo.p0) < 1e-9);
const r = (p: readonly [number, number]) => [redondear(p[0]), redondear(p[1])];

describe("sin resolver", () => {
  test("el molde sin resolución muestra los fragmentos tal cual, con el hueco de 2,48 cm en el lateral", () => {
    const c = contornoResuelto(M, resolver, "delantero");
    expect(c.some((t) => t.modificado)).toBe(false);
    const sisa = c.find((t) => t.origen === "canesu#b2")!;
    const lateral = c.find((t) => t.origen === "inferior#b2")!;
    expect(cm(distancia(sisa.tramo.p0, lateral.tramo.p1))).toBe("2,48 cm");
    expect(cerrado(c)).toBe(false);
  });

  test("una resolución sin aceptar no se aplica", () => {
    const m = structuredClone(M);
    m.piezas[0].fusiones![0].resolucion = { modo: "manda_a" };
    expect(() => contornoResuelto(m, resolver, "delantero")).toThrow("sin aceptar");
  });
});

describe("las tres opciones", () => {
  const [mandaA, mandaB, transicion] = opcionesDeResolucion(M, resolver, "delantero", 60);

  test("se ofrecen las tres, en este orden, y ninguna toca el molde", () => {
    expect([mandaA.modo, mandaB.modo, transicion.modo]).toEqual(["manda_a", "manda_b", "transicion"]);
    expect([mandaA.disponible, mandaB.disponible, transicion.disponible]).toEqual([true, true, true]);
    expect(M.piezas[0].fusiones![0].resolucion.modo).toBe("ninguna");
  });

  test("manda el canesú: el lateral de cuadros entra 2,48 cm arriba y la pieza cierra", () => {
    expect(mandaA.cambios.map((c) => [c.origen, c.descripcion])).toEqual([["inferior#b2", "su extremo junto a la unión se mueve 2,48 cm"]]);
    const lateral = mandaA.contorno.find((t) => t.origen === "inferior#b2")!;
    expect(r(lateral.tramo.p1)).toEqual([237.19, 520]);
    expect(r(lateral.tramo.p0)).toEqual([250, 140]); // el ruedo no se mueve
    expect(cerrado(mandaA.contorno)).toBe(true);
  });

  test("manda la parte a cuadros: la sisa del canesú sale 2,48 cm y la pieza cierra", () => {
    expect(mandaB.cambios.map((c) => c.origen)).toEqual(["canesu#b2"]);
    const sisa = mandaB.contorno.find((t) => t.origen === "canesu#b2")!;
    expect(r(sisa.tramo.p0)).toEqual([262, 520]);
    expect(r(sisa.tramo.p1)).toEqual([205, 640]); // el hombro no se mueve
    expect(cerrado(mandaB.contorno)).toBe(true);
  });

  test("transición: se encuentran en el medio, con curvas suaves en 6,00 cm de cada lado", () => {
    expect(transicion.cambios.map((c) => c.origen).sort()).toEqual(["canesu#b2", "inferior#b2"]);
    const tramosSisa = transicion.contorno.filter((t) => t.origen === "canesu#b2");
    const tramosLat = transicion.contorno.filter((t) => t.origen === "inferior#b2");
    expect(r(tramosSisa[0].tramo.p0)).toEqual([249.6, 520]);
    expect(r(tramosLat[tramosLat.length - 1].tramo.p1)).toEqual([249.6, 520]);
    expect(cerrado(transicion.contorno)).toBe(true);
    // la parte redibujada mide 6 cm sobre el borde original y empalma sin quiebre con lo que no cambia
    for (const [curva, resto] of [[tramosSisa[0], tramosSisa[1]], [tramosLat[1], tramosLat[0]]]) {
      const enCurva = curva === tramosSisa[0] ? derivadaEn(curva.tramo, 1) : derivadaEn(curva.tramo, 0);
      const enResto = curva === tramosSisa[0] ? derivadaEn(resto.tramo, 0) : derivadaEn(resto.tramo, 1);
      const angulo = Math.abs(Math.atan2(enCurva[1], enCurva[0]) - Math.atan2(enResto[1], enResto[0]));
      expect(angulo).toBeLessThan(1e-9);
    }
  });

  test("las consecuencias dicen cuánto mide cada borde antes y después", () => {
    for (const c of [...mandaA.cambios, ...mandaB.cambios, ...transicion.cambios]) {
      expect(c.antes).toBeGreaterThan(0);
      expect(c.despues).toBeGreaterThan(0);
    }
    expect(cm(mandaA.cambios[0].antes)).toBe("38,02 cm");
  });
});

describe("aplicar", () => {
  test("aplicar copia el molde con la resolución aceptada; el original no cambia", () => {
    const m = aplicarResolucion(M, "delantero", "transicion", "2026-11-04", 60);
    expect(m.piezas[0].fusiones![0].resolucion).toEqual({ modo: "transicion", aceptada: "2026-11-04", zona_mm: 60 });
    expect(M.piezas[0].fusiones![0].resolucion).toEqual({ modo: "ninguna" });
    const c = contornoResuelto(m, resolver, "delantero");
    expect(cerrado(c)).toBe(true);
  });

  test("volver a 'ninguna' devuelve los fragmentos tal cual", () => {
    const m = aplicarResolucion(aplicarResolucion(M, "delantero", "manda_a", "2026-11-04"), "delantero", "ninguna", "2026-11-04");
    expect(contornoResuelto(m, resolver, "delantero").some((t) => t.modificado)).toBe(false);
  });
});

describe("bordes terminados", () => {
  // variante: el lateral de cuadros es un orillo terminado
  const conOrillo = fragmentos.map((f) => {
    if (f.id !== "frg-cua4m8d1") return f;
    const g = structuredClone(f);
    const b = g.bordes.find((x) => x.id === "b2")!;
    b.tipo = "terminado";
    delete b.margen_mm;
    b.terminado = { que: "orillo" };
    return g;
  });
  const resolverOrillo = (ref: string) => conOrillo.find((x) => `${x.id}@${x.version}` === ref)!;
  const [mandaA, mandaB, transicion] = opcionesDeResolucion(M, resolverOrillo, "delantero", 60);

  test("no se ofrece mover ni redibujar un borde terminado, y se dice por qué", () => {
    expect(mandaA.disponible).toBe(false);
    expect(mandaA.motivo).toContain("inferior#b2 (lateral) es un borde terminado");
    expect(transicion.disponible).toBe(false);
  });

  test("la opción que no lo toca sigue disponible", () => {
    expect(mandaB.disponible).toBe(true);
  });
});

test("la curva de transición no se sale de la zona: arranca a 6,00 cm del extremo sobre el borde original", () => {
  const [, , transicion] = opcionesDeResolucion(M, resolver, "delantero", 60);
  const lat = transicion.contorno.filter((t) => t.origen === "inferior#b2");
  expect(cm(largo(lat[0].tramo))).toBe(cm(largo({ tipo: "recta", p0: [250, 140], p1: [262, 520] }) - 60));
  expect(distancia(lat[0].tramo.p1, puntoEn(lat[0].tramo, 1))).toBe(0);
});
