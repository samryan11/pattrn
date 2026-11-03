// Geometría de un fragmento: cada borde como tramo exacto, sus largos y su contorno.

import { IDENTIDAD, largo, puntoEn, transformarTramo, type Tramo, type Transformacion } from "./geometria";
import type { Borde, Fragmento } from "./tipos";

export function borde(frag: Fragmento, id: string): Borde {
  const b = frag.bordes.find((x) => x.id === id);
  if (!b) throw new Error(`${frag.id}: no existe el borde ${id}`);
  return b;
}

/** El borde como tramo exacto, en coordenadas del fragmento o transformado. */
export function tramoDeBorde(frag: Fragmento, b: Borde, tr: Transformacion = IDENTIDAD): Tramo {
  const p0 = frag.vertices[b.de], p1 = frag.vertices[b.a];
  if (!p0 || !p1) throw new Error(`${frag.id}#${b.id}: vértice inexistente`);
  const t: Tramo = b.curva
    ? { tipo: "bezier", p0, c1: b.curva.c1, c2: b.curva.c2, p1 }
    : { tipo: "recta", p0, p1 };
  return tr === IDENTIDAD ? t : transformarTramo(t, tr);
}

/** Largo de la línea neta del borde, en mm. */
export function largoDeBorde(frag: Fragmento, id: string): number {
  return largo(tramoDeBorde(frag, borde(frag, id)));
}

/** Área con signo del contorno (positiva si es antihorario), sobre los vértices y la curva muestreada. */
export function areaConSigno(frag: Fragmento, tr: Transformacion = IDENTIDAD): number {
  let a = 0;
  for (const b of frag.bordes) {
    const t = tramoDeBorde(frag, b, tr);
    const n = t.tipo === "recta" ? 1 : 64;
    for (let i = 0; i < n; i++) {
      const p = puntoEn(t, i / n), q = puntoEn(t, (i + 1) / n);
      a += p[0] * q[1] - q[0] * p[1];
    }
  }
  return a / 2;
}
