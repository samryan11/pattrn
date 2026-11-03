// Abrir y guardar un proyecto: la carpeta autónoma de la especificación (§13.7).
//
//   proyecto.json
//   moldes/mol-….json
//   fragmentos/frg-…@N.json
//
// El núcleo no sabe de discos: lee y escribe a través de un Almacen. La aplicación de
// escritorio usa uno sobre el sistema de archivos; las pruebas, uno en memoria.

import type { Fragmento, Molde } from "./tipos";

export interface Almacen {
  /** Nombre visible de la carpeta. */
  nombre: string;
  leer(ruta: string): Promise<string | null>;
  escribir(ruta: string, texto: string): Promise<void>;
}

export interface Nodo {
  id: string;
  padre: string | null;
  creado: string;
  molde: { id: string; archivo: string } | null;
  nota?: string;
  hoja: Record<string, unknown>;
}

export interface Proyecto {
  pattrn: "0.1";
  tipo: "proyecto";
  id: string;
  nombre: string;
  arbol: { registrar_ramas: boolean; nodos: Nodo[]; actual: string };
  [otro: string]: unknown;
}

export interface ProyectoAbierto {
  proyecto: Proyecto;
  molde: Molde | null;
  /** Todas las versiones de fragmento que usa el molde actual. */
  fragmentos: Fragmento[];
}

const json = (x: unknown) => JSON.stringify(x, null, 2) + "\n";
const archivoDeFragmento = (f: Fragmento) => `fragmentos/${f.id}@${f.version}.json`;

async function leerJson<T>(almacen: Almacen, ruta: string): Promise<T> {
  const texto = await almacen.leer(ruta);
  if (texto === null) throw new Error(`${almacen.nombre}: falta ${ruta}`);
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error(`${almacen.nombre}: ${ruta} no es JSON válido`);
  }
}

/** Abre el proyecto en el nodo actual del árbol: su molde y los fragmentos que usa. */
export async function abrirProyecto(almacen: Almacen): Promise<ProyectoAbierto> {
  const proyecto = await leerJson<Proyecto>(almacen, "proyecto.json");
  if (proyecto.tipo !== "proyecto") throw new Error(`${almacen.nombre}: proyecto.json no es un proyecto PATTRN`);
  const nodo = proyecto.arbol.nodos.find((n) => n.id === proyecto.arbol.actual);
  if (!nodo) throw new Error(`${almacen.nombre}: el nodo actual ${proyecto.arbol.actual} no existe`);
  if (!nodo.molde) return { proyecto, molde: null, fragmentos: [] };

  const molde = await leerJson<Molde>(almacen, nodo.molde.archivo);
  const fragmentos: Fragmento[] = [];
  for (const pieza of molde.piezas) {
    for (const inst of pieza.instancias) {
      if (fragmentos.some((f) => `${f.id}@${f.version}` === inst.ref)) continue;
      const f = await leerJson<Fragmento>(almacen, `fragmentos/${inst.ref}.json`);
      if (f.huella !== inst.huella) throw new Error(`${almacen.nombre}: fragmentos/${inst.ref}.json no tiene la huella que espera el molde`);
      fragmentos.push(f);
    }
  }
  return { proyecto, molde, fragmentos };
}

/** Proyecto mínimo para guardar por primera vez un molde que todavía no tiene carpeta. */
export function proyectoNuevo(molde: Molde, fecha: string, autor = "PATTRN"): Proyecto {
  return {
    pattrn: "0.1", tipo: "proyecto",
    id: "prj-" + molde.id.slice(4),
    nombre: molde.nombre,
    licencia: "CC-BY-SA-4.0",
    autoria: { autor, fecha_creacion: fecha },
    entrada: { modo: "lienzo" },
    referencias: [],
    arbol: {
      registrar_ramas: true,
      actual: "n1",
      nodos: [{ id: "n1", padre: null, creado: fecha, molde: { id: molde.id, archivo: `moldes/${molde.id}.json` }, hoja: {} }],
    },
  };
}

function idNuevo(prefijo: string, usados: Set<string>): string {
  for (;;) {
    const id = prefijo + Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    if (!usados.has(id)) return id;
  }
}

/**
 * Guarda el molde en el nodo actual. Si el nodo ya tiene hijos queda fijo (§13.5): nace un
 * nodo hermano con una copia del molde bajo un id nuevo, y pasa a ser el actual. Los
 * fragmentos se escriben solo si todavía no están: una versión guardada no se reescribe.
 * Devuelve el proyecto como quedó guardado.
 */
export async function guardarProyecto(
  almacen: Almacen, proyecto: Proyecto, molde: Molde, fragmentos: Fragmento[], fecha: string,
): Promise<{ proyecto: Proyecto; molde: Molde }> {
  const p: Proyecto = structuredClone(proyecto);
  let m: Molde = molde;
  const nodo = p.arbol.nodos.find((n) => n.id === p.arbol.actual)!;
  const tieneHijos = p.arbol.nodos.some((n) => n.padre === nodo.id);

  if (tieneHijos) {
    const usados = new Set(p.arbol.nodos.map((n) => n.molde?.id).filter(Boolean) as string[]);
    m = { ...structuredClone(molde), id: idNuevo("mol-", usados) };
    const ids = new Set(p.arbol.nodos.map((n) => n.id));
    let k = p.arbol.nodos.length + 1;
    while (ids.has(`n${k}`)) k++;
    const hermano: Nodo = {
      id: `n${k}`, padre: nodo.padre, creado: fecha,
      molde: { id: m.id, archivo: `moldes/${m.id}.json` }, hoja: structuredClone(nodo.hoja),
    };
    p.arbol.nodos.push(hermano);
    p.arbol.actual = hermano.id;
  } else if (!nodo.molde) {
    nodo.molde = { id: m.id, archivo: `moldes/${m.id}.json` };
  }

  const actual = p.arbol.nodos.find((n) => n.id === p.arbol.actual)!;
  for (const pieza of m.piezas) {
    for (const inst of pieza.instancias) {
      const f = fragmentos.find((x) => `${x.id}@${x.version}` === inst.ref);
      if (!f) throw new Error(`falta el fragmento ${inst.ref} para guardar`);
      if ((await almacen.leer(archivoDeFragmento(f))) === null) await almacen.escribir(archivoDeFragmento(f), json(f));
    }
  }
  await almacen.escribir(actual.molde!.archivo, json(m));
  await almacen.escribir("proyecto.json", json(p));
  return { proyecto: p, molde: m };
}

/** Almacén en memoria: para pruebas y para la vista previa en el navegador. */
export function almacenEnMemoria(nombre: string, archivos: Record<string, string> = {}): Almacen & { archivos: Record<string, string> } {
  return {
    nombre, archivos,
    async leer(ruta) { return ruta in archivos ? archivos[ruta] : null; },
    async escribir(ruta, texto) { archivos[ruta] = texto; },
  };
}
