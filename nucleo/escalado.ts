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
