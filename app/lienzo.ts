// El lienzo: las piezas que se trajeron de Patternpedia, lo que se cortó y lo que se va a coser.
// Acá están el modelo y sus operaciones; el dibujo está en pantalla-molde.ts.
// Nada de esto mide: cortar, medir y analizar costuras es del núcleo.

import {
  analizarCosturas, aplanar, cortarFragmento, CorteImposible, cruces, estaAdentro, tramoDeBorde, fragmentoEnTalle, largoDeBorde, lineaDeCorte, nuevaVersion,
  type AnalisisCostura, type Costura, type Fragmento, type Molde, type Punto, type TipoBorde,
} from "../nucleo";
import { cargarFragmento, etiquetaDeTalle, type PiezaDeArchivo } from "./patternpedia";

export interface PiezaL {
  id: string;
  nombre: string;
  fragmento: Fragmento;
  /** Posición en el lienzo, en mm, con y hacia abajo. */
  x: number;
  y: number;
  cantidad: number;
  /** De dónde salió, para mostrar: «Remera · Delantera». */
  procedencia: string;
}

export interface CosturaL {
  id: string;
  a: { pieza: string; borde: string };
  b: { pieza: string; borde: string };
  embebido_mm: number;
}

export interface Lienzo {
  piezas: PiezaL[];
  costuras: CosturaL[];
  contador: number;
}

export const lienzoVacio = (): Lienzo => ({ piezas: [], costuras: [], contador: 0 });

