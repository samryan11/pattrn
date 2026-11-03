// Resolución de bordes que no miden lo mismo: el criterio de tela, la fusión (misma tela)
// y la costura (telas distintas). Tres o cuatro opciones, nada automático.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  analizarCosturas, aplicarResolucion, aplicarResolucionDeCostura, cm, contornoResuelto,
  contornosResueltosDeCostura, derivadaEn, distancia, fusionesEntreTelas, huella, largo,
  opcionesDeCostura, opcionesDeResolucion, proponerCostura, redondear,
  type Fragmento, type Molde, type TramoDePieza,
} from "../index";

const EJ = join(__dirname, "..", "..", "esquemas", "ejemplos");
const leer = <T>(...r: string[]): T => JSON.parse(readFileSync(join(EJ, ...r), "utf-8"));
const DEMO = leer<Molde>("demo", "mol-demo0telas.json"); // fusión entre telas: no válida
const COSIDO = leer<Molde>("proyecto-camisa-canesu", "moldes", "mol-cam0base.json"); // costura sin resolver
const fragmentos = [
  leer<Fragmento>("frg-oxf9k3b2.json"), leer<Fragmento>("frg-cua4m8d1.json"),
  leer<Fragmento>("frg-oxf9k3b2@2.json"), leer<Fragmento>("frg-cua4m8d1@3.json"),
];
const resolver = (ref: string, h: string) => {
  const f = fragmentos.find((x) => `${x.id}@${x.version}` === ref);
  if (!f || f.huella !== h) throw new Error(`no resuelve ${ref}`);
  return f;
};

// la misma fusión, pero con las dos partes cortadas de la misma tela: ahí sí vale
const MISMA_TELA: Molde = structuredClone(DEMO);
for (const i of MISMA_TELA.piezas[0].instancias) i.tela = "oxford";

const cerrado = (c: TramoDePieza[]) => c.every((t, i) => distancia(t.tramo.p1, c[(i + 1) % c.length].tramo.p0) < 1e-9);
const r = (p: readonly [number, number]) => [redondear(p[0]), redondear(p[1])];
const tangente = (v: readonly [number, number]) => Math.atan2(v[1], v[0]);

describe("el criterio es la tela", () => {
  test("una fusión entre telas distintas se detecta y no se resuelve", () => {
    expect(fusionesEntreTelas(DEMO).map((x) => [x.telaA, x.telaB])).toEqual([["oxford", "cuadros"]]);
    expect(() => opcionesDeResolucion(DEMO, resolver, "delantero")).toThrow("fusion_entre_telas");
    expect(() => contornoResuelto(DEMO, resolver, "delantero")).toThrow("se cosen, no se fusionan");
    expect(() => aplicarResolucion(DEMO, "delantero", "manda_a", "2026-11-04")).toThrow("fusion_entre_telas");
  });

  test("dos zonas de la misma tela sí se fusionan, aunque vengan de fragmentos distintos", () => {
    expect(fusionesEntreTelas(MISMA_TELA)).toEqual([]);
    expect(opcionesDeResolucion(MISMA_TELA, resolver, "delantero").map((o) => o.disponible)).toEqual([true, true, true]);
  });
});

describe("proponer costura", async () => {
  const propuesta = await proponerCostura(DEMO, resolver, "delantero", 10, "2026-11-03");

  test("no toca el molde original", () => {
    expect(DEMO.piezas).toHaveLength(1);
    expect(DEMO.costuras).toBeUndefined();
  });

  test("los dos bordes de unión pasan a costura con margen, en una versión nueva de cada fragmento", async () => {
    const [b, d] = propuesta.fragmentos;
    expect([`${b.id}@${b.version}`, `${d.id}@${d.version}`]).toEqual(["frg-oxf9k3b2@2", "frg-cua4m8d1@3"]);
    expect(b.bordes.find((x) => x.id === "b1")).toMatchObject({ tipo: "costura", margen_mm: 10, etiqueta: "canesu" });
    expect(d.bordes.find((x) => x.id === "b3")).toMatchObject({ tipo: "costura", margen_mm: 10 });
    expect([b.version_anterior, d.version_anterior]).toEqual([1, 2]);
    expect(await huella(b)).toBe(b.huella);
  });

  test("las versiones nuevas son idénticas a las de los ejemplos del formato", () => {
    expect(propuesta.fragmentos).toEqual([fragmentos[2], fragmentos[3]]);
  });

  test("la pieza se separa en una por tela y nace la costura, igual que en el ejemplo", () => {
    expect(propuesta.molde.piezas).toEqual(COSIDO.piezas);
    expect(propuesta.molde.costuras).toEqual(COSIDO.costuras);
    expect(fusionesEntreTelas(propuesta.molde)).toEqual([]);
  });

  test("dice qué va a cambiar antes de aceptarlo", () => {
    expect(propuesta.cambios).toEqual([
      "canesu#b1 (canesu) pasa de unión a costura con margen 1,00 cm: versión 2 de frg-oxf9k3b2",
      "inferior#b3 (canesu) pasa de unión a costura con margen 1,00 cm: versión 3 de frg-cua4m8d1",
      "la pieza delantero se separa en delantero_oxford y delantero_cuadros, una por tela",
      "nace la costura canesu_inferior entre canesu#b1 y inferior#b3",
    ]);
  });
});

