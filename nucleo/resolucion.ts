// Resolución de bordes que no miden lo mismo: los de una fusión (misma tela) y los de una
// costura (telas o piezas distintas). El software calcula las opciones y sus consecuencias;
// la persona elige. Nada se aplica sin una resolución aceptada en el molde. Los fragmentos
// no se tocan: lo que cambia es la geometría calculada de cada pieza.
//
// Fusión:
// - manda_a / manda_b: el borde que manda queda como está; el otro fragmento lleva el
//   extremo de su borde vecino hasta el extremo del que manda.
// - transicion: los dos extremos se encuentran en el punto medio y cada borde vecino se
//   redibuja con una curva suave en los zona_mm junto a la unión.
//
// Costura:
// - embebido: la diferencia es buscada; no cambia la geometría.
// - manda_a / manda_b: el otro borde se acorta o se prolonga sobre su propia línea hasta medir
//   lo mismo, y su vecino acompaña al extremo que se mueve.
// - transicion: los dos van al largo medio y los vecinos se redibujan en zona_mm.
//
// Un borde terminado solo se puede acortar a lo largo de sí mismo: nunca se alarga, se
// mueve ni se redibuja. Una opción que lo exigiría se ofrece como no disponible, con el motivo.

import {
  derivadaEn, dividir, distancia, largo, parametroEnLargo, puntoEn,
  type Punto, type Tramo,
} from "./geometria";
import { tramoDeBorde } from "./fragmento";
import type { Alineacion, Borde, Costura, Fragmento, Fusion, Molde, Pieza, Resolucion } from "./tipos";
import type { Resolver } from "./molde";
import { cm } from "./unidades";

export type ModoResolucion = "manda_a" | "manda_b" | "transicion";
export type ModoCostura = ModoResolucion | "embebido";

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

export interface OpcionDeCostura {
  modo: ModoCostura;
  disponible: boolean;
  motivo?: string;
  cambios: CambioDeBorde[];
  /** Contorno de cada pieza involucrada si se aplicara esta opción. */
  contornos: Record<string, TramoDePieza[]>;
}

const TOLERANCIA = 0.005; // mm: por debajo de esto, dos puntos coinciden

interface Instancia {
  id: string;
  tela: string;
  frag: Fragmento;
  tramos: Tramo[];
}

interface Ajuste {
  inst: string;
  indice: number;
  extremo: "inicio" | "fin";
  nuevo: Punto;
  /** mover: el extremo va a `nuevo`. transicion: además se redibuja la zona. largo: el borde se acorta o prolonga sobre su línea. */
  forma: "mover" | "transicion" | "largo";
}

function instancias(pieza: Pieza, resolver: Resolver): Map<string, Instancia> {
  return new Map(pieza.instancias.map((i) => {
    const frag = resolver(i.ref, i.huella);
    return [i.id, { id: i.id, tela: i.tela, frag, tramos: frag.bordes.map((b) => tramoDeBorde(frag, b, i.transformacion)) }];
  }));
}

function separar(ref: string) {
  const [inst, borde] = ref.split("#");
  return { inst, borde };
}

// ---------------------------------------------------------------- operaciones sobre un tramo

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

const unitario = (v: Punto): Punto => { const n = Math.hypot(v[0], v[1]); return [v[0] / n, v[1] / n]; };
const opuesto = (v: Punto): Punto => [-v[0], -v[1]];

/**
 * Reemplaza los `zona` mm del tramo junto a `extremo` por una curva que llega a `nuevo`,
 * tangente al tramo que no cambia. Devuelve los tramos en el sentido original del borde.
 */
function transicionarExtremo(t: Tramo, extremo: "inicio" | "fin", nuevo: Punto, zona: number): Tramo[] {
  const L = largo(t);
  const u = parametroEnLargo(t, extremo === "fin" ? L - zona : zona);
  const [antes, despues] = dividir(t, u);
  const P = extremo === "fin" ? despues.p0 : antes.p1;
  // dirección de avance hacia la esquina, en el punto de corte y en la esquina original
  const dirP = unitario(extremo === "fin" ? derivadaEn(t, u) : opuesto(derivadaEn(t, u)));
  const dirE = unitario(extremo === "fin" ? derivadaEn(t, 1) : opuesto(derivadaEn(t, 0)));
  const k = distancia(P, nuevo) / 3;
  const c1: Punto = [P[0] + dirP[0] * k, P[1] + dirP[1] * k];
  const c2: Punto = [nuevo[0] - dirE[0] * k, nuevo[1] - dirE[1] * k];
  if (extremo === "fin") return [antes, { tipo: "bezier", p0: P, c1, c2, p1: nuevo }];
  // en el extremo de inicio la curva se recorre al revés: nuevo → P
  return [{ tipo: "bezier", p0: nuevo, c1: c2, c2: c1, p1: P }, despues];
}

