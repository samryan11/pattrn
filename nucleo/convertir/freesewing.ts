// Conversor de FreeSewing a fragmentos PATTRN.
//
// FreeSewing (MIT) genera cada molde a la medida de quien lo usa. Este conversor toma una
// parte ya generada y la escribe como fragmento: el contorno es el mismo (rectas y Bézier
// cúbicas, sin aproximar), y el hilo, los piquetes, el doblez y el margen salen de lo que la
// parte trae. Lo que la fuente no dice no se inventa: se marca como incierto.
//
// No depende de los paquetes de FreeSewing: recibe la parte como datos. Quien la genera es
// herramientas/convertir-freesewing.ts.

import { aplanar, distancia, largo, puntoEn, redondear, type Punto, type Tramo } from "../geometria";
import { huella } from "../huella";
import type { Borde, Fragmento, Piquete } from "../tipos";

export interface PuntoFS { x: number; y: number }
export interface OpFS { type: string; to?: PuntoFS; cp1?: PuntoFS; cp2?: PuntoFS }
export interface CaminoFS { ops: OpFS[]; hidden?: boolean }
export interface ParteFS {
  hidden?: boolean;
  paths: Record<string, CaminoFS>;
  points: Record<string, PuntoFS>;
  snippets: Record<string, { def: string; anchor: PuntoFS }>;
}
/** Entrada de la lista de corte de FreeSewing para una parte. */
export interface CorteFS {
  cutOnFold?: PuntoFS[];
  grain?: number;
  materials?: Record<string, { cut: number; onFold: boolean | number }[]>;
}

export interface FuenteFS {
  /** Diseño y parte, por ejemplo "teagan/front". */
  id: string;
  version: string;
  licencia: string;
  url: string;
  aviso: string;
  autor: string;
}

export interface EntradaFS {
  /** La parte generada con margen (`sa`) mayor que cero: de ahí se mide el margen de cada borde. */
  parte: ParteFS;
  corte?: CorteFS;
  nombreParte: string;
  nombre: string;
  id: string;
  fuente: FuenteFS;
  talleBase: string;
  medidas: Record<string, number>;
  opciones?: Record<string, unknown>;
  /** La misma parte generada con otras medidas, para la graduación por deltas. */
  talles?: Record<string, ParteFS>;
  fecha: string;
}

export interface ResultadoFS {
  fragmento: Fragmento;
  /** Lo que el conversor no pudo resolver y conviene revisar. */
  avisos: string[];
  /** Cantidad de veces que la fuente indica cortar la pieza. */
  cortar?: number;
}

const TOL = 0.05; // mm: debajo de esto dos puntos son el mismo
const VERSION_CONVERSOR = "pattrn-freesewing 0.1";

interface Contorno {
  tramos: Tramo[];
  /** Nombres de los puntos de FreeSewing que caen en el inicio de cada tramo. */
  nombres: string[][];
  piquetes: Punto[];
  margen: Punto[] | null;
}

const p = (q: PuntoFS): Punto => [q.x, -q.y]; // FreeSewing tiene y hacia abajo

/** Polilínea de un camino, para medir distancias contra él. */
function polilinea(c: CaminoFS): Punto[] {
  const pts: Punto[] = [];
  let desde: Punto | null = null;
  for (const op of c.ops) {
    if (!op.to) continue;
    const a = p(op.to);
    if (op.type === "curve" && desde && op.cp1 && op.cp2) {
      pts.push(...aplanar({ tipo: "bezier", p0: desde, c1: p(op.cp1), c2: p(op.cp2), p1: a }).slice(1));
    } else pts.push(a);
    desde = a;
  }
  return pts;
}

function area(tramos: Tramo[]): number {
  let a = 0;
  for (const t of tramos) {
    const n = t.tipo === "recta" ? 1 : 64;
    for (let i = 0; i < n; i++) {
      const u = puntoEn(t, i / n), v = puntoEn(t, (i + 1) / n);
      a += u[0] * v[1] - v[0] * u[1];
    }
  }
  return a / 2;
}

