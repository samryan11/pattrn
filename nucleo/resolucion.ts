// Resolución de bordes de unión distintos. El software calcula las opciones y sus
// consecuencias; la persona elige. Nada se aplica sin una resolución aceptada en el
// molde. Los fragmentos no se tocan: lo que cambia es la geometría calculada de la pieza.
//
// - manda_a / manda_b: el borde que manda queda como está; el otro fragmento lleva el
//   extremo de su borde vecino hasta el extremo del que manda.
// - transicion: los dos extremos se encuentran en el punto medio y cada borde vecino se
//   redibuja con una curva suave en los últimos zona_mm, tangente al tramo que no cambia.
//
// Un borde terminado solo se puede acortar a lo largo de sí mismo: nunca se alarga, se
// mueve ni se redibuja. Una opción que lo exigiría se ofrece como no disponible, con el motivo.

import {
  derivadaEn, dividir, distancia, largo, parametroEnLargo, puntoEn,
  type Punto, type Tramo,
} from "./geometria";
import { tramoDeBorde } from "./fragmento";
import type { Borde, Fragmento, Fusion, Molde, Pieza } from "./tipos";
import type { Resolver } from "./molde";
import { cm } from "./unidades";

export type ModoResolucion = "manda_a" | "manda_b" | "transicion";

export interface TramoDePieza {
  /** instancia#borde de donde sale. */
  origen: string;
  borde: Borde;
  tramo: Tramo;
  /** true si la resolución lo cambió respecto del fragmento. */
  modificado: boolean;
}

export interface CambioDeBorde {
  origen: string;
  etiqueta: string;
  antes: number;
  despues: number;
  descripcion: string;
}

export interface OpcionDeResolucion {
  modo: ModoResolucion;
  disponible: boolean;
  /** Por qué no está disponible. */
  motivo?: string;
  cambios: CambioDeBorde[];
  /** Contorno de la pieza si se aplicara esta opción. */
  contorno: TramoDePieza[];
}

const TOLERANCIA = 0.005; // mm: por debajo de esto, dos puntos coinciden

interface Instancia {
  id: string;
  frag: Fragmento;
  tramos: Tramo[];
}

function instancias(pieza: Pieza, resolver: Resolver): Map<string, Instancia> {
  return new Map(pieza.instancias.map((i) => {
    const frag = resolver(i.ref, i.huella);
    return [i.id, { id: i.id, frag, tramos: frag.bordes.map((b) => tramoDeBorde(frag, b, i.transformacion)) }];
  }));
}

function separar(ref: string) {
  const [inst, borde] = ref.split("#");
  return { inst, borde };
}

const desde = (t: Tramo) => t.p0;
const hasta = (t: Tramo) => t.p1;

/** Lleva un extremo del tramo a `nuevo`; en una curva, el punto de control vecino acompaña al extremo. */
function moverExtremo(t: Tramo, extremo: "inicio" | "fin", nuevo: Punto): Tramo {
  const viejo = extremo === "inicio" ? t.p0 : t.p1;
  const d: Punto = [nuevo[0] - viejo[0], nuevo[1] - viejo[1]];
  const mas = (p: Punto): Punto => [p[0] + d[0], p[1] + d[1]];
  if (t.tipo === "recta") return extremo === "inicio" ? { ...t, p0: nuevo } : { ...t, p1: nuevo };
  return extremo === "inicio" ? { ...t, p0: nuevo, c1: mas(t.c1) } : { ...t, p1: nuevo, c2: mas(t.c2) };
}

/** Si `p` está sobre el tramo, el parámetro donde está; si no, null. */
function parametroSobre(t: Tramo, p: Punto): number | null {
  let mejor = 0, dMejor = Infinity;
  for (let i = 0; i <= 400; i++) {
    const d = distancia(puntoEn(t, i / 400), p);
    if (d < dMejor) { dMejor = d; mejor = i / 400; }
  }
  let lo = Math.max(0, mejor - 1 / 400), hi = Math.min(1, mejor + 1 / 400);
  for (let k = 0; k < 60; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (distancia(puntoEn(t, m1), p) < distancia(puntoEn(t, m2), p)) hi = m2;
    else lo = m1;
  }
  const t0 = (lo + hi) / 2;
  return distancia(puntoEn(t, t0), p) < 0.01 ? t0 : null;
}

/**
 * Reemplaza los últimos `zona` mm del tramo (del lado de `extremo`) por una curva
 * que llega a `nuevo`. Devuelve los tramos en el sentido original del borde.
 */
