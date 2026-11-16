// Cortar un fragmento: dos fragmentos que, juntos, son exactamente el original.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, test } from "vitest";
import { areaConSigno, cortarFragmento, CorteImposible, estaAdentro, huella, largoDeBorde, lineaDeCorte, tramoDeBorde, type Fragmento } from "../index";

const RAIZ = join(__dirname, "..", "..");
const leer = (r: string) => JSON.parse(readFileSync(join(RAIZ, r), "utf-8"));
const frente: Fragmento = leer("patternpedia/freesewing/teagan/frg-fsteaganfront.json");
const manga: Fragmento = leer("patternpedia/freesewing/brian/frg-fsbriansleeve.json");
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validar = ajv.compile(leer("esquemas/fragmento.schema.json"));
const op = { ids: ["frg-corteaaa1", "frg-cortebbb2"] as [string, string], autor: "Sa", fecha: "2026-11-16" };
const perimetro = (f: Fragmento) => f.bordes.reduce((s, b) => s + largoDeBorde(f, b.id), 0);

describe("cortar un fragmento", () => {
  test("un corte horizontal da dos fragmentos válidos que suman el original", async () => {
    const [arriba, abajo] = await cortarFragmento(frente, [0, 300], [-50, 300], op); // sentido hacia −x: arriba queda a la derecha
    for (const f of [arriba, abajo]) {
      expect(validar(f), JSON.stringify(validar.errors)).toBe(true);
      expect(f.huella).toBe(await huella(f));
      expect(areaConSigno(f)).toBeGreaterThan(0);
      expect(estaAdentro(f.hilo.punto, f.bordes.map((b) => tramoDeBorde(f, b)))).toBe(true);
      expect(f.escalado).toBeUndefined();
    }
    expect(areaConSigno(arriba) + areaConSigno(abajo)).toBeCloseTo(areaConSigno(frente), 0);
    const corteA = arriba.bordes.find((b) => b.etiqueta === "linea_diseno")!, corteB = abajo.bordes.find((b) => b.etiqueta === "linea_diseno")!;
    expect(largoDeBorde(arriba, corteA.id)).toBeCloseTo(largoDeBorde(abajo, corteB.id), 1);
    expect(perimetro(arriba) + perimetro(abajo)).toBeCloseTo(perimetro(frente) + 2 * largoDeBorde(arriba, corteA.id), 1);
    // el lado de cada uno: el de la izquierda de la línea (yendo hacia −x) es el de abajo
    expect(Math.max(...Object.values(arriba.vertices).map((v) => v[1]))).toBeLessThanOrEqual(300.01);
    expect(Math.min(...Object.values(abajo.vertices).map((v) => v[1]))).toBeGreaterThanOrEqual(299.99);
  });

  test("el borde del corte nace como costura con margen; los demás conservan lo suyo", async () => {
    const [x, y] = await cortarFragmento(frente, [0, 300], [50, 300], { ...op, margen_mm: 15 });
    for (const f of [x, y]) {
      const nuevo = f.bordes.filter((b) => b.etiqueta === "linea_diseno");
      expect(nuevo).toHaveLength(1);
      expect(nuevo[0]).toMatchObject({ tipo: "costura", margen_mm: 15 });
      lineaDeCorte(f); // no falla
    }
    const todos = [...x.bordes, ...y.bordes];
    expect(todos.filter((b) => b.tipo === "doblez")).toHaveLength(2); // el centro, partido en dos
    expect(todos.filter((b) => b.etiqueta === "lateral").every((b) => b.margen_mm === 10)).toBe(true);
    expect(todos.filter((b) => b.etiqueta === "ruedo")).toHaveLength(1);
    expect(todos.find((b) => b.etiqueta === "ruedo")).toMatchObject({ tipo: "dobladillo", margen_mm: 30 });
  });

  test("los piquetes no se pierden ni se duplican", async () => {
    const total = (f: Fragmento) => f.bordes.reduce((s, b) => s + (b.piquetes?.length ?? 0), 0);
    expect(total(manga)).toBe(2);
    const alto = Math.max(...Object.values(manga.vertices).map((v) => v[1]));
    const [a, b] = await cortarFragmento(manga, [0, alto - 80], [10, alto - 80], op);
    expect(total(a) + total(b)).toBe(2);
    const vertical = await cortarFragmento(manga, [200, 0], [200, 10], op);
    expect(total(vertical[0]) + total(vertical[1])).toBe(2);
    for (const f of vertical) for (const bd of f.bordes) for (const pq of bd.piquetes ?? []) expect(pq.pos_mm).toBeLessThan(largoDeBorde(f, bd.id));
  });

  test("la atribución sigue la cadena: el padre y la fuente original", async () => {
    const [a] = await cortarFragmento(frente, [0, 300], [50, 300], op);
    const linaje = a.linaje as { nombre: string; ref?: string; aviso?: string }[];
    expect(linaje).toHaveLength(2);
    expect(linaje[0].aviso).toContain("MIT License");
    expect(linaje[1].ref).toBe("frg-fsteaganfront@1");
    expect((a.origen as { metodo: string; hermanos: string[] }).hermanos).toEqual([op.ids[1]]);
    // se puede volver a cortar
    const [c, d2] = await cortarFragmento(a, [100, 0], [100, 10], { ...op, ids: ["frg-cortecccc3", "frg-cortedddd4"] });
    expect((c.linaje as unknown[]).length).toBe(3);
    expect(validar(d2), JSON.stringify(validar.errors)).toBe(true);
  });

  test("cortar por un vértice no deja bordes de largo cero", async () => {
    const v = frente.vertices.v3; // la esquina de la axila
    const [a, b] = await cortarFragmento(frente, [v[0], v[1]], [v[0] - 10, v[1]], op);
    for (const f of [a, b]) for (const bd of f.bordes) expect(largoDeBorde(f, bd.id)).toBeGreaterThan(1);
    expect(a.bordes.length + b.bordes.length).toBe(frente.bordes.length + 3); // un borde partido (el centro) y dos del corte
  });

  test("una línea que no atraviesa la pieza, o la cruza más de una vez, no corta", async () => {
    await expect(cortarFragmento(frente, [-500, -500], [-400, -500], op)).rejects.toThrow(CorteImposible);
    // una pieza en U: una línea horizontal por las dos ramas la cruza cuatro veces
    const pts = [[0, 0], [300, 0], [300, 300], [200, 300], [200, 100], [100, 100], [100, 300], [0, 300]];
    const u: Fragmento = {
      ...structuredClone(frente), hilo: { ...frente.hilo, punto: [50, 50] },
      vertices: Object.fromEntries(pts.map((q, i) => [`v${i + 1}`, q as [number, number]])),
      bordes: pts.map((_, i) => ({ id: `b${i + 1}`, de: `v${i + 1}`, a: `v${(i + 1) % pts.length + 1}`, etiqueta: "otro", tipo: "costura", margen_mm: 10 })),
    };
    await expect(cortarFragmento(u, [0, 200], [10, 200], op)).rejects.toThrow(/4 lugares/);
    const [abajo, arriba] = await cortarFragmento(u, [10, 50], [0, 50], op); // por debajo de las ramas sí corta
    expect(areaConSigno(abajo) + areaConSigno(arriba)).toBeCloseTo(300 * 300 - 100 * 200, 3);
  });
});
