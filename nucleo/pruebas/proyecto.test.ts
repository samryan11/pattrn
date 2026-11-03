// Abrir y guardar: lo que se aplica no se pierde al cerrar, y lo que se guarda es un
// proyecto PATTRN válido.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, test } from "vitest";
import {
  abrirProyecto, almacenEnMemoria, aplicarResolucionDeCostura, guardarProyecto, proponerCostura,
  proyectoNuevo, type Fragmento, type Molde,
} from "../index";

const RAIZ = join(__dirname, "..", "..");
const EJ = join(RAIZ, "esquemas", "ejemplos");
const PRJ = join(EJ, "proyecto-camisa-canesu");

function cargarCarpeta(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const recorrer = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else out[relative(dir, p).replaceAll("\\", "/")] = readFileSync(p, "utf-8");
    }
  };
  recorrer(dir);
  return out;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validar = Object.fromEntries(["fragmento", "molde", "proyecto"].map((n) => [n,
  ajv.compile(JSON.parse(readFileSync(join(RAIZ, "esquemas", `${n}.schema.json`), "utf-8")))]));

/** Todo archivo .json guardado tiene que pasar su esquema. */
function todoValido(archivos: Record<string, string>) {
  for (const [ruta, texto] of Object.entries(archivos)) {
    if (!ruta.endsWith(".json")) continue;
    const doc = JSON.parse(texto);
    const v = validar[doc.tipo];
    expect(v, ruta).toBeDefined();
    expect(v(doc), `${ruta}: ${JSON.stringify(v.errors)}`).toBe(true);
  }
}

describe("abrir el proyecto de ejemplo", async () => {
  const almacen = almacenEnMemoria("proyecto-camisa-canesu", cargarCarpeta(PRJ));
  const abierto = await abrirProyecto(almacen);

  test("abre en el nodo actual, con su molde y sus fragmentos", () => {
    expect(abierto.proyecto.arbol.actual).toBe("n4");
    expect(abierto.molde!.id).toBe("mol-cam0001b");
    expect(abierto.fragmentos.map((f) => `${f.id}@${f.version}`).sort()).toEqual(["frg-cua4m8d1@3", "frg-oxf9k3b2@2"]);
  });

  test("si un fragmento no tiene la huella que espera el molde, no lo abre en silencio", async () => {
    const roto = almacenEnMemoria("roto", { ...almacen.archivos });
    const f = JSON.parse(roto.archivos["fragmentos/frg-oxf9k3b2@2.json"]);
    f.huella = "sha256:" + "0".repeat(64);
    roto.archivos["fragmentos/frg-oxf9k3b2@2.json"] = JSON.stringify(f);
    await expect(abrirProyecto(roto)).rejects.toThrow("no tiene la huella");
  });
});

describe("guardar", () => {
  test("lo aplicado se guarda y vuelve igual al abrir de nuevo", async () => {
    const almacen = almacenEnMemoria("p", cargarCarpeta(PRJ));
    const a = await abrirProyecto(almacen);
    const resolver = (ref: string) => a.fragmentos.find((f) => `${f.id}@${f.version}` === ref)!;
    const cambiado = aplicarResolucionDeCostura(a.molde!, resolver, "canesu_inferior", "embebido", "2026-11-04");
    const g = await guardarProyecto(almacen, a.proyecto, cambiado, a.fragmentos, "2026-11-04");
    expect(g.molde.id).toBe("mol-cam0001b"); // el nodo actual no tiene hijos: se guarda en su lugar
    const b = await abrirProyecto(almacen);
    expect(b.molde).toEqual(cambiado);
    expect(b.molde!.costuras![0].embebido_mm).toBe(-24.81);
    todoValido(almacen.archivos);
  });

  test("un nodo con hijos queda fijo: guardar crea un hermano con el cambio", async () => {
    const almacen = almacenEnMemoria("p", cargarCarpeta(PRJ));
    const a = await abrirProyecto(almacen);
    const proyecto = structuredClone(a.proyecto);
    proyecto.arbol.actual = "n2"; // tiene a n3 y n4 como hijos
    const base = JSON.parse(almacen.archivos["moldes/mol-cam0base.json"]) as Molde;
    const g = await guardarProyecto(almacen, proyecto, base, a.fragmentos, "2026-11-04");
    expect(g.proyecto.arbol.actual).toBe("n5");
    expect(g.proyecto.arbol.nodos.find((n) => n.id === "n5")!.padre).toBe("n1");
    expect(g.molde.id).not.toBe("mol-cam0base");
    expect(almacen.archivos["moldes/mol-cam0base.json"]).toBe(cargarCarpeta(PRJ)["moldes/mol-cam0base.json"]);
    expect((await abrirProyecto(almacen)).molde!.id).toBe(g.molde.id);
    todoValido(almacen.archivos);
  });

  test("un molde sin carpeta se guarda como proyecto nuevo, con los fragmentos que usa", async () => {
    const demo = JSON.parse(readFileSync(join(EJ, "demo", "mol-demo0telas.json"), "utf-8")) as Molde;
    const frags = ["frg-oxf9k3b2.json", "frg-cua4m8d1.json"].map((n) => JSON.parse(readFileSync(join(EJ, n), "utf-8")) as Fragmento);
    const resolver = (ref: string) => frags.find((f) => `${f.id}@${f.version}` === ref)!;
    const p = await proponerCostura(demo, resolver, "delantero", 10, "2026-11-04");
    const almacen = almacenEnMemoria("nuevo");
    await guardarProyecto(almacen, proyectoNuevo(p.molde, "2026-11-04"), p.molde, [...frags, ...p.fragmentos], "2026-11-04");
    expect(Object.keys(almacen.archivos).sort()).toEqual([
      "fragmentos/frg-cua4m8d1@3.json", "fragmentos/frg-oxf9k3b2@2.json", "moldes/mol-demo0telas.json", "proyecto.json",
    ]);
    const b = await abrirProyecto(almacen);
    expect(b.molde).toEqual(p.molde);
    todoValido(almacen.archivos);
  });

  test("una versión de fragmento ya guardada no se reescribe", async () => {
    const almacen = almacenEnMemoria("p", cargarCarpeta(PRJ));
    const a = await abrirProyecto(almacen);
    const antes = almacen.archivos["fragmentos/frg-oxf9k3b2@2.json"];
    const otro = a.fragmentos.map((f) => ({ ...f, nombre: "cambiado en memoria" }));
    await guardarProyecto(almacen, a.proyecto, a.molde!, otro, "2026-11-04");
    expect(almacen.archivos["fragmentos/frg-oxf9k3b2@2.json"]).toBe(antes);
  });
});
