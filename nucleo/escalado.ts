// Graduación por deltas (§3.7): el fragmento en otro talle.
// Cada talle guarda cuánto se corre cada vértice y cada punto de control respecto del talle base.

import { huella } from "./huella";
import type { Fragmento } from "./tipos";

interface Talle {
  deltas: Record<string, readonly [number, number]>;
  piquetes?: Record<string, number>;
}

export function tallesDe(frag: Fragmento): string[] {
  const e = frag.escalado as { talles?: Record<string, Talle> } | undefined;
  return [...(frag.talle_base ? [frag.talle_base as string] : []), ...Object.keys(e?.talles ?? {})];
}

/**
 * El fragmento en el talle pedido. Los piquetes sin posición propia en ese talle se
 * corren en proporción al largo del borde. Un borde terminado que se alargaría no se
 * corrige: quien llama tiene que avisarlo.
 */
export async function enTalle(frag: Fragmento, talle: string): Promise<Fragmento> {
  if (talle === frag.talle_base) return frag;
  const t = (frag.escalado as { talles?: Record<string, Talle> } | undefined)?.talles?.[talle];
  if (!t) throw new Error(`${frag.id}: no tiene el talle ${talle}`);
  const { largoDeBorde } = await import("./fragmento");
  const f: Fragmento = structuredClone(frag);
  const sumar = (p: readonly [number, number], clave: string): [number, number] => {
    const d = t.deltas[clave] ?? [0, 0];
    return [p[0] + d[0], p[1] + d[1]];
  };
  for (const v of Object.keys(f.vertices)) f.vertices[v] = sumar(f.vertices[v], v);
  for (const b of f.bordes) {
    if (b.curva) b.curva = { tipo: "bezier", c1: sumar(b.curva.c1, `${b.id}.c1`), c2: sumar(b.curva.c2, `${b.id}.c2`) };
    for (const p of b.piquetes ?? []) {
      const propia = t.piquetes?.[`${b.id}.${p.id}`];
      p.pos_mm = propia ?? (p.pos_mm * largoDeBorde(f, b.id)) / largoDeBorde(frag, b.id);
    }
  }
  f.talle_base = talle;
  delete f.escalado;
  f.huella = await huella(f);
  return f;
}

/**
 * El fragmento en otro talle como fragmento propio, con id nuevo: sirve para trabajarlo
 * (cortarlo, coserlo) sin confundirlo con el del archivo, que está en su talle base.
 */
export async function fragmentoEnTalle(frag: Fragmento, talle: string, id: string, etiqueta: string, fecha: string): Promise<Fragmento> {
  const f = structuredClone(await enTalle(frag, talle));
  if (talle === frag.talle_base) return f;
  f.id = id;
  f.version = 1;
  f.nombre = `${frag.nombre} · talle ${etiqueta}`;
  const origen = f.origen as { metodo: string; medidas?: unknown; cambios?: string[] };
  if (origen.metodo === "convertido") {
    delete origen.medidas; // eran las del talle base
    origen.cambios = [...(origen.cambios ?? []), `Llevado al talle ${talle} con la graduación del fragmento ${frag.id}@${frag.version}.`];
  }
  const autoria = frag.autoria as { autor: string };
  f.linaje = [...((frag.linaje as unknown[] | undefined) ?? []), {
    ref: `${frag.id}@${frag.version}`, nombre: frag.nombre, autor: autoria.autor, licencia: frag.licencia as string, publicado: true,
  }];
  (f.autoria as { fecha_version?: string }).fecha_version = fecha;
  f.huella = await huella(f);
  return f;
}