const idAleatorio = (prefijo: string) =>
  prefijo + Array.from({ length: 10 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");

/** Caja de la pieza en el lienzo, contando el margen. */
export function cajaDe(p: PiezaL): { x0: number; y0: number; x1: number; y1: number } {
  const pts = lineaDeCorte(p.fragmento).flatMap((t) => t.puntos);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { x0: p.x + Math.min(...xs), x1: p.x + Math.max(...xs), y0: p.y - Math.max(...ys), y1: p.y - Math.min(...ys) };
}

export const alDoblez = (f: Fragmento) => f.bordes.some((b) => b.tipo === "doblez");
export const piezaDe = (l: Lienzo, id: string | null) => l.piezas.find((p) => p.id === id) ?? null;

/** Trae una pieza del archivo al lienzo, en el talle pedido, a la derecha de lo que ya hay. */
export async function traerPieza(l: Lienzo, p: PiezaDeArchivo, nombreDiseno: string, talle: string, fecha: string): Promise<PiezaL> {
  const base = await cargarFragmento(p);
  if (talle !== base.talle_base && !(base.escalado as { talles?: Record<string, unknown> } | undefined)?.talles?.[talle]) {
    throw new Error(`«${p.nombre}» de ${nombreDiseno} no está en el talle ${etiquetaDeTalle(talle)}. Probá con un talle vecino.`);
  }
  const fragmento = await fragmentoEnTalle(base, talle, idAleatorio("frg-"), etiquetaDeTalle(talle), fecha);
  delete (fragmento as { escalado?: unknown }).escalado; // en el lienzo cada pieza ya está en su talle
  const pieza: PiezaL = {
    // dos prendas tienen «Espalda»: la segunda lleva el nombre de su prenda, para distinguirlas
    id: `p${++l.contador}`, nombre: l.piezas.some((x) => x.nombre === p.nombre) ? `${p.nombre} · ${nombreDiseno}` : p.nombre,
    fragmento, x: 0, y: 0, cantidad: p.cantidad, procedencia: `${nombreDiseno} · ${p.nombre}`,
  };
  ubicar(l, pieza);
  l.piezas.push(pieza);
  return pieza;
}

/** Pone la pieza a la derecha de todo, apoyada en la misma base. */
function ubicar(l: Lienzo, pieza: PiezaL) {
  const derecha = l.piezas.length ? Math.max(...l.piezas.map((p) => cajaDe(p).x1)) + 60 : 0;
  const base = l.piezas.length ? Math.max(...l.piezas.map((p) => cajaDe(p).y1)) : 0;
  const c = cajaDe(pieza);
  pieza.x += derecha - c.x0;
  pieza.y += base - c.y1;
}

export function quitarPieza(l: Lienzo, id: string): number {
  l.piezas = l.piezas.filter((p) => p.id !== id);
  const antes = l.costuras.length;
  l.costuras = l.costuras.filter((c) => c.a.pieza !== id && c.b.pieza !== id);
  return antes - l.costuras.length;
}

/**
 * Corta la pieza por la recta que pasa por dos puntos del lienzo. Las dos partes quedan
 * donde estaban, separadas unos centímetros para que se vean. Devuelve las piezas nuevas
 * y cuántas costuras se soltaron (las que tocaban la pieza cortada).
 */
export async function cortarPieza(l: Lienzo, id: string, a: Punto, b: Punto, autor: string, fecha: string): Promise<{ nuevas: [PiezaL, PiezaL]; costurasSueltas: number }> {
  const pieza = piezaDe(l, id);
  if (!pieza) throw new Error("No hay pieza elegida.");
  const aF: Punto = [a[0] - pieza.x, -(a[1] - pieza.y)], bF: Punto = [b[0] - pieza.x, -(b[1] - pieza.y)];
  const horizontal = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const [izq, der] = await cortarFragmento(pieza.fragmento, aF, bF, { ids: [idAleatorio("frg-"), idAleatorio("frg-")], autor, fecha });
  // nombre por la posición de cada parte, que es como se las reconoce en la mesa
  const centro = (f: Fragmento) => {
    const v = Object.values(f.vertices);
    return [v.reduce((s, q) => s + q[0], 0) / v.length, v.reduce((s, q) => s + q[1], 0) / v.length];
  };
  const ci = centro(izq), cd = centro(der);
  const nombres: [string, string] = horizontal
    ? (ci[1] > cd[1] ? ["arriba", "abajo"] : ["abajo", "arriba"])
    : (ci[0] < cd[0] ? ["izquierda", "derecha"] : ["derecha", "izquierda"]);
  const sep = 25; // mm que se aparta cada parte
  const corrimiento = (nombre: string): [number, number] =>
    nombre === "arriba" ? [0, -sep] : nombre === "abajo" ? [0, sep] : nombre === "izquierda" ? [-sep, 0] : [sep, 0];
  const nuevas = [izq, der].map((f, i) => {
    f.nombre = `${pieza.nombre} · ${nombres[i]}`;
    const [dx, dy] = corrimiento(nombres[i]);
    return { id: `p${++l.contador}`, nombre: f.nombre, fragmento: f, x: pieza.x + dx, y: pieza.y + dy, cantidad: pieza.cantidad, procedencia: pieza.procedencia } as PiezaL;
  }) as [PiezaL, PiezaL];
  const i = l.piezas.indexOf(pieza);
  l.piezas.splice(i, 1, ...nuevas);
  const antes = l.costuras.length;
  l.costuras = l.costuras.filter((c) => c.a.pieza !== id && c.b.pieza !== id);
  return { nuevas, costurasSueltas: antes - l.costuras.length };
}

/**
 * Corta con una misma línea todas las piezas que el trazo toca: las que cruza o las que
 * tienen adentro alguno de sus dos puntos. Cada una se corta de lado a lado por la recta entera.
 */
export async function cortarPorLinea(l: Lienzo, a: Punto, b: Punto, autor: string, fecha: string): Promise<{ nuevas: PiezaL[]; costurasSueltas: number; noCortadas: string[] }> {
  const tocadas = l.piezas.filter((p) => {
    const aF: Punto = [a[0] - p.x, -(a[1] - p.y)], bF: Punto = [b[0] - p.x, -(b[1] - p.y)];
    const tramos = p.fragmento.bordes.map((x) => tramoDeBorde(p.fragmento, x));
    return estaAdentro(aF, tramos) || estaAdentro(bF, tramos) || tramos.some((t) => cruces(t, aF, bF).length > 0);
  });
  if (!tocadas.length) throw new CorteImposible("La línea no toca ninguna pieza. Marcá los dos puntos sobre las piezas que querés cortar, o a sus costados.");
  const nuevas: PiezaL[] = [], noCortadas: string[] = [];
  let costurasSueltas = 0, primerError: Error | null = null;
  for (const p of tocadas) {
    try {
      const r = await cortarPieza(l, p.id, a, b, autor, fecha);
      nuevas.push(...r.nuevas);
      costurasSueltas += r.costurasSueltas;
    } catch (e) {
      if (!(e instanceof CorteImposible)) throw e;
      primerError ??= e;
      noCortadas.push(p.nombre);
    }
  }
  if (!nuevas.length) throw primerError!;
  return { nuevas, costurasSueltas, noCortadas };
}

export function coser(l: Lienzo, a: { pieza: string; borde: string }, b: { pieza: string; borde: string }): CosturaL {
  if (a.pieza === b.pieza && a.borde === b.borde) throw new Error("Un borde no se cose consigo mismo.");
  for (const lado of [a, b]) {
    const tipo = piezaDe(l, lado.pieza)!.fragmento.bordes.find((x) => x.id === lado.borde)!.tipo;
    if (tipo === "doblez") throw new Error("Ese borde va al doblez de la tela: no se cose.");
    if (l.costuras.some((c) => [c.a, c.b].some((x) => x.pieza === lado.pieza && x.borde === lado.borde))) {
      throw new Error("Ese borde ya está en otra costura. Quitá esa costura primero.");
    }
  }
  const c: CosturaL = { id: `c${++l.contador}`, a, b, embebido_mm: 0 };
  l.costuras.push(c);
  return c;
}

/** Cambia el tipo o el margen de un borde. El fragmento es inmutable: nace su versión siguiente. */
export async function editarBorde(pieza: PiezaL, bordeId: string, cambio: { tipo?: TipoBorde; margen_mm?: number }, fecha: string) {
  pieza.fragmento = await nuevaVersion(pieza.fragmento, (f) => {
    const b = f.bordes.find((x) => x.id === bordeId)!;
    if (cambio.tipo) b.tipo = cambio.tipo;
    if (cambio.margen_mm !== undefined) b.margen_mm = cambio.margen_mm;
    if (b.tipo === "costura" || b.tipo === "dobladillo") b.margen_mm ??= 10;
    else delete b.margen_mm;
  }, fecha);
}

/** El molde que describe el lienzo: una pieza por fragmento y las costuras entre ellas. */
export function moldeDelLienzo(l: Lienzo, id: string, nombre: string, autor: string, fecha: string): Molde {
  const talles = new Set(l.piezas.map((p) => p.fragmento.talle_base as string | undefined));
  const lado = (x: { pieza: string; borde: string }) => ({ pieza: x.pieza, bordes: [`a#${x.borde}`] });
  const costuras: Costura[] = l.costuras.map((c) => ({ id: c.id, a: lado(c.a), b: lado(c.b), ...(c.embebido_mm ? { embebido_mm: c.embebido_mm } : {}) }));
  return {
    pattrn: "0.1", tipo: "molde", id, nombre, unidades: "mm", licencia: "CC-BY-SA-4.0",
    autoria: { autor, fecha },
    ...(talles.size === 1 && [...talles][0] ? { talle: [...talles][0] } : {}),
    telas: [{ id: "tela", descripcion: "tela a definir" }],
    piezas: l.piezas.map((p) => ({
      id: p.id, nombre: p.nombre, cortes: { cantidad: p.cantidad },
      instancias: [{
        id: "a", ref: `${p.fragmento.id}@${p.fragmento.version}`, huella: p.fragmento.huella, tela: "tela",
        transformacion: { traslacion: [0, 0], rotacion_grados: 0, espejo: false },
      }],
    })),
    ...(costuras.length ? { costuras } : {}),
  };
}

export interface EstadoDeCostura {
  costura: CosturaL;
  analisis: AnalisisCostura;
  nombreA: string;
  nombreB: string;
}

/** Cada costura con sus dos largos y lo que sobra, medido por el núcleo. */
export function estadoDeCosturas(l: Lienzo): EstadoDeCostura[] {
  if (!l.costuras.length) return [];
  const molde = moldeDelLienzo(l, "mol-lienzo00", "lienzo", "", "2000-01-01");
  const porRef = new Map(l.piezas.map((p) => [`${p.fragmento.id}@${p.fragmento.version}`, p.fragmento]));
  const analisis = analizarCosturas(molde, (ref) => porRef.get(ref)!);
  return l.costuras.map((costura, i) => ({
    costura, analisis: analisis[i],
    nombreA: `${piezaDe(l, costura.a.pieza)!.nombre} ${costura.a.borde}`,
    nombreB: `${piezaDe(l, costura.b.pieza)!.nombre} ${costura.b.borde}`,
  }));
}

/** Rearma el lienzo a partir de un molde guardado y sus fragmentos. */
export function lienzoDeMolde(molde: Molde, fragmentos: Fragmento[], posiciones: Record<string, [number, number]> | undefined): Lienzo {
  const l = lienzoVacio();
  for (const pz of molde.piezas) {
    const ref = pz.instancias[0]?.ref;
    const fragmento = fragmentos.find((f) => `${f.id}@${f.version}` === ref);
    if (!fragmento) continue;
    const pos = posiciones?.[pz.id];
    const pieza: PiezaL = {
      id: pz.id, nombre: pz.nombre, fragmento, x: pos?.[0] ?? 0, y: pos?.[1] ?? 0,
      cantidad: (pz.cortes as { cantidad?: number } | undefined)?.cantidad ?? 1, procedencia: "",
    };
    if (!pos) ubicar(l, pieza);
    l.piezas.push(pieza);
  }
  const lado = (x: { pieza: string; bordes: string[] }) => ({ pieza: x.pieza, borde: x.bordes[0].split("#")[1] });
  for (const c of molde.costuras ?? []) {
    if (piezaDe(l, c.a.pieza) && piezaDe(l, c.b.pieza)) l.costuras.push({ id: c.id, a: lado(c.a), b: lado(c.b), embebido_mm: c.embebido_mm ?? 0 });
  }
  const numeros = [...l.piezas.map((p) => p.id), ...l.costuras.map((c) => c.id)].map((x) => Number(x.slice(1))).filter(Number.isFinite);
  l.contador = Math.max(0, ...numeros);
  return l;
}

/** Punto medio de un borde en coordenadas del lienzo, para dibujar la costura. */
export function medioDeBorde(p: PiezaL, bordeId: string, tramos: (f: Fragmento, id: string) => Punto[]): Punto {
  const pts = tramos(p.fragmento, bordeId);
  const q = pts[Math.floor(pts.length / 2)];
  return [p.x + q[0], p.y - q[1]];
}

export { aplanar, largoDeBorde };
