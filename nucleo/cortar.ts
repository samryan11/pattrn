// Cortar: la operación central. Una línea recta parte un fragmento en dos, y cada parte
// es un fragmento nuevo, completo y publicable por separado.
//
// Los bordes que la línea atraviesa se dividen sin perder nada: cada mitad conserva su
// etiqueta, su tipo, su margen y los piquetes que le tocan. El borde nuevo, el del corte,
// nace como costura con margen: un molde nunca queda sin margen donde se va a coser.

import { cruces, distancia, dividir, estaAdentro, largo, puntoEn, puntoInterior, redondear, type Punto, type Tramo } from "./geometria";
import { tramoDeBorde } from "./fragmento";
import { huella } from "./huella";
import type { Borde, Fragmento, Piquete } from "./tipos";

export interface OpcionesDeCorte {
  /** Ids de los dos fragmentos nuevos: el de la izquierda de la línea y el de la derecha. */
  ids: [string, string];
  nombres?: [string, string];
  autor: string;
  fecha: string;
  /** Margen del borde que nace del corte. */
  margen_mm?: number;
}

export class CorteImposible extends Error {}

interface Parte {
  tramo: Tramo;
  /** Borde del que sale, o null si es el borde nuevo del corte. */
  borde: Borde | null;
  /** Dónde empieza esta parte dentro de su borde original, en mm. */
  desde: number;
}

const TOL = 0.05; // mm

/**
 * Parte el fragmento por la recta que pasa por `a` y `b` (en coordenadas del fragmento).
 * Devuelve [izquierda, derecha] según el sentido a→b. La recta tiene que atravesar el
 * fragmento de lado a lado una sola vez.
 */