const invertir = (t: Tramo): Tramo =>
  t.tipo === "recta" ? { tipo: "recta", p0: t.p1, p1: t.p0 } : { tipo: "bezier", p0: t.p1, c1: t.c2, c2: t.c1, p1: t.p0 };

/** Lee el contorno `seam` de una parte, en coordenadas PATTRN y en sentido antihorario. */
export function leerContorno(parte: ParteFS): Contorno {
  const seam = parte.paths.seam;
  if (!seam) throw new Error("la parte no tiene camino «seam»");
  if (seam.ops.filter((o) => o.type === "move").length !== 1) throw new Error("el contorno tiene más de un trazo");
  let tramos: Tramo[] = [];
  let inicio: Punto | null = null, desde: Punto | null = null;
  for (const op of seam.ops) {
    if (op.type === "move" && op.to) { inicio = desde = p(op.to); continue; }
    const a = op.type === "close" ? inicio : op.to ? p(op.to) : null;
    if (!a || !desde) continue;
    if (op.type === "curve" && op.cp1 && op.cp2) tramos.push({ tipo: "bezier", p0: desde, c1: p(op.cp1), c2: p(op.cp2), p1: a });
    else if (distancia(desde, a) > TOL) tramos.push({ tipo: "recta", p0: desde, p1: a });
    desde = a;
  }
  tramos = tramos.filter((t) => largo(t) > TOL);
  if (tramos.length < 2) throw new Error("el contorno tiene menos de dos bordes");
  const ultimo = tramos[tramos.length - 1].p1;
  if (distancia(ultimo, tramos[0].p0) > TOL) tramos.push({ tipo: "recta", p0: ultimo, p1: tramos[0].p0 });
  if (area(tramos) < 0) tramos = tramos.map(invertir).reverse();
  // cada tramo empieza exactamente donde termina el anterior
  tramos = tramos.map((t, i) => ({ ...t, p0: tramos[(i + tramos.length - 1) % tramos.length].p1 }));

  const nombres = tramos.map((t) => Object.entries(parte.points)
    .filter(([k, q]) => !k.startsWith("__") && distancia(p(q), t.p0) <= TOL).map(([k]) => k));
  const piquetes = Object.values(parte.snippets).filter((s) => s.def === "notch" || s.def === "bnotch").map((s) => p(s.anchor));
  return { tramos, nombres, piquetes, margen: parte.paths.sa ? polilinea(parte.paths.sa) : null };
}

function distanciaASegmento(q: Punto, a: Punto, b: Punto): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
  return Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy));
}

/**
 * Margen que la fuente le da a un borde: la distancia del borde a la línea de corte, medida en
 * tres puntos. Si las tres no coinciden, la línea de corte no acompaña a este borde: la fuente
 * no le da margen (por ejemplo, un escote que se termina con un vivo) y se devuelve null.
 */
function margenDe(t: Tramo, corte: Punto[]): number | null {
  const d = [0.25, 0.5, 0.75].map((u) => {
    const m = puntoEn(t, u);
    let min = Infinity;
    for (let i = 0; i < corte.length - 1; i++) min = Math.min(min, distanciaASegmento(m, corte[i], corte[i + 1]));
    return min;
  });
  if (Math.max(...d) - Math.min(...d) > 0.75) return null;
  return Math.round(d[1] * 2) / 2; // al medio milímetro: la fuente trabaja con márgenes redondos
}

/** Distancia sobre el tramo hasta el punto más cercano a `q`, y qué tan lejos queda. */
function posicionEn(t: Tramo, q: Punto): { pos: number; error: number } {
  let mejor = 0, error = Infinity;
  const N = 400;
  for (let i = 0; i <= N; i++) {
    const d = distancia(puntoEn(t, i / N), q);
    if (d < error) { error = d; mejor = i / N; }
  }
  let a = Math.max(0, mejor - 1 / N), b = Math.min(1, mejor + 1 / N);
  for (let k = 0; k < 40; k++) {
    const u = a + (b - a) / 3, v = b - (b - a) / 3;
    if (distancia(puntoEn(t, u), q) < distancia(puntoEn(t, v), q)) b = v; else a = u;
  }
  const u = (a + b) / 2;
  return { pos: largo(t, 0, u), error: distancia(puntoEn(t, u), q) };
}

