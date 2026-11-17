// El plan automático: a partir de una descripción de la prenda, PATTRN elige las piezas de
// Patternpedia, las corta, quita lo que sobra y las cose. Usa las mismas operaciones que el
// lienzo: lo que arma se puede seguir corrigiendo a mano.
//
// Quién arma la descripción es otro tema: hoy son unas preguntas; más adelante puede ser una
// IA que mire la imagen y las conteste. El plan no cambia.

import { enTalle, largoDeBorde, type Fragmento } from "../nucleo";
import { cajaDe, coser, cortarPieza, editarBorde, piezaDe, quitarPieza, traerPieza, type Lienzo, type PiezaL } from "./lienzo";
import { cargarFragmento, disenoDe, etiquetaDeTalle, talles, type PiezaDeArchivo } from "./patternpedia";

export interface Descripcion {
  prenda: "top" | "vestido" | "falda";
  hombros: "cubiertos" | "descubiertos";
  mangas: "sin" | "cortas" | "largas";
  largo: "cadera" | "cintura";
  falda: "circular" | "tubo";
}

export const descripcionInicial = (): Descripcion => ({ prenda: "top", hombros: "cubiertos", mangas: "cortas", largo: "cadera", falda: "circular" });

/** Las preguntas, con sus respuestas posibles, y cuándo corresponde hacer cada una. */
export const PREGUNTAS: { clave: keyof Descripcion; pregunta: string; opciones: [string, string][]; siempreQue: (d: Descripcion) => boolean }[] = [
  { clave: "prenda", pregunta: "¿Qué querés hacer?", opciones: [["top", "Una prenda de arriba"], ["vestido", "Un vestido"], ["falda", "Una falda"]], siempreQue: () => true },
  { clave: "hombros", pregunta: "¿Cómo van los hombros?", opciones: [["cubiertos", "Cubiertos"], ["descubiertos", "Descubiertos"]], siempreQue: (d) => d.prenda !== "falda" },
  { clave: "mangas", pregunta: "¿Lleva mangas?", opciones: [["sin", "Sin mangas"], ["cortas", "Cortas"], ["largas", "Largas"]], siempreQue: (d) => d.prenda !== "falda" },
  { clave: "largo", pregunta: "¿Hasta dónde llega?", opciones: [["cadera", "Hasta la cadera"], ["cintura", "Hasta la cintura"]], siempreQue: (d) => d.prenda === "top" },
  { clave: "falda", pregunta: "¿Cómo es la falda?", opciones: [["circular", "Con vuelo (circular)"], ["tubo", "Recta (tubo)"]], siempreQue: (d) => d.prenda === "falda" },
];

const SEPARACION = 5; // mm por debajo de la axila: el corte tiene que sacar toda la sisa

const pieza = (diseno: string, parte: string): PiezaDeArchivo => {
  const p = disenoDe(diseno)?.piezas.find((x) => x.parte === parte);
  if (!p) throw new Error(`Patternpedia no tiene ${diseno}/${parte}`);
  return p;
};
const nombreDe = (diseno: string) => disenoDe(diseno)!.nombre;
const bordePor = (f: Fragmento, etiqueta: string) => f.bordes.filter((b) => b.etiqueta === etiqueta);
const yDe = (f: Fragmento, vertice: string) => f.vertices[vertice][1];

/** Altura de la axila: el vértice donde el lateral se encuentra con la sisa. */
function alturaDeAxila(f: Fragmento): number {
  const lateral = bordePor(f, "lateral")[0], sisas = bordePor(f, "sisa");
  if (!lateral || !sisas.length) throw new Error(`«${f.nombre}» no tiene lateral y sisa reconocibles.`);
  const comun = [lateral.de, lateral.a].find((v) => sisas.some((s) => s.de === v || s.a === v));
  if (!comun) throw new Error(`En «${f.nombre}» el lateral no toca la sisa.`);
  return yDe(f, comun);
}

/** Punto más alto del hombro: de ahí se mide el largo hasta la cintura. */
const alturaDeHombro = (f: Fragmento) => Math.max(...bordePor(f, "hombro").flatMap((b) => [yDe(f, b.de), yDe(f, b.a)]));

/** Altura del brazo donde termina la copa de la manga. */
function alturaDeCopa(f: Fragmento): number {
  const costuras = bordePor(f, "costura_manga");
  if (!costuras.length) throw new Error(`«${f.nombre}» no tiene costura de manga reconocible.`);
  return Math.max(...costuras.flatMap((b) => [yDe(f, b.de), yDe(f, b.a)]));
}

/** Corta la pieza con una horizontal a la altura dada (en coordenadas de la pieza) y devuelve [arriba, abajo]. */
async function cortarEnAltura(l: Lienzo, p: PiezaL, y: number, autor: string, fecha: string): Promise<[PiezaL, PiezaL]> {
  const r = await cortarPieza(l, p.id, [p.x - 5000, p.y - y], [p.x + 5000, p.y - y], autor, fecha);
  const arriba = r.nuevas.find((x) => x.nombre.endsWith("arriba"))!, abajo = r.nuevas.find((x) => x.nombre.endsWith("abajo"))!;
  return [arriba, abajo];
}