/** Punto a `L` mm del extremo fijo, sobre el borde o sobre su prolongación en línea recta. */
function puntoALargo(t: Tramo, fijo: "inicio" | "fin", L: number): Punto {
  const total = largo(t);
  if (L <= total) return puntoEn(t, parametroEnLargo(t, fijo === "inicio" ? L : total - L));
  const extremo = fijo === "inicio" ? t.p1 : t.p0;
  const dir = unitario(fijo === "inicio" ? derivadaEn(t, 1) : opuesto(derivadaEn(t, 0)));
  return [extremo[0] + dir[0] * (L - total), extremo[1] + dir[1] * (L - total)];
}

/** Aplica a un borde los ajustes que le tocan. Anota en `problemas` lo que no se puede hacer. */
function ajustarBorde(
  origen: string, b: Borde, tramo: Tramo, ajustes: Ajuste[], zona: number, problemas: string[],
): { tramos: Tramo[]; modificado: boolean } {
  let tramos: Tramo[] = [tramo];
  let modificado = false;
  for (const aj of ajustes) {
    modificado = true;
    const i = aj.extremo === "inicio" ? 0 : tramos.length - 1;
    const t = tramos[i];
    const reemplazar = (nuevos: Tramo[]) => {
      tramos = aj.extremo === "inicio" ? [...nuevos, ...tramos.slice(1)] : [...tramos.slice(0, -1), ...nuevos];
    };
    const u = parametroSobre(t, aj.nuevo);
    if (b.tipo === "terminado" || aj.forma === "largo") {
      // acortar sobre la propia línea vale siempre; lo demás solo si no es terminado
      if (u !== null) {
        const [p, q] = dividir(t, u);
        reemplazar([aj.extremo === "inicio" ? q : p]);
        continue;
      }
      if (b.tipo === "terminado") {
        problemas.push(`${origen} (${b.etiqueta}) es un borde terminado: no se puede alargar, mover ni redibujar`);
        continue;
      }
      // prolongar en línea recta desde el extremo
      const extremo = aj.extremo === "inicio" ? t.p0 : t.p1;
      reemplazar(aj.extremo === "inicio"
        ? [{ tipo: "recta", p0: aj.nuevo, p1: extremo }, t]
        : [t, { tipo: "recta", p0: extremo, p1: aj.nuevo }]);
    } else if (aj.forma === "mover") {
      reemplazar([moverExtremo(t, aj.extremo, aj.nuevo)]);
    } else {
      if (largo(t) <= zona + 1) {
        problemas.push(`${origen} (${b.etiqueta}) mide ${cm(largo(t))}: es más corto que la zona de transición`);
        continue;
      }
      reemplazar(transicionarExtremo(t, aj.extremo, aj.nuevo, zona));
    }
  }
  return { tramos, modificado };
}

/** Todos los bordes de una instancia, en orden de contorno, desde el que sigue a `desdeIndice`. */
function contornoDeInstancia(
  x: Instancia, ajustes: Ajuste[], zona: number, problemas: string[], excluir?: number,
): TramoDePieza[] {
  const n = x.frag.bordes.length;
  const inicio = excluir === undefined ? 0 : excluir + 1;
  const out: TramoDePieza[] = [];
  for (let k = 0; k < n; k++) {
    const j = (inicio + k) % n;
    if (j === excluir) continue;
    const b = x.frag.bordes[j];
    const origen = `${x.id}#${b.id}`;
    const { tramos, modificado } = ajustarBorde(origen, b, x.tramos[j],
      ajustes.filter((a) => a.inst === x.id && a.indice === j), zona, problemas);
    for (const t of tramos) out.push({ origen, borde: b, tramo: t, modificado });
  }
  return out;
}