const tiene = (nombres: string[], patron: RegExp) => nombres.some((n) => patron.test(n));

/** Etiqueta del borde según los nombres de sus dos extremos en FreeSewing. null si no se deduce. */
export function etiquetaDe(a: string[], b: string[], nombreParte: string): string | null {
  const ambos = (re: RegExp) => tiene(a, re) && tiene(b, re);
  const cruzado = (r1: RegExp, r2: RegExp) => (tiene(a, r1) && tiene(b, r2)) || (tiene(a, r2) && tiene(b, r1));
  const RUEDO = /hem|hips$/i, MUNECA = /wrist/i, CUELLO = /neck|hps/i, HOMBRO = /^shoulder/i, SISA = /armhole/i;
  const COPA = /^cap|biceps|sleevecap/i;
  if (ambos(MUNECA)) return "puno";
  if (/sleeve/i.test(nombreParte)) {
    if (ambos(RUEDO)) return "ruedo";
    if (ambos(COPA)) return "copa_manga";
    if (cruzado(/biceps/i, /wrist|hem/i)) return "costura_manga";
    return null;
  }
  const BRETEL = /^strap/i;
  if (ambos(BRETEL)) return "hombro";
  if (cruzado(BRETEL, SISA)) return "sisa";
  if (cruzado(BRETEL, CUELLO)) return "escote";
  if (ambos(RUEDO)) return "ruedo";
  if (ambos(CUELLO)) return "escote";
  if (cruzado(HOMBRO, CUELLO)) return "hombro";
  if (cruzado(RUEDO, SISA)) return "lateral";
  if (ambos(SISA) || cruzado(SISA, HOMBRO)) return "sisa";
  return null;
}

/** Un punto adentro del contorno, para apoyar el hilo: el medio del tramo más ancho a media altura. */
function puntoInterior(tramos: Tramo[]): Punto {
  const pts = tramos.flatMap((t) => aplanar(t).slice(0, -1));
  const ys = pts.map((q) => q[1]);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2 + 0.137; // corrido para no caer justo en un vértice
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
  }
  xs.sort((m, n) => m - n);
  let mejor: [number, number] = [xs[0], xs[1]];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > mejor[1] - mejor[0]) mejor = [xs[i], xs[i + 1]];
  return [(mejor[0] + mejor[1]) / 2, y];
}

const r2 = (q: Punto): Punto => [redondear(q[0]), redondear(q[1])];