function transicionarExtremo(t: Tramo, extremo: "inicio" | "fin", nuevo: Punto, zona: number): Tramo[] {
  const L = largo(t);
  const s = extremo === "fin" ? L - zona : zona;
  const u = parametroEnLargo(t, s);
  const [antes, despues] = dividir(t, u);
  const P = extremo === "fin" ? despues.p0 : antes.p1;
  const tangente = (v: Punto): Punto => { const n = Math.hypot(v[0], v[1]); return [v[0] / n, v[1] / n]; };
  // dirección de avance hacia la esquina, en el punto de corte y en la esquina original
  const dirP = tangente(extremo === "fin" ? derivadaEn(t, u) : (([x, y]) => [-x, -y] as Punto)(derivadaEn(t, u)));
  const dirE = tangente(extremo === "fin" ? derivadaEn(t, 1) : (([x, y]) => [-x, -y] as Punto)(derivadaEn(t, 0)));
  const k = distancia(P, nuevo) / 3;
  const c1: Punto = [P[0] + dirP[0] * k, P[1] + dirP[1] * k];
  const c2: Punto = [nuevo[0] - dirE[0] * k, nuevo[1] - dirE[1] * k];
  // en el extremo de inicio la curva se recorre al revés: nuevo → P
  if (extremo === "fin") return [antes, { tipo: "bezier", p0: P, c1, c2, p1: nuevo }];
  return [{ tipo: "bezier", p0: nuevo, c1: c2, c2: c1, p1: P }, despues];
}

interface Ajuste {
  inst: string;
  indice: number;
  extremo: "inicio" | "fin";
  nuevo: Punto;
  forma: "mover" | "transicion";
}

/** Contorno de la pieza: las cadenas de cada instancia sin los bordes fusionados, con los ajustes aplicados. */
function contornoDePieza(
  insts: Map<string, Instancia>, fusion: Fusion, ajustes: Ajuste[], zona: number,
): { contorno: TramoDePieza[]; problemas: string[] } {
  const problemas: string[] = [];
  const cadena = (ref: string): TramoDePieza[] => {
    const { inst, borde } = separar(ref);
    const x = insts.get(inst)!;
    const i = x.frag.bordes.findIndex((b) => b.id === borde);
    const n = x.frag.bordes.length;
    const out: TramoDePieza[] = [];
    for (let k = 1; k < n; k++) {
      const j = (i + k) % n;
      const b = x.frag.bordes[j];
      let tramos: Tramo[] = [x.tramos[j]];
      let modificado = false;
      for (const aj of ajustes.filter((a) => a.inst === inst && a.indice === j)) {
        modificado = true;
        const t = tramos[aj.extremo === "inicio" ? 0 : tramos.length - 1];
        if (b.tipo === "terminado") {
          // solo se acorta a lo largo de sí mismo
          const u = parametroSobre(t, aj.nuevo);
          if (u === null) {
            problemas.push(`${inst}#${b.id} (${b.etiqueta}) es un borde terminado: no se puede alargar, mover ni redibujar`);
            continue;
          }
          const [p, q] = dividir(t, u);
          tramos = aj.extremo === "inicio" ? [q, ...tramos.slice(1)] : [...tramos.slice(0, -1), p];
        } else if (aj.forma === "mover") {
          const m = moverExtremo(t, aj.extremo, aj.nuevo);
          tramos = aj.extremo === "inicio" ? [m, ...tramos.slice(1)] : [...tramos.slice(0, -1), m];
        } else {
          if (largo(t) <= zona + 1) {
            problemas.push(`${inst}#${b.id} (${b.etiqueta}) mide ${cm(largo(t))}: es más corto que la zona de transición`);
            continue;
          }
          const nuevos = transicionarExtremo(t, aj.extremo, aj.nuevo, zona);
          tramos = aj.extremo === "inicio" ? [...nuevos, ...tramos.slice(1)] : [...tramos.slice(0, -1), ...nuevos];
        }
      }
      for (const t of tramos) out.push({ origen: `${inst}#${b.id}`, borde: b, tramo: t, modificado });
    }
    return out;
  };
  return { contorno: [...cadena(fusion.a), ...cadena(fusion.b)], problemas };
}

/** Los dos extremos de la fusión: qué punto de a corresponde a qué punto de b, y qué bordes vecinos tocan. */
function extremos(insts: Map<string, Instancia>, fusion: Fusion) {
  const ra = separar(fusion.a), rb = separar(fusion.b);
  const A = insts.get(ra.inst)!, B = insts.get(rb.inst)!;
  const ia = A.frag.bordes.findIndex((b) => b.id === ra.borde);
  const ib = B.frag.bordes.findIndex((b) => b.id === rb.borde);
  const na = A.frag.bordes.length, nb = B.frag.bordes.length;
  const ta = A.tramos[ia], tb = B.tramos[ib];
  // los contornos son antihorarios: a.de se une con b.a, y a.a con b.de
  return [
    { nombre: "inicio", pa: desde(ta), pb: hasta(tb),
      vecinoA: { inst: A.id, indice: (ia - 1 + na) % na, extremo: "fin" as const },
      vecinoB: { inst: B.id, indice: (ib + 1) % nb, extremo: "inicio" as const } },
    { nombre: "fin", pa: hasta(ta), pb: desde(tb),
      vecinoA: { inst: A.id, indice: (ia + 1) % na, extremo: "inicio" as const },
      vecinoB: { inst: B.id, indice: (ib - 1 + nb) % nb, extremo: "fin" as const } },
  ];
}

