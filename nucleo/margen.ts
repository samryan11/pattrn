// Línea de corte: la línea neta más el margen de cada borde de costura.
// Es la única aproximación del núcleo y solo existe al exportar: las curvas se
// siguen con polilíneas de error menor a 0,005 mm. La línea neta, que es la que
// se mide, sigue exacta.

import { aplanar, distancia, interseccionRectas, type Punto } from "./geometria";
import { areaConSigno, tramoDeBorde } from "./fragmento";
import type { Fragmento } from "./tipos";

export interface TramoDeCorte {
  borde: string;
  /** Margen aplicado (0 en doblez, unión y terminado). */
  margen: number;
  puntos: Punto[];
}

/** Corre la polilínea `d` mm hacia la derecha del avance (sentido 1) o hacia la izquierda (−1). */
export function desplazar(pts: Punto[], d: number, sentido: number): Punto[] {
  if (d === 0) return pts.slice();
  // cada segmento se corre d hacia afuera y se une con el siguiente en su intersección
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const L = distancia(a, b);
    if (L === 0) continue;
    const n: Punto = [((b[1] - a[1]) / L) * sentido * d, (-(b[0] - a[0]) / L) * sentido * d];
    segs.push([[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]]] as [Punto, Punto]);
  }
  const out: Punto[] = [segs[0][0]];
  for (let i = 0; i < segs.length - 1; i++) {
    out.push(interseccionRectas(segs[i][0], segs[i][1], segs[i + 1][0], segs[i + 1][1]) ?? segs[i][1]);
  }
  out.push(segs[segs.length - 1][1]);
  return out;
}

/**
 * Contorno de corte del fragmento, borde por borde. En cada esquina, los dos tramos
 * se prolongan (o recortan) hasta cortarse: así el margen de un lateral llega hasta
 * la recta del ruedo vecino aunque el ruedo no lleve margen.
 */
export function lineaDeCorte(frag: Fragmento): TramoDeCorte[] {
  const sentido = areaConSigno(frag) > 0 ? 1 : -1; // afuera queda a la derecha de un contorno antihorario
  const tramos: TramoDeCorte[] = frag.bordes.map((b) => {
    const margen = b.tipo === "costura" ? b.margen_mm ?? 0 : 0;
    return { borde: b.id, margen, puntos: desplazar(aplanar(tramoDeBorde(frag, b)), margen, sentido) };
  });
  for (let i = 0; i < tramos.length; i++) {
    const a = tramos[i], b = tramos[(i + 1) % tramos.length];
    const vertice = frag.vertices[frag.bordes[i].a];
    const pa = a.puntos, pb = b.puntos;
    const x = interseccionRectas(pa[pa.length - 2], pa[pa.length - 1], pb[0], pb[1]);
    // si la esquina es muy aguda la punta saldría lejos: se deja en bisel
    const limite = 4 * Math.max(a.margen, b.margen) + 1;
    if (x && distancia(x, vertice) <= limite) {
      pa[pa.length - 1] = x;
      pb[0] = x;
    }
  }
  return tramos;
}

export function largoPolilinea(pts: Punto[]): number {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) s += distancia(pts[i], pts[i + 1]);
  return s;
}