describe("resolver la fusión (misma tela)", () => {
  const [mandaA, mandaB, transicion] = opcionesDeResolucion(MISMA_TELA, resolver, "delantero", 60);

  test("sin resolver, el hueco de 2,48 cm queda en el lateral y la pieza no cierra", () => {
    const c = contornoResuelto(MISMA_TELA, resolver, "delantero");
    expect(c.some((t) => t.modificado)).toBe(false);
    expect(cerrado(c)).toBe(false);
  });

  test("manda el canesú: el lateral de cuadros entra 2,48 cm arriba y la pieza cierra", () => {
    expect(mandaA.cambios.map((x) => [x.origen, x.descripcion])).toEqual([["inferior#b2", "su extremo junto a la unión se mueve 2,48 cm"]]);
    expect(r(mandaA.contorno.find((t) => t.origen === "inferior#b2")!.tramo.p1)).toEqual([237.19, 520]);
    expect(cerrado(mandaA.contorno)).toBe(true);
  });

  test("manda la parte a cuadros: la sisa del canesú sale 2,48 cm y la pieza cierra", () => {
    expect(r(mandaB.contorno.find((t) => t.origen === "canesu#b2")!.tramo.p0)).toEqual([262, 520]);
    expect(cerrado(mandaB.contorno)).toBe(true);
  });

  test("transición: se encuentran en el medio y empalman sin quiebre", () => {
    const sisa = transicion.contorno.filter((t) => t.origen === "canesu#b2");
    const lat = transicion.contorno.filter((t) => t.origen === "inferior#b2");
    expect(r(sisa[0].tramo.p0)).toEqual([249.6, 520]);
    expect(cerrado(transicion.contorno)).toBe(true);
    expect(Math.abs(tangente(derivadaEn(sisa[0].tramo, 1)) - tangente(derivadaEn(sisa[1].tramo, 0)))).toBeLessThan(1e-9);
    expect(Math.abs(tangente(derivadaEn(lat[1].tramo, 0)) - tangente(derivadaEn(lat[0].tramo, 1)))).toBeLessThan(1e-9);
  });

  test("aplicar copia el molde con la resolución aceptada; sin aceptar no se aplica", () => {
    const m = aplicarResolucion(MISMA_TELA, "delantero", "transicion", "2026-11-04", 60);
    expect(m.piezas[0].fusiones![0].resolucion).toEqual({ modo: "transicion", aceptada: "2026-11-04", zona_mm: 60 });
    expect(MISMA_TELA.piezas[0].fusiones![0].resolucion).toEqual({ modo: "ninguna" });
    const sinAceptar = structuredClone(MISMA_TELA);
    sinAceptar.piezas[0].fusiones![0].resolucion = { modo: "manda_a" };
    expect(() => contornoResuelto(sinAceptar, resolver, "delantero")).toThrow("sin aceptar");
  });
});