function cambios(base: TramoDePieza[], nuevo: TramoDePieza[], describir: (origen: string) => string): CambioDeBorde[] {
  const suma = (c: TramoDePieza[], o: string) => c.filter((t) => t.origen === o).reduce((s, t) => s + largo(t.tramo), 0);
  return [...new Set(nuevo.filter((t) => t.modificado).map((t) => t.origen))].map((origen) => ({
    origen, etiqueta: nuevo.find((t) => t.origen === origen)!.borde.etiqueta,
    antes: suma(base, origen), despues: suma(nuevo, origen), descripcion: describir(origen),
  }));
}

// ---------------------------------------------------------------- telas

export interface FusionEntreTelas {
  pieza: string;
  indice: number;
  fusion: Fusion;
  telaA: string;
  telaB: string;
}

/** Fusiones que unen instancias de telas distintas. No son válidas: se cosen. */
export function fusionesEntreTelas(molde: Molde): FusionEntreTelas[] {
  const out: FusionEntreTelas[] = [];
  for (const p of molde.piezas) {
    const tela = new Map(p.instancias.map((i) => [i.id, i.tela]));
    (p.fusiones ?? []).forEach((f, indice) => {
      const telaA = tela.get(separar(f.a).inst)!, telaB = tela.get(separar(f.b).inst)!;
      if (telaA !== telaB) out.push({ pieza: p.id, indice, fusion: f, telaA, telaB });
    });
  }
  return out;
}

function mensajeTelas(m: Molde, x: FusionEntreTelas) {
  const d = (id: string) => m.telas.find((t) => t.id === id)?.descripcion ?? id;
  return `fusion_entre_telas: ${x.fusion.a} es de ${d(x.telaA)} y ${x.fusion.b} es de ${d(x.telaB)}; dos telas distintas se cosen, no se fusionan`;
}

// ---------------------------------------------------------------- fusiones

/** Los dos extremos de la fusión: qué punto de a corresponde a qué punto de b, y qué bordes vecinos tocan. */
function extremosDeFusion(insts: Map<string, Instancia>, fusion: Fusion) {
  const ra = separar(fusion.a), rb = separar(fusion.b);
  const A = insts.get(ra.inst)!, B = insts.get(rb.inst)!;
  const ia = A.frag.bordes.findIndex((b) => b.id === ra.borde);
  const ib = B.frag.bordes.findIndex((b) => b.id === rb.borde);
  const na = A.frag.bordes.length, nb = B.frag.bordes.length;
  const ta = A.tramos[ia], tb = B.tramos[ib];
  // los contornos son antihorarios: a.de se une con b.a, y a.a con b.de
  return {
    A, B, ia, ib,
    extremos: [
      { pa: ta.p0, pb: tb.p1,
        vecinoA: { inst: A.id, indice: (ia - 1 + na) % na, extremo: "fin" as const },
        vecinoB: { inst: B.id, indice: (ib + 1) % nb, extremo: "inicio" as const } },
      { pa: ta.p1, pb: tb.p0,
        vecinoA: { inst: A.id, indice: (ia + 1) % na, extremo: "inicio" as const },
        vecinoB: { inst: B.id, indice: (ib - 1 + nb) % nb, extremo: "fin" as const } },
    ],
  };
}