/** Convierte una parte de FreeSewing en un fragmento PATTRN. */
export async function fragmentoDeFreeSewing(e: EntradaFS): Promise<ResultadoFS> {
  const avisos: string[] = [];
  const c = leerContorno(e.parte);
  const n = c.tramos.length;

  // origen en la esquina inferior izquierda del talle base; los otros talles usan el mismo corrimiento
  const todos = c.tramos.flatMap((t) => aplanar(t));
  const dx = -Math.min(...todos.map((q) => q[0])), dy = -Math.min(...todos.map((q) => q[1]));
  const mover = (q: Punto): Punto => [q[0] + dx, q[1] + dy];

  // línea del doblez, si la fuente la marca
  const doblez = e.corte?.cutOnFold?.length === 2 ? e.corte.cutOnFold.map(p) as [Punto, Punto] : null;
  const sobreDoblez = (q: Punto) => {
    if (!doblez) return false;
    const [a, b] = doblez, L = distancia(a, b);
    return L > 0 && Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / L <= TOL;
  };

  const vertices: Record<string, [number, number]> = {};
  const bordes: Borde[] = c.tramos.map((t, k) => {
    vertices[`v${k + 1}`] = r2(mover(t.p0)) as [number, number];
    const de = c.nombres[k], a = c.nombres[(k + 1) % n];
    const b: Borde = { id: `b${k + 1}`, de: `v${k + 1}`, a: `v${(k + 1) % n + 1}`, etiqueta: "otro", tipo: "costura" };
    if (t.tipo === "bezier") b.curva = { tipo: "bezier", c1: r2(mover(t.c1)), c2: r2(mover(t.c2)) };
    const original = `${de[0] ?? "?"} → ${a[0] ?? "?"}`;

    if (t.tipo === "recta" && sobreDoblez(t.p0) && sobreDoblez(t.p1)) {
      b.tipo = "doblez";
      // manda el nombre de la parte; los nombres de los puntos solo deciden si ese no dice nada
      const porParte = /front/i.test(e.nombreParte) ? "frente" : /back/i.test(e.nombreParte) ? "espalda" : null;
      const cf = tiene([...de, ...a], /^cf/), cb = tiene([...de, ...a], /^cb/);
      const lado = porParte ?? (cf && !cb ? "frente" : cb && !cf ? "espalda" : null);
      if (lado === "frente") b.etiqueta = "centro_frente";
      else if (lado === "espalda") b.etiqueta = "centro_espalda";
      else b.descripcion = `al doblez (${original} en FreeSewing)`;
      return b;
    }

    const etiqueta = etiquetaDe(de, a, e.nombreParte);
    if (etiqueta) {
      b.etiqueta = etiqueta;
      b.descripcion = `${original} en FreeSewing`;
    } else {
      b.descripcion = `sin nombre deducible (${original} en FreeSewing)`;
      b.certeza = { estado: "incierta", motivo: "etiqueta_deducida", nota: "El conversor no pudo deducir qué es este borde." };
      avisos.push(`${b.id}: no se pudo deducir la etiqueta (${original})`);
    }
    // un ruedo o un puño no se cosen a otra pieza: se terminan doblando el margen
    if (etiqueta === "ruedo" || etiqueta === "puno") b.tipo = "dobladillo";

    const medido = c.margen ? margenDe(t, c.margen) : null;
    if (medido !== null) b.margen_mm = medido;
    else if (c.margen) {
      // la fuente dibuja línea de corte pero no para este borde: va sin margen, a propósito
      b.margen_mm = 0;
      b.descripcion = `${b.descripcion} · sin margen en el original: se termina con un vivo o queda al corte`;
      avisos.push(`${b.id}: la fuente no le da margen (${original})`);
    } else {
      b.margen_mm = 10;
      b.certeza = { estado: "incierta", motivo: "margen_desconocido", nota: "La fuente no traía línea de corte: margen asignado por el conversor." };
      avisos.push(`${b.id}: margen asignado por el conversor`);
    }
    return b;
  });

  // piquetes: cada uno va al borde sobre el que cae
  const ubicar = (tramos: Tramo[], q: Punto) => {
    let mejor = { borde: -1, pos: 0, error: Infinity };
    tramos.forEach((t, k) => {
      const x = posicionEn(t, q);
      if (x.error < mejor.error) mejor = { borde: k, ...x };
    });
    return mejor;
  };
  const piquetesBase = c.piquetes.map((q) => ubicar(c.tramos, q));
  const idDePiquete: (string | null)[] = [];
  piquetesBase.forEach((x, i) => {
    if (x.error > 0.5) { avisos.push(`piquete ${i + 1}: no cae sobre ningún borde (queda a ${x.error.toFixed(1)} mm) y se descarta`); idDePiquete.push(null); return; }
    const b = bordes[x.borde];
    const lista = (b.piquetes ??= []) as Piquete[];
    const id = `p${lista.length + 1}`;
    lista.push({ id, pos_mm: redondear(x.pos) });
    idDePiquete.push(`${b.id}.${id}`);
  });
  for (const b of bordes) b.piquetes?.sort((x, y) => x.pos_mm - y.pos_mm);

  // hilo
  const conHilo = typeof e.corte?.grain === "number";
  const angulo = conHilo ? ((360 - (e.corte!.grain as number)) % 360 + 360) % 360 : 90;
  if (!conHilo) avisos.push("hilo: la fuente no lo marca; se supuso vertical");
  const hilo = {
    punto: r2(mover(puntoInterior(c.tramos))) as unknown as Punto,
    angulo_grados: angulo >= 180 ? angulo - 180 : angulo, // el hilo es una dirección: 90 y 270 son lo mismo
    fuente: conHilo ? "marcado_en_original" : "deducido_por_conversor",
    sentido_unico: false,
  };

  // graduación: la misma parte en otros talles, como deltas contra el talle base
  const escalado: { metodo: "deltas"; talles: Record<string, { deltas: Record<string, Punto>; piquetes?: Record<string, number> }> } = { metodo: "deltas", talles: {} };
  for (const [talle, parte] of Object.entries(e.talles ?? {})) {
    let o: Contorno;
    try { o = leerContorno(parte); } catch (err) { avisos.push(`talle ${talle}: ${(err as Error).message}; se omite`); continue; }
    if (o.tramos.length !== n || o.tramos.some((t, k) => t.tipo !== c.tramos[k].tipo) || o.piquetes.length !== c.piquetes.length) {
      avisos.push(`talle ${talle}: el contorno no tiene la misma forma que el talle base; se omite`);
      continue;
    }
    const deltas: Record<string, Punto> = {};
    const dif = (a: Punto, b: Punto): Punto => [redondear(a[0] - b[0]), redondear(a[1] - b[1])];
    o.tramos.forEach((t, k) => {
      const base = c.tramos[k];
      deltas[`v${k + 1}`] = dif(t.p0, base.p0);
      if (t.tipo === "bezier" && base.tipo === "bezier") {
        deltas[`b${k + 1}.c1`] = dif(t.c1, base.c1);
        deltas[`b${k + 1}.c2`] = dif(t.c2, base.c2);
      }
    });
    const piquetes: Record<string, number> = {};
    o.piquetes.forEach((q, i) => {
      const clave = idDePiquete[i];
      if (clave) piquetes[clave] = redondear(posicionEn(o.tramos[piquetesBase[i].borde], q).pos);
    });
    escalado.talles[talle] = Object.keys(piquetes).length ? { deltas, piquetes } : { deltas };
  }

  const cambios = [
    "Coordenadas con el eje y hacia arriba y origen en la esquina inferior izquierda.",
    "El margen de costura pasa a ser un dato de cada borde; la geometría es la línea neta.",
    "Etiquetas y tipos de borde deducidos de los nombres de los puntos de FreeSewing.",
    "Otros talles guardados como deltas contra el talle base.",
  ];
  const fragmento: Fragmento = {
    pattrn: "0.1", tipo: "fragmento", id: e.id, version: 1, huella: "", nombre: e.nombre,
    unidades: "mm", licencia: "CC-BY-SA-4.0",
    autoria: { autor: e.fuente.autor, fecha_creacion: e.fecha, fecha_version: e.fecha },
    origen: {
      metodo: "convertido",
      fuente: { nombre: "FreeSewing", id: e.fuente.id, version: e.fuente.version, licencia: e.fuente.licencia, url: e.fuente.url, aviso: e.fuente.aviso },
      conversor: VERSION_CONVERSOR, medidas: e.medidas, ...(e.opciones ? { opciones: e.opciones } : {}), cambios,
    },
    linaje: [{ nombre: `FreeSewing ${e.fuente.id}`, autor: e.fuente.autor, licencia: e.fuente.licencia, publicado: true, url: e.fuente.url, aviso: e.fuente.aviso }],
    talle_base: e.talleBase,
    sistema_talles: "FreeSewing (medidas de referencia por contorno de cuello)",
    hilo, vertices, bordes, escalado,
  };
  fragmento.huella = await huella(fragmento);
  const corteTela = Object.values(e.corte?.materials ?? {})[0]?.[0];
  return { fragmento, avisos, cortar: corteTela?.cut };
}