describe("resolver la costura (telas distintas)", () => {
  const [embebido, mandaA, mandaB, transicion] = opcionesDeCostura(COSIDO, resolver, "canesu_inferior", 60);
  const borde = (o: typeof mandaA, pieza: string, origen: string) => o.contornos[pieza].filter((t) => t.origen === origen);
  const largoDe = (o: typeof mandaA, pieza: string, origen: string) => borde(o, pieza, origen).reduce((s, t) => s + largo(t.tramo), 0);

  test("se ofrecen cuatro opciones, todas disponibles, y ninguna toca el molde", () => {
    expect([embebido, mandaA, mandaB, transicion].map((o) => [o.modo, o.disponible])).toEqual([
      ["embebido", true], ["manda_a", true], ["manda_b", true], ["transicion", true],
    ]);
    expect(COSIDO.costuras![0].resolucion).toBeUndefined();
  });

  test("manda el canesú: el borde de cuadros se acorta 2,48 cm sobre su línea y su lateral lo acompaña", () => {
    expect(cm(largoDe(mandaA, "delantero_cuadros", "inferior#b3"))).toBe("23,72 cm");
    expect(mandaA.cambios.map((c) => [c.origen, c.descripcion])).toEqual([
      ["inferior#b2", "su extremo junto a la costura se mueve 2,48 cm"],
      ["inferior#b3", "se acorta 2,48 cm sobre su línea"],
    ]);
    expect(r(borde(mandaA, "delantero_cuadros", "inferior#b2")[0].tramo.p1)).toEqual([237.19, 520]);
    expect(cerrado(mandaA.contornos.delantero_cuadros)).toBe(true);
    expect(mandaA.contornos.delantero_oxford.some((t) => t.modificado)).toBe(false);
  });

  test("manda la parte a cuadros: el canesú se prolonga 2,48 cm y su sisa lo acompaña", () => {
    expect(cm(largoDe(mandaB, "delantero_oxford", "canesu#b1"))).toBe("26,20 cm");
    expect(r(borde(mandaB, "delantero_oxford", "canesu#b2")[0].tramo.p0)).toEqual([262, 520]);
    expect(cerrado(mandaB.contornos.delantero_oxford)).toBe(true);
  });

  test("transición: los dos lados quedan en 24,96 cm y los vecinos se redibujan sin quiebre", () => {
    expect(cm(largoDe(transicion, "delantero_oxford", "canesu#b1"))).toBe("24,96 cm");
    expect(cm(largoDe(transicion, "delantero_cuadros", "inferior#b3"))).toBe("24,96 cm");
    expect(cerrado(transicion.contornos.delantero_oxford)).toBe(true);
    expect(cerrado(transicion.contornos.delantero_cuadros)).toBe(true);
  });

  test("declarar embebido no cambia la geometría y deja la costura dentro de tolerancia", () => {
    const m = aplicarResolucionDeCostura(COSIDO, resolver, "canesu_inferior", "embebido", "2026-11-04");
    expect(m.costuras![0].embebido_mm).toBe(-24.81);
    const [an] = analizarCosturas(m, resolver);
    expect(an.dentroDeTolerancia).toBe(true);
    expect(embebido.cambios).toEqual([]);
  });

  test("aplicar guarda la resolución aceptada; quitarla vuelve a cero", () => {
    const m = aplicarResolucionDeCostura(COSIDO, resolver, "canesu_inferior", "manda_a", "2026-11-04");
    expect(m.costuras![0].resolucion).toEqual({ modo: "manda_a", aceptada: "2026-11-04" });
    const c = contornosResueltosDeCostura(m, resolver, "canesu_inferior");
    expect(cm(c.delantero_cuadros.filter((t) => t.origen === "inferior#b3").reduce((s, t) => s + largo(t.tramo), 0))).toBe("23,72 cm");
    const sin = aplicarResolucionDeCostura(m, resolver, "canesu_inferior", "ninguna", "2026-11-04");
    expect(sin.costuras![0].resolucion).toBeUndefined();
    expect(sin.costuras![0].embebido_mm).toBe(0);
  });

  test("un borde terminado no se prolonga: si la costura fuera un orillo, 'manda cuadros' no se ofrece", () => {
    const conOrillo = fragmentos.map((f) => {
      if (`${f.id}@${f.version}` !== "frg-oxf9k3b2@2") return f;
      const g = structuredClone(f);
      const b = g.bordes.find((x) => x.id === "b1")!;
      b.tipo = "terminado";
      delete b.margen_mm;
      b.terminado = { que: "orillo" };
      return g;
    });
    const res = (ref: string) => conOrillo.find((x) => `${x.id}@${x.version}` === ref)!;
    const [, a, b] = opcionesDeCostura(COSIDO, res, "canesu_inferior", 60);
    expect(a.disponible).toBe(true); // acortar el otro lado no toca el orillo
    expect(b.disponible).toBe(false);
    expect(b.motivo).toContain("canesu#b1 (canesu) es un borde terminado");
  });
});