function ajustesDeFusion(modo: Resolucion["modo"], insts: Map<string, Instancia>, fusion: Fusion): Ajuste[] {
  if (modo === "ninguna") return [];
  const out: Ajuste[] = [];
  for (const e of extremosDeFusion(insts, fusion).extremos) {
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

/** Contorno de la pieza fusionada: la cadena de a sin a, seguida de la cadena de b sin b. */
function contornoFusionado(insts: Map<string, Instancia>, fusion: Fusion, ajustes: Ajuste[], zona: number) {
  const problemas: string[] = [];
  const { A, B, ia, ib } = extremosDeFusion(insts, fusion);
  const contorno = [
    ...contornoDeInstancia(A, ajustes, zona, problemas, ia),
    ...contornoDeInstancia(B, ajustes, zona, problemas, ib),
  ];
  return { contorno, problemas };
}

function piezaConFusion(molde: Molde, piezaId: string): Pieza {
  const p = molde.piezas.find((x) => x.id === piezaId);
  if (!p) throw new Error(`${molde.id}: no existe la pieza ${piezaId}`);
  if ((p.fusiones ?? []).length > 1) throw new Error("por ahora se resuelve una fusión por pieza");
  const entre = fusionesEntreTelas(molde).find((x) => x.pieza === piezaId);
  if (entre) throw new Error(mensajeTelas(molde, entre));
  return p;
}

/** Las tres opciones para la fusión de la pieza, con lo que cambiaría cada una. No aplica nada. */
export function opcionesDeResolucion(molde: Molde, resolver: Resolver, piezaId: string, zona_mm = 60): OpcionDeResolucion[] {
  const p = piezaConFusion(molde, piezaId);
  const fusion = p.fusiones![0];
  const insts = instancias(p, resolver);
  const base = contornoFusionado(insts, fusion, [], zona_mm).contorno;
  const hueco = Math.max(...extremosDeFusion(insts, fusion).extremos.map((e) => distancia(e.pa, e.pb)));
  return (["manda_a", "manda_b", "transicion"] as const).map((modo) => {
    const { contorno, problemas } = contornoFusionado(insts, fusion, ajustesDeFusion(modo, insts, fusion), zona_mm);
    const movido = modo === "transicion" ? hueco / 2 : hueco;
    return {
      modo,
      disponible: problemas.length === 0,
      motivo: problemas.length ? problemas.join("; ") : undefined,
      cambios: cambios(base, contorno, () => modo === "transicion"
        ? `se redibuja en los ${cm(zona_mm)} junto a la unión y su extremo se mueve ${cm(movido)}`
        : `su extremo junto a la unión se mueve ${cm(movido)}`),
      contorno,
    };
  });
}

/** Contorno de la pieza con la resolución que tiene guardada el molde ("ninguna": los fragmentos tal cual). */
export function contornoResuelto(molde: Molde, resolver: Resolver, piezaId: string): TramoDePieza[] {
  const p = piezaConFusion(molde, piezaId);
  const fusion = p.fusiones?.[0];
  if (!fusion) throw new Error(`${piezaId}: la pieza no tiene fusiones`);
  const insts = instancias(p, resolver);
  const r = fusion.resolucion;
  if (r.modo !== "ninguna" && !r.aceptada) throw new Error("una resolución sin aceptar no se aplica");
  const { contorno, problemas } = contornoFusionado(insts, fusion, ajustesDeFusion(r.modo, insts, fusion), r.zona_mm ?? 60);
  if (problemas.length) throw new Error(problemas.join("; "));
  return contorno;
}

/** Copia del molde con la resolución elegida para la fusión, aceptada en `fecha`. El molde original no cambia. */
export function aplicarResolucion(molde: Molde, piezaId: string, modo: ModoResolucion | "ninguna", fecha: string, zona_mm = 60): Molde {
  const copia: Molde = structuredClone(molde);
  const p = piezaConFusion(copia, piezaId);
  p.fusiones![0].resolucion = resolucionAceptada(modo, fecha, zona_mm);
  return copia;
}

function resolucionAceptada(modo: ModoResolucion | "ninguna", fecha: string, zona_mm: number): Resolucion {
  return modo === "ninguna" ? { modo } : modo === "transicion" ? { modo, aceptada: fecha, zona_mm } : { modo, aceptada: fecha };
}

// ---------------------------------------------------------------- costuras

interface LadoResuelto {
  pieza: string;
  inst: Instancia;
  indice: number;
  tramo: Tramo;
  largo: number;
}

function ladoDeCostura(molde: Molde, resolver: Resolver, lado: Costura["a"]): LadoResuelto {
  if (lado.bordes.length !== 1) throw new Error("por ahora se resuelve una costura de un borde por lado");
  const p = molde.piezas.find((x) => x.id === lado.pieza);
  if (!p) throw new Error(`${molde.id}: no existe la pieza ${lado.pieza}`);
  const { inst, borde } = separar(lado.bordes[0]);
  const x = instancias(p, resolver).get(inst);
  if (!x) throw new Error(`${lado.pieza}: no existe la instancia ${inst}`);
  const indice = x.frag.bordes.findIndex((b) => b.id === borde);
  return { pieza: p.id, inst: x, indice, tramo: x.tramos[indice], largo: largo(x.tramos[indice]) };
}

export interface AnalisisCostura {
  costura: Costura;
  largoA: number;
  largoB: number;
  embebido: number;
  /** largoA − largoB − embebido, en mm. */
  desvio: number;
  dentroDeTolerancia: boolean;
  /** Qué lado sobra respecto de lo buscado. */
  sobra: "a" | "b" | null;
}

export function analizarCosturas(molde: Molde, resolver: Resolver): AnalisisCostura[] {
  return (molde.costuras ?? []).map((costura) => {
    const a = ladoDeCostura(molde, resolver, costura.a), b = ladoDeCostura(molde, resolver, costura.b);
    const embebido = costura.embebido_mm ?? 0;
    const desvio = a.largo - b.largo - embebido;
    return {
      costura, largoA: a.largo, largoB: b.largo, embebido, desvio,
      dentroDeTolerancia: Math.abs(desvio) <= (costura.tolerancia_mm ?? 1),
      sobra: Math.abs(desvio) < TOLERANCIA ? null : desvio > 0 ? "a" : "b",
    };
  });
}

/**
 * Ajustes de un lado que pasa a medir `nuevoLargo`: el borde se acorta o prolonga desde el
 * extremo fijo, y el vecino del extremo que se mueve lo acompaña (o se redibuja en la zona).
 */
function ajustesDeLado(lado: LadoResuelto, fijo: "inicio" | "fin", nuevoLargo: number, forma: "mover" | "transicion"): Ajuste[] {
  if (Math.abs(nuevoLargo - lado.largo) < TOLERANCIA) return [];
  const nuevo = puntoALargo(lado.tramo, fijo, nuevoLargo);
  const n = lado.inst.frag.bordes.length;
  const moviendo = fijo === "inicio" ? "fin" : "inicio";
  const vecino = moviendo === "fin" ? (lado.indice + 1) % n : (lado.indice - 1 + n) % n;
  return [
    { inst: lado.inst.id, indice: lado.indice, extremo: moviendo, nuevo, forma: "largo" },
    { inst: lado.inst.id, indice: vecino, extremo: moviendo === "fin" ? "inicio" : "fin", nuevo, forma },
  ];
}

function ajustesDeCostura(modo: Resolucion["modo"], a: LadoResuelto, b: LadoResuelto, alineacion: Alineacion, embebido: number) {
  // a.de se cose con b.a: si queda fijo el inicio de a, queda fijo el fin de b
  const fijoA = alineacion === "fin" ? "fin" : "inicio";
  const fijoB = fijoA === "inicio" ? "fin" : "inicio";
  if (modo === "ninguna") return [];
  if (modo === "manda_a") return ajustesDeLado(b, fijoB, a.largo - embebido, "mover");
  if (modo === "manda_b") return ajustesDeLado(a, fijoA, b.largo + embebido, "mover");
  const medio = (a.largo + b.largo) / 2;
  return [...ajustesDeLado(a, fijoA, medio + embebido / 2, "transicion"), ...ajustesDeLado(b, fijoB, medio - embebido / 2, "transicion")];
}

function contornosDeCostura(molde: Molde, resolver: Resolver, costura: Costura, modo: Resolucion["modo"], zona: number) {
  const a = ladoDeCostura(molde, resolver, costura.a), b = ladoDeCostura(molde, resolver, costura.b);
  if (alineacionCentro(costura)) throw new Error("por ahora la costura se resuelve con alineación inicio o fin");
  const ajustes = ajustesDeCostura(modo, a, b, costura.alineacion ?? "inicio", modo === "ninguna" ? 0 : costura.embebido_mm ?? 0);
  const problemas: string[] = [];
  const contornos: Record<string, TramoDePieza[]> = {};
  for (const lado of [a, b]) contornos[lado.pieza] = contornoDeInstancia(lado.inst, ajustes, zona, problemas);
  return { contornos, problemas, a, b };
}

const alineacionCentro = (c: Costura) => c.alineacion === "centro";

function costuraPorId(molde: Molde, id: string): Costura {
  const c = (molde.costuras ?? []).find((x) => x.id === id);
  if (!c) throw new Error(`${molde.id}: no existe la costura ${id}`);
  return c;
}

/** Las cuatro opciones para una costura que no coincide: embebido, cuál manda o transición. No aplica nada. */
export function opcionesDeCostura(molde: Molde, resolver: Resolver, costuraId: string, zona_mm = 60): OpcionDeCostura[] {
  const costura = costuraPorId(molde, costuraId);
  const sinResolver = { ...costura, embebido_mm: costura.embebido_mm ?? 0 };
  const base = contornosDeCostura(molde, resolver, sinResolver, "ninguna", zona_mm);
  const todos = (c: Record<string, TramoDePieza[]>) => Object.values(c).flat();
  const diferencia = base.a.largo - base.b.largo - (costura.embebido_mm ?? 0);

  const embebido: OpcionDeCostura = {
    modo: "embebido", disponible: true, cambios: [], contornos: base.contornos,
  };
  return [embebido, ...(["manda_a", "manda_b", "transicion"] as const).map((modo) => {
    const { contornos, problemas } = contornosDeCostura(molde, resolver, sinResolver, modo, zona_mm);
    const describir = (origen: string) => {
      const esCostura = origen === costura.a.bordes[0] || origen === costura.b.bordes[0];
      const cuanto = cm(Math.abs(modo === "transicion" ? diferencia / 2 : diferencia));
      if (esCostura) return `se ${(modo === "manda_a") === (diferencia > 0) ? "prolonga" : "acorta"} ${cuanto} sobre su línea`;
      return modo === "transicion"
        ? `se redibuja en los ${cm(zona_mm)} junto a la costura y su extremo se mueve ${cuanto}`
        : `su extremo junto a la costura se mueve ${cuanto}`;
    };
    // en la transición el que se acorta y el que se prolonga son distintos: se describe cada uno
    const describirTransicion = (origen: string) => {
      if (origen === costura.a.bordes[0]) return `se ${diferencia > 0 ? "acorta" : "prolonga"} ${cm(Math.abs(diferencia / 2))} sobre su línea`;
      if (origen === costura.b.bordes[0]) return `se ${diferencia > 0 ? "prolonga" : "acorta"} ${cm(Math.abs(diferencia / 2))} sobre su línea`;
      return describir(origen);
    };
    return {
      modo,
      disponible: problemas.length === 0,
      motivo: problemas.length ? problemas.join("; ") : undefined,
      cambios: cambios(todos(base.contornos), todos(contornos), modo === "transicion" ? describirTransicion : describir),
      contornos,
    };
  })];
}

/** Contorno de cada pieza de la costura con la resolución guardada en el molde. */
export function contornosResueltosDeCostura(molde: Molde, resolver: Resolver, costuraId: string): Record<string, TramoDePieza[]> {
  const costura = costuraPorId(molde, costuraId);
  const r = costura.resolucion ?? { modo: "ninguna" };
  if (r.modo !== "ninguna" && !r.aceptada) throw new Error("una resolución sin aceptar no se aplica");
  const { contornos, problemas } = contornosDeCostura(molde, resolver, costura, r.modo, r.zona_mm ?? 60);
  if (problemas.length) throw new Error(problemas.join("; "));
  return contornos;
}

/**
 * Copia del molde con la resolución elegida para la costura. "embebido" declara la diferencia
 * actual como buscada; "ninguna" quita la resolución y el embebido declarado.
 */
export function aplicarResolucionDeCostura(
  molde: Molde, resolver: Resolver, costuraId: string, modo: ModoCostura | "ninguna", fecha: string, zona_mm = 60,
): Molde {
  const copia: Molde = structuredClone(molde);
  const c = costuraPorId(copia, costuraId);
  if (modo === "embebido") {
    const [an] = analizarCosturas({ ...copia, costuras: [{ ...c, embebido_mm: 0 }] }, resolver);
    c.embebido_mm = Math.round(an.desvio * 100) / 100;
    delete c.resolucion;
  } else if (modo === "ninguna") {
    c.embebido_mm = 0;
    delete c.resolucion;
  } else {
    c.resolucion = resolucionAceptada(modo, fecha, zona_mm);
  }
  return copia;
}