export async function cortarFragmento(frag: Fragmento, a: Punto, b: Punto, o: OpcionesDeCorte): Promise<[Fragmento, Fragmento]> {
  const L = distancia(a, b);
  if (!(L > 0)) throw new CorteImposible("La línea de corte no tiene largo.");
  const d: Punto = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const tramos = frag.bordes.map((x) => tramoDeBorde(frag, x));
  const todos = tramos.flatMap((t) => [t.p0, t.p1, ...(t.tipo === "bezier" ? [t.c1, t.c2] : [])]);
  const R = 2 * Math.max(...todos.map((q) => distancia(q, a))) + 10;
  const A: Punto = [a[0] - d[0] * R, a[1] - d[1] * R], B: Punto = [a[0] + d[0] * R, a[1] + d[1] * R];
  const lado = (q: Punto) => d[0] * (q[1] - a[1]) - d[1] * (q[0] - a[0]); // > 0: a la izquierda de a→b

  // cruces de la recta con el contorno; los que caen en un vértice se anotan una sola vez
  const n = tramos.length;
  const hallados: { indice: number; t: number; punto: Punto; s: number }[] = [];
  tramos.forEach((tr, i) => {
    for (const c of cruces(tr, A, B)) {
      let indice = i, t = c.t, punto = c.punto;
      if (distancia(punto, tr.p0) <= TOL) { t = 0; punto = tr.p0; }
      else if (distancia(punto, tr.p1) <= TOL) { indice = (i + 1) % n; t = 0; punto = tr.p1; }
      if (!hallados.some((h) => distancia(h.punto, punto) <= TOL)) hallados.push({ indice, t, punto, s: c.s });
    }
  });
  // un cruce vale si el contorno pasa de un lado al otro: rozar una esquina no corta nada
  const validos = hallados.filter((h) => {
    const tr = tramos[h.indice], anterior = tramos[(h.indice + n - 1) % n];
    const despues = puntoEn(tr, Math.min(1, h.t + 0.02));
    const antes = h.t === 0 ? puntoEn(anterior, 0.98) : puntoEn(tr, Math.max(0, h.t - 0.02));
    return lado(antes) * lado(despues) < 0;
  });
  if (validos.length !== 2) {
    throw new CorteImposible(validos.length === 0
      ? "La línea no atraviesa la pieza."
      : `La línea tiene que atravesar la pieza de lado a lado una sola vez: así como está, la cruza en ${validos.length} lugares.`);
  }

  // el contorno, con los bordes atravesados divididos en dos
  const partes: Parte[] = [];
  const nudos: number[] = []; // índice de la parte que empieza en cada cruce
  tramos.forEach((tr, i) => {
    const cortes = validos.filter((v) => v.indice === i).sort((x, y) => x.t - y.t);
    if (cortes.some((v) => v.t === 0)) nudos.push(partes.length);
    const interior = cortes.find((v) => v.t > 0);
    if (!interior) { partes.push({ tramo: tr, borde: frag.bordes[i], desde: 0 }); return; }
    const [p1, p2] = dividir(tr, interior.t);
    partes.push({ tramo: p1, borde: frag.bordes[i], desde: 0 });
    nudos.push(partes.length);
    partes.push({ tramo: p2, borde: frag.bordes[i], desde: largo(p1) });
  });
  const [k1, k2] = nudos.sort((x, y) => x - y);
  const x1 = partes[k1].tramo.p0, x2 = partes[k2].tramo.p0;
  if (distancia(x1, x2) <= TOL) throw new CorteImposible("La línea corta la pieza en un solo punto.");
  const mitades: Parte[][] = [
    [...partes.slice(k1, k2), { tramo: { tipo: "recta", p0: x2, p1: x1 }, borde: null, desde: 0 }],
    [...partes.slice(k2), ...partes.slice(0, k1), { tramo: { tipo: "recta", p0: x1, p1: x2 }, borde: null, desde: 0 }],
  ];
  // cuál queda a la izquierda de a→b
  const aLaIzquierda = (m: Parte[]) => lado(puntoInterior(m.map((x) => x.tramo))) > 0;
  if (!aLaIzquierda(mitades[0])) mitades.reverse();
  const [inicio, fin] = lado(x1) === lado(x2) && (x1[0] - a[0]) * d[0] + (x1[1] - a[1]) * d[1] <= (x2[0] - a[0]) * d[0] + (x2[1] - a[1]) * d[1] ? [x1, x2] : [x2, x1];

  const r = (q: Punto): [number, number] => [redondear(q[0]), redondear(q[1])];
  const ref = `${frag.id}@${frag.version}`;
  const padre = {
    ref, nombre: frag.nombre, autor: (frag.autoria as { autor: string }).autor, licencia: frag.licencia as string,
    publicado: (frag.origen as { metodo?: string }).metodo === "convertido",
  };
  const armar = async (mitad: Parte[], indice: 0 | 1): Promise<Fragmento> => {
    const vertices: Record<string, [number, number]> = {};
    const bordes: Borde[] = mitad.map((parte, k) => {
      vertices[`v${k + 1}`] = r(parte.tramo.p0);
      const base = { id: `b${k + 1}`, de: `v${k + 1}`, a: `v${(k + 1) % mitad.length + 1}` };
      const curva = parte.tramo.tipo === "bezier" ? { curva: { tipo: "bezier" as const, c1: r(parte.tramo.c1), c2: r(parte.tramo.c2) } } : {};
      if (!parte.borde) {
        return { ...base, etiqueta: "linea_diseno", tipo: "costura", margen_mm: o.margen_mm ?? 10, descripcion: "borde nacido de un corte" };
      }
      const { id: _id, de: _de, a: _a, curva: _curva, piquetes, ...resto } = parte.borde;
      const hasta = parte.desde + largo(parte.tramo);
      const propios: Piquete[] = (piquetes ?? [])
        .filter((pq) => pq.pos_mm > parte.desde + 0.5 && pq.pos_mm < hasta - 0.5)
        .map((pq, j) => ({ ...pq, id: `p${j + 1}`, pos_mm: redondear(pq.pos_mm - parte.desde) }));
      return { ...structuredClone(resto), ...base, ...curva, ...(propios.length ? { piquetes: propios } : {}) } as Borde;
    });
    const contorno = mitad.map((x) => x.tramo);
    const hilo = { ...frag.hilo, punto: r(estaAdentro(frag.hilo.punto, contorno) ? frag.hilo.punto : puntoInterior(contorno)) as unknown as Punto };
    const { escalado: _escalado, huella: _huella, ...heredado } = structuredClone(frag) as Fragmento & { escalado?: unknown };
    const f: Fragmento = {
      ...heredado,
      id: o.ids[indice], version: 1, huella: "",
      nombre: o.nombres?.[indice] ?? `${frag.nombre} · parte ${indice + 1}`,
      autoria: { autor: o.autor, fecha_creacion: o.fecha, fecha_version: o.fecha },
      origen: {
        metodo: "corte", padre: { ref, huella: frag.huella },
        linea: { inicio: r(inicio), tramos: [{ hasta: r(fin) }] },
        lado: indice === 0 ? "izquierda" : "derecha", hermanos: [o.ids[1 - indice]],
        transformacion: { traslacion: [0, 0], rotacion_grados: 0, espejo: false },
      },
      linaje: [...((frag.linaje as unknown[] | undefined) ?? []), padre],
      hilo, vertices, bordes,
    };
    f.huella = await huella(f);
    return f;
  };
  return [await armar(mitades[0], 0), await armar(mitades[1], 1)];
}
