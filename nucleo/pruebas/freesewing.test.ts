// Conversor de FreeSewing: lo convertido tiene que medir lo mismo que el original,
// en el talle base y en cualquier otro, y cumplir el esquema del formato.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { beforeAll, describe, expect, test } from "vitest";
import { enTalle, huella, largoDeBorde, lineaDeCorte, tallesDe, type Fragmento } from "../index";
import { convertirDiseno } from "../../herramientas/convertir-freesewing";

const RAIZ = join(__dirname, "..", "..");
const esquema = JSON.parse(readFileSync(join(RAIZ, "esquemas", "fragmento.schema.json"), "utf-8"));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validar = ajv.compile(esquema);

type Patron = { draft(): Patron; parts: Record<string, { paths: Record<string, { length(): number }> }>[] };
async function original(talle: string) {
  const { Teagan } = (await import("@freesewing/teagan")) as unknown as { Teagan: new (o: object) => Patron };
  const modelos = (await import("@freesewing/models")) as unknown as Record<string, object>;
  return new Teagan({ measurements: modelos[talle], sa: 10, complete: true }).draft().parts[0];
}
const perimetro = (f: Fragmento) => f.bordes.reduce((s, b) => s + largoDeBorde(f, b.id), 0);

let frente: Fragmento, manga: Fragmento, todos: Fragmento[];
beforeAll(async () => {
  todos = (await convertirDiseno("teagan", "2026-11-16")).map((r) => r.fragmento);
  frente = todos.find((f) => f.id === "frg-fsteaganfront")!;
  manga = todos.find((f) => f.id === "frg-fsteagansleeve")!;
});

describe("conversor de FreeSewing", () => {
  test("los fragmentos cumplen el esquema y su huella es la calculada", async () => {
    for (const f of todos) {
      expect(validar(f), JSON.stringify(validar.errors)).toBe(true);
      expect(f.huella).toBe(await huella(f));
    }
  });

  test("el contorno mide lo mismo que en FreeSewing", async () => {
    const o = await original("cisFemaleAdult36");
    expect(Math.abs(perimetro(frente) - o["teagan.front"].paths.seam.length())).toBeLessThan(0.05);
    expect(Math.abs(perimetro(manga) - o["teagan.sleeve"].paths.seam.length())).toBeLessThan(0.05);
  });

  test("el centro va al doblez, sin margen; el ruedo es dobladillo, con el suyo", () => {
    const centro = frente.bordes.find((b) => b.tipo === "doblez")!;
    expect(centro.etiqueta).toBe("centro_frente");
    expect(centro.margen_mm).toBeUndefined();
    const ruedo = frente.bordes.find((b) => b.etiqueta === "ruedo")!;
    expect(ruedo.tipo).toBe("dobladillo");
    expect(ruedo.margen_mm).toBeGreaterThan(10); // FreeSewing le da más margen al ruedo que a las costuras
    for (const b of frente.bordes.filter((x) => x.tipo === "costura")) expect(b.margen_mm).toBe(10);
  });

  test("todo borde que no va al doblez lleva margen, y la línea de corte lo incluye", () => {
    for (const f of todos) {
      const corte = lineaDeCorte(f);
      f.bordes.forEach((b, i) => {
        if (b.tipo === "doblez") expect(corte[i].margen).toBe(0);
        else expect(corte[i].margen).toBeGreaterThan(0);
      });
    }
  });

  test("un borde al que la fuente no le da margen queda en cero, no con una medida inventada", async () => {
    const aaron = (await convertirDiseno("aaron", "2026-11-16")).map((r) => r.fragmento);
    const frente = aaron.find((f) => f.id === "frg-fsaaronfront")!;
    // sisa, bretel y escote de la musculosa se terminan con un vivo: sin margen en el original
    expect(frente.bordes.filter((b) => b.margen_mm === 0).map((b) => b.etiqueta).sort()).toEqual(["escote", "hombro", "sisa"]);
    expect(frente.bordes.find((b) => b.etiqueta === "lateral")!.margen_mm).toBe(10);
    for (const f of [...aaron, ...todos]) for (const b of f.bordes) expect(b.margen_mm ?? 0).toBeLessThanOrEqual(50);
  });

  test("el hilo y los piquetes vienen del original", () => {
    expect(frente.hilo.fuente).toBe("marcado_en_original");
    expect(frente.hilo.angulo_grados).toBe(90);
    const piquetes = manga.bordes.flatMap((b) => b.piquetes ?? []);
    expect(piquetes).toHaveLength(2);
    expect(frente.bordes.flatMap((b) => b.piquetes ?? [])).toHaveLength(1);
  });

  test("la atribución viaja con el fragmento", () => {
    const o = frente.origen as { metodo: string; fuente: { licencia: string; aviso: string } };
    expect(o.metodo).toBe("convertido");
    expect(o.fuente.licencia).toBe("MIT");
    expect(o.fuente.aviso).toContain("Copyright (c) 2022 Joost De Cock");
    expect((frente.linaje as { aviso: string }[])[0].aviso).toContain("MIT License");
  });

  test("otro talle mide lo mismo que FreeSewing generado en ese talle", async () => {
    expect(tallesDe(frente).length).toBe(20);
    for (const talle of ["cisMaleAdult44", "cisFemaleAdult28"]) {
      const o = await original(talle);
      for (const [f, clave] of [[frente, "teagan.front"], [manga, "teagan.sleeve"]] as const) {
        const g = await enTalle(f, talle);
        expect(Math.abs(perimetro(g) - o[clave].paths.seam.length())).toBeLessThan(0.2);
        expect(validar({ ...g, escalado: undefined }), JSON.stringify(validar.errors)).toBe(true);
      }
    }
  });
});
