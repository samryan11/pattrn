// El paquete de descarga: ZIP, DXF y hoja de pieza a partir de una base de Patternpedia.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, test } from "vitest";
import {
  archivosDelPaquete, armarPaquete, armarZip, bytesDeTexto, crc32, enTalle, exportarDxf, largoDeBorde, lineaDeCorte,
  largoPolilinea, moldeDeBase, type Fragmento, type PedidoDePaquete,
} from "../index";

const RAIZ = join(__dirname, "..", "..");
const SEMILLA = join(RAIZ, "patternpedia", "freesewing", "teagan");
const piezas = readdirSync(SEMILLA).map((a) => JSON.parse(readFileSync(join(SEMILLA, a), "utf-8")) as Fragmento);
const pedido: PedidoDePaquete = {
  nombre: "Remera de prueba", talle: "cisMaleAdult42", etiquetaTalle: "pecho 110", base: "Remera (FreeSewing Teagan)",
  piezas: piezas.map((f) => ({ nombre: f.nombre.replace(/ \(FreeSewing\)/, ""), fragmento: f, cantidad: 1, alDoblez: f.bordes.some((b) => b.tipo === "doblez") })),
  formatos: { pdf: true, dxf: true, hoja: true },
  notas: ["Para mí · primera prenda"],
  licencias: [{ nombre: "FreeSewing-MIT.txt", datos: bytesDeTexto("MIT License") }],
  fecha: new Date(2026, 10, 16, 12, 0, 0),
};

describe("paquete de descarga", () => {
  test("crc32 conocido", () => {
    expect(crc32(bytesDeTexto("123456789"))).toBe(0xcbf43926);
  });

  test("el ZIP trae lo anunciado y queda escrito para revisarlo desde afuera", async () => {
    const r = await armarPaquete(pedido);
    expect(r.archivos).toEqual(archivosDelPaquete(pedido));
    expect(r.archivos).toContain("dxf/remera-de-prueba.dxf");
    expect(r.archivos.filter((a) => a.startsWith("pdf-a4/"))).toHaveLength(3);
    expect(r.nombre).toBe("remera-de-prueba-talle-pecho-110.zip");
    const salida = process.env.PATTRN_SALIDA;
    if (salida) { mkdirSync(salida, { recursive: true }); writeFileSync(join(salida, r.nombre), r.zip); }
  });

  test("sin formatos no hay paquete", async () => {
    const vacio = { ...pedido, formatos: { pdf: false, dxf: false, hoja: false } };
    expect(archivosDelPaquete(vacio)).toEqual([]);
    await expect(armarPaquete(vacio)).rejects.toThrow();
  });

  test("el DXF lleva cada pieza con su línea de corte a escala", async () => {
    const f = await enTalle(piezas[0], "cisMaleAdult42");
    const dxf = exportarDxf([{ nombre: "Pieza", fragmento: f }]);
    expect(dxf.endsWith("0\r\nEOF\r\n")).toBe(true);
    // primer POLYLINE: la línea de corte, cerrada
    const l = dxf.split("\r\n");
    const fin = l.indexOf("SEQEND");
    const pts: [number, number][] = [];
    for (let i = l.indexOf("POLYLINE"); i < fin; i++) if (l[i] === "VERTEX") pts.push([Number(l[i + 4]), Number(l[i + 6])]);
    const corte = lineaDeCorte(f).flatMap((t, i) => (i === 0 ? t.puntos : t.puntos.slice(1)));
    expect(Math.abs(largoPolilinea([...pts, pts[0]]) - largoPolilinea(corte))).toBeLessThan(0.5);
    expect(Math.min(...pts.map((q) => q[0]))).toBeCloseTo(0, 2);
    expect(largoDeBorde(f, "b1")).toBeGreaterThan(0);
  });

  test("ZIP mínimo: firma y cantidad de archivos", () => {
    const z = armarZip([{ nombre: "a.txt", datos: bytesDeTexto("hola") }, { nombre: "b/ñ.txt", datos: bytesDeTexto("chau") }]);
    expect([z[0], z[1], z[2], z[3]]).toEqual([0x50, 0x4b, 3, 4]);
    expect(new DataView(z.buffer).getUint16(z.length - 22 + 10, true)).toBe(2);
    expect(() => armarZip([{ nombre: "a", datos: new Uint8Array() }, { nombre: "a", datos: new Uint8Array() }])).toThrow();
  });

  test("el molde armado desde una base y el proyecto con contexto cumplen el esquema", () => {
    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    const leer = (n: string) => JSON.parse(readFileSync(join(RAIZ, "esquemas", `${n}.schema.json`), "utf-8"));
    const molde = moldeDeBase("mol-prueba01", "Remera", "cisMaleAdult42", "Sa", "2026-11-16",
      piezas.map((f, i) => ({ id: `p${i + 1}`, nombre: f.nombre, fragmento: f, cantidad: 2 })));
    const vm = ajv.compile(leer("molde"));
    expect(vm(molde), JSON.stringify(vm.errors)).toBe(true);
    const vp = ajv.compile(leer("proyecto"));
    const proyecto = {
      pattrn: "0.1", tipo: "proyecto", id: "prj-prueba01", nombre: "Remera", licencia: "CC-BY-SA-4.0",
      autoria: { autor: "Sa", fecha_creacion: "2026-11-16" },
      entrada: { modo: "idea_en_texto", texto: "una remera con dos camisas" }, referencias: [],
      contexto: { para_quien: "para_mi", tipo_prenda: "remera", forro: { lleva: false }, experiencia: "primera_prenda", maquina: "recta" },
      arbol: { registrar_ramas: true, actual: "n1", nodos: [{ id: "n1", padre: null, creado: "2026-11-16", molde: { id: molde.id, archivo: `moldes/${molde.id}.json` }, hoja: {} }] },
    };
    expect(vp(proyecto), JSON.stringify(vp.errors)).toBe(true);
    expect(vp({ ...proyecto, entrada: { modo: "idea_en_texto" } })).toBe(false);
    expect(vp({ ...proyecto, entrada: { modo: "boceto_a_mano" } })).toBe(false);
  });
});