const bordeDelCorte = (p: PiezaL) => {
  const b = bordePor(p.fragmento, "linea_diseno");
  return b[b.length - 1]; // si se cortó dos veces, el último es el de este corte
};

/** Pone las piezas en fila, apoyadas en la misma base. */
export function acomodar(l: Lienzo) {
  let x = 0;
  for (const p of l.piezas) {
    const c = cajaDe(p);
    p.x += x - c.x0;
    p.y += -c.y1;
    x += c.x1 - c.x0 + 60;
  }
}

/**
 * Arma el molde en un lienzo nuevo según la descripción. Devuelve el lienzo y lo que conviene
 * que la persona sepa: qué decidió el plan y qué quedó sin resolver.
 */
export async function armarSegunPlan(d: Descripcion, talle: string, autor: string, fecha: string): Promise<{ lienzo: Lienzo; notas: string[] }> {
  const l: Lienzo = { piezas: [], costuras: [], contador: 0 };
  const notas: string[] = [];
  const renombrar = (p: PiezaL, nombre: string) => { p.nombre = nombre; p.fragmento.nombre = nombre; };

  if (d.prenda === "falda") {
    const diseno = d.falda === "circular" ? "sandy" : "penelope";
    for (const p of disenoDe(diseno)!.piezas) await traerPieza(l, p, nombreDe(diseno), talle, fecha);
    notas.push(`Falda ${d.falda === "circular" ? "circular" : "tubo"} completa, en talle ${etiquetaDeTalle(talle)}.`);
    acomodar(l);
    return { lienzo: l, notas };
  }

  // ---- torso: la remera si las mangas son cortas; el torso con manga larga en los demás casos
  const torso = d.mangas === "cortas" ? "teagan" : "brian";
  let delantera = await traerPieza(l, pieza(torso, "front"), nombreDe(torso), talle, fecha);
  let espalda = await traerPieza(l, pieza(torso, "back"), nombreDe(torso), talle, fecha);
  let manga = d.mangas === "sin" ? null : await traerPieza(l, pieza(torso, "sleeve"), nombreDe(torso), talle, fecha);
  notas.push(`Torso tomado de «${nombreDe(torso)}», en talle ${etiquetaDeTalle(talle)}.`);

  // la cintura se ubica con la proporción del molde original: del hombro a la cintura sobre el alto total
  const base = await cargarFragmento(pieza(torso, "front"));
  const medidas = (base.origen as { medidas?: Record<string, number> }).medidas ?? {};
  const proporcion = medidas.hpsToWaistBack ? (alturaDeHombro(base) - medidas.hpsToWaistBack) / alturaDeHombro(base) : null;
  const alturaDeCintura = (f: Fragmento) => {
    if (proporcion === null) throw new Error("No se puede ubicar la cintura en este torso.");
    return alturaDeHombro(f) * proporcion;
  };
  // se calcula antes de cortar: después del corte el hombro ya no está
  const cintura = { delantera: 0, espalda: 0 };
  const hastaLaCintura = d.prenda === "vestido" || d.largo === "cintura";
  if (hastaLaCintura) { cintura.delantera = alturaDeCintura(delantera.fragmento); cintura.espalda = alturaDeCintura(espalda.fragmento); }

  if (d.hombros === "descubiertos") {
    for (const cual of ["delantera", "espalda"] as const) {
      const p = cual === "delantera" ? delantera : espalda;
      const [arriba, abajo] = await cortarEnAltura(l, p, alturaDeAxila(p.fragmento) - SEPARACION, autor, fecha);
      quitarPieza(l, arriba.id);
      await editarBorde(abajo, bordeDelCorte(abajo).id, { tipo: "dobladillo", margen_mm: 20 }, fecha);
      renombrar(abajo, cual === "delantera" ? "Delantera" : "Espalda");
      if (cual === "delantera") delantera = abajo; else espalda = abajo;
    }
    notas.push("Hombros descubiertos: delantera y espalda cortadas en recta justo debajo de la axila. El borde de arriba es un dobladillo de 2 cm.");
    if (manga) {
      const [arriba, abajo] = await cortarEnAltura(l, manga, alturaDeCopa(manga.fragmento) - SEPARACION, autor, fecha);
      quitarPieza(l, arriba.id);
      await editarBorde(abajo, bordeDelCorte(abajo).id, { tipo: "dobladillo", margen_mm: 20 }, fecha);
      renombrar(abajo, "Manga");
      manga = abajo;
      notas.push("Las mangas quedan como tubos sueltos, sin copa: no están cosidas al torso. Unilas donde las quieras.");
    }
  }

  if (hastaLaCintura) {
    for (const cual of ["delantera", "espalda"] as const) {
      const p = cual === "delantera" ? delantera : espalda;
      const [arriba, abajo] = await cortarEnAltura(l, p, cintura[cual], autor, fecha);
      quitarPieza(l, abajo.id);
      if (d.prenda === "top") await editarBorde(arriba, bordeDelCorte(arriba).id, { tipo: "dobladillo", margen_mm: 20 }, fecha);
      renombrar(arriba, cual === "delantera" ? "Delantera" : "Espalda");
      if (cual === "delantera") delantera = arriba; else espalda = arriba;
    }
    notas.push(d.prenda === "top"
      ? "Cortado en la cintura, con dobladillo de 2 cm."
      : "Torso cortado en la cintura, para unirlo a la falda. La altura de la cintura sale de la proporción del molde original: revisala contra tu cuerpo.");
  }

  // ---- costuras del torso
  const unir = (a: PiezaL, etiquetaA: string, b: PiezaL, etiquetaB: string, cual = 0) => {
    const ba = bordePor(a.fragmento, etiquetaA)[cual], bb = bordePor(b.fragmento, etiquetaB)[a === b ? 1 : cual];
    if (ba && bb) coser(l, { pieza: a.id, borde: ba.id }, { pieza: b.id, borde: bb.id });
  };
  unir(delantera, "lateral", espalda, "lateral");
  if (d.hombros === "cubiertos") unir(delantera, "hombro", espalda, "hombro");
  if (manga) unir(manga, "costura_manga", manga, "costura_manga");
  if (manga && d.hombros === "cubiertos") notas.push("La manga va cosida a la sisa como en el molde original. Esa costura no está marcada en el lienzo: une varios bordes y todavía no se puede dibujar.");
  if (!manga && d.hombros === "cubiertos") notas.push("Sin mangas: las sisas conservan 1 cm de margen. Si las terminás con vivo o dobladillo, cambiá el borde.");

  // ---- falda del vestido: circular, en el talle cuya cintura coincide con la del torso
  if (d.prenda === "vestido") {
    const cinturaTorso = [delantera, espalda].map((p) => largoDeBorde(p.fragmento, bordeDelCorte(p).id));
    const archivo = pieza("sandy", "skirt"), semilla = await cargarFragmento(archivo);
    // la cintura de la falda son sus dos arcos más cortos: el que toca el doblez va con la delantera
    const arcos = (f: Fragmento) => {
      const curvos = f.bordes.filter((b) => b.curva).sort((x, y) => largoDeBorde(f, x.id) - largoDeBorde(f, y.id)).slice(0, 2);
      const doblez = f.bordes.find((b) => b.tipo === "doblez");
      const delDoblez = curvos.find((b) => doblez && [b.de, b.a].some((v) => v === doblez.de || v === doblez.a)) ?? curvos[0];
      return { frente: delDoblez, espalda: curvos.find((b) => b !== delDoblez)! };
    };
    let mejor = { talle, desvio: Infinity };
    for (const t of talles) {
      let f: Fragmento;
      try { f = await enTalle(semilla, t.id); } catch { continue; }
      const a = arcos(f);
      const desvio = Math.abs(largoDeBorde(f, a.frente.id) - cinturaTorso[0]) + Math.abs(largoDeBorde(f, a.espalda.id) - cinturaTorso[1]);
      if (desvio < mejor.desvio) mejor = { talle: t.id, desvio };
    }
    const falda = await traerPieza(l, archivo, nombreDe("sandy"), mejor.talle, fecha);
    const a = arcos(falda.fragmento);
    const c1 = coser(l, { pieza: delantera.id, borde: bordeDelCorte(delantera).id }, { pieza: falda.id, borde: a.frente.id });
    const c2 = coser(l, { pieza: espalda.id, borde: bordeDelCorte(espalda).id }, { pieza: falda.id, borde: a.espalda.id });
    // una diferencia de hasta 1 cm por costura se embebe al coser: se declara, no se esconde
    const dif = [cinturaTorso[0] - largoDeBorde(falda.fragmento, a.frente.id), cinturaTorso[1] - largoDeBorde(falda.fragmento, a.espalda.id)];
    [c1, c2].forEach((c, i) => { if (Math.abs(dif[i]) > 1 && Math.abs(dif[i]) <= 10) c.embebido_mm = Math.round(dif[i] * 100) / 100; });
    notas.push(mejor.talle === talle
      ? "Falda circular en el mismo talle que el torso."
      : `Falda circular traída en talle ${etiquetaDeTalle(mejor.talle)}: es el que tiene la cintura más parecida a la del torso cortado.`);
    if (dif.some((x) => Math.abs(x) > 10)) notas.push("La cintura de la falda y la del torso no coinciden del todo: mirá el panel de costuras.");
    else if (dif.some((x) => Math.abs(x) > 1)) notas.push("La pequeña diferencia de cintura quedó declarada como embebido.");
  }

  acomodar(l);
  if (piezaDe(l, delantera.id) === null) throw new Error("El plan perdió una pieza: no debería pasar.");
  return { lienzo: l, notas };
}