function ajustesPara(modo: ModoResolucion | "ninguna", insts: Map<string, Instancia>, fusion: Fusion): Ajuste[] {
  if (modo === "ninguna") return [];
  const out: Ajuste[] = [];
  for (const e of extremos(insts, fusion)) {
    if (distancia(e.pa, e.pb) < TOLERANCIA) continue;
    if (modo === "manda_a") out.push({ ...e.vecinoB, nuevo: e.pa, forma: "mover" });
    else if (modo === "manda_b") out.push({ ...e.vecinoA, nuevo: e.pb, forma: "mover" });
    else {
      const medio: Punto = [(e.pa[0] + e.pb[0]) / 2, (e.pa[1] + e.pb[1]) / 2];
      out.push({ ...e.vecinoA, nuevo: medio, forma: "transicion" }, { ...e.vecinoB, nuevo: medio, forma: "transicion" });
    }
  }
  return out;
}

function pieza(molde: Molde, piezaId: string): Pieza {
  const p = molde.piezas.find((x) => x.id === piezaId);
  if (!p) throw new Error(`${molde.id}: no existe la pieza ${piezaId}`);
  if ((p.fusiones ?? []).length > 1) throw new Error("por ahora se resuelve una fusión por pieza");
  return p;
}

/** Las tres opciones para la fusión de la pieza, con lo que cambiaría cada una. No aplica nada. */
export function opcionesDeResolucion(molde: Molde, resolver: Resolver, piezaId: string, zona_mm = 60): OpcionDeResolucion[] {
  const p = pieza(molde, piezaId);
  const fusion = p.fusiones![0];
  const insts = instancias(p, resolver);
  const base = contornoDePieza(insts, fusion, [], zona_mm).contorno;
  return (["manda_a", "manda_b", "transicion"] as const).map((modo) => {
    const { contorno, problemas } = contornoDePieza(insts, fusion, ajustesPara(modo, insts, fusion), zona_mm);
    const cambios: CambioDeBorde[] = [];
    for (const origen of new Set(contorno.filter((t) => t.modificado).map((t) => t.origen))) {
      const antes = base.filter((t) => t.origen === origen).reduce((s, t) => s + largo(t.tramo), 0);
      const despues = contorno.filter((t) => t.origen === origen).reduce((s, t) => s + largo(t.tramo), 0);
      const borde = contorno.find((t) => t.origen === origen)!.borde;
      const movido = Math.max(...extremos(insts, fusion).map((e) => distancia(e.pa, e.pb))) / (modo === "transicion" ? 2 : 1);
      cambios.push({
        origen, etiqueta: borde.etiqueta, antes, despues,
        descripcion: modo === "transicion"
          ? `se redibuja en los ${cm(zona_mm)} junto a la unión y su extremo se mueve ${cm(movido)}`
          : `su extremo junto a la unión se mueve ${cm(movido)}`,
      });
    }
    return {
      modo,
      disponible: problemas.length === 0,
      motivo: problemas.length ? problemas.join("; ") : undefined,
      cambios,
      contorno,
    };
  });
}

/** Contorno de la pieza con la resolución que tiene guardada el molde ("ninguna": los fragmentos tal cual). */
export function contornoResuelto(molde: Molde, resolver: Resolver, piezaId: string): TramoDePieza[] {
  const p = pieza(molde, piezaId);
  const fusion = p.fusiones?.[0];
  if (!fusion) throw new Error(`${piezaId}: la pieza no tiene fusiones`);
  const insts = instancias(p, resolver);
  const r = fusion.resolucion;
  if (r.modo !== "ninguna" && !r.aceptada) throw new Error("una resolución sin aceptar no se aplica");
  const { contorno, problemas } = contornoDePieza(insts, fusion, ajustesPara(r.modo, insts, fusion), r.zona_mm ?? 60);
  if (problemas.length) throw new Error(problemas.join("; "));
  return contorno;
}

/** Devuelve una copia del molde con la resolución elegida y aceptada hoy. El molde original no cambia. */
export function aplicarResolucion(molde: Molde, piezaId: string, modo: ModoResolucion | "ninguna", fecha: string, zona_mm = 60): Molde {
  const copia: Molde = structuredClone(molde);
  const p = pieza(copia, piezaId);
  p.fusiones![0].resolucion = modo === "ninguna" ? { modo }
    : modo === "transicion" ? { modo, aceptada: fecha, zona_mm }
    : { modo, aceptada: fecha };
  return copia;
}
