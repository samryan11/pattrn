// DXF para plotter, tizadora o taller. Formato R12 en texto, en milímetros, a escala 1:1.
// Solo se escribe, nunca se lee. Las curvas van como polilíneas.
//
// Capas, por nombre:
//   CORTE      línea de corte (la neta más el margen de cada borde)
//   COSTURA    línea neta de los bordes de costura y de dobladillo
//   DOBLEZ     bordes que van al doblez de la tela
//   UNION      bordes de unión entre fragmentos
//   TERMINADO  bordes que ya vienen terminados de la prenda donante
//   HILO       dirección del hilo
//   PIQUETES   piquetes, de la línea neta a la de corte
//   TEXTO      nombre de la pieza, talle y cantidad a cortar
//
// La convención de capas AAMA/ASTM queda para la especificación de exportación.

import { aplanar, derivadaEn, parametroEnLargo, puntoEn, type Punto } from "../geometria";
import { areaConSigno, tramoDeBorde } from "../fragmento";
import { lineaDeCorte } from "../margen";
import type { Fragmento, TipoBorde } from "../tipos";

export interface PiezaDxf {
  nombre: string;
  fragmento: Fragmento;
  /** Texto bajo el nombre: talle, cantidad a cortar. */
  detalle?: string;
}

const CAPAS: [string, number][] = [
  ["CORTE", 7], ["COSTURA", 5], ["DOBLEZ", 6], ["UNION", 30], ["TERMINADO", 3], ["HILO", 1], ["PIQUETES", 2], ["TEXTO", 8],
];
const CAPA_DE: Record<TipoBorde, string> = { costura: "COSTURA", dobladillo: "COSTURA", doblez: "DOBLEZ", union: "UNION", terminado: "TERMINADO" };
const SEPARACION = 30; // mm entre piezas

const num = (x: number) => (Math.round(x * 1000) / 1000).toString();
/** El DXF R12 solo garantiza ASCII: se quitan los acentos. */
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/·/g, "-").replace(/[^\x20-\x7e]/g, "?");

export function exportarDxf(piezas: PiezaDxf[]): string {
  const l: (string | number)[] = [];
  const par = (codigo: number, valor: string | number) => { l.push(codigo, valor); };
  const polilinea = (capa: string, pts: readonly Punto[], cerrada = false) => {
    par(0, "POLYLINE"); par(8, capa); par(66, 1); par(70, cerrada ? 1 : 0);
    for (const q of pts) { par(0, "VERTEX"); par(8, capa); par(10, num(q[0])); par(20, num(q[1])); }
    par(0, "SEQEND"); par(8, capa);
  };
  const linea = (capa: string, a: Punto, b: Punto) => {
    par(0, "LINE"); par(8, capa); par(10, num(a[0])); par(20, num(a[1])); par(11, num(b[0])); par(21, num(b[1]));
  };
  const texto = (capa: string, p: Punto, alto: number, s: string) => {
    par(0, "TEXT"); par(8, capa); par(10, num(p[0])); par(20, num(p[1])); par(40, num(alto)); par(1, ascii(s));
  };

  par(0, "SECTION"); par(2, "HEADER"); par(9, "$ACADVER"); par(1, "AC1009"); par(0, "ENDSEC");
  par(0, "SECTION"); par(2, "TABLES");
  par(0, "TABLE"); par(2, "LTYPE"); par(70, 1);
  par(0, "LTYPE"); par(2, "CONTINUOUS"); par(70, 0); par(3, "Solid line"); par(72, 65); par(73, 0); par(40, "0.0");
  par(0, "ENDTAB");
  par(0, "TABLE"); par(2, "LAYER"); par(70, CAPAS.length);
  for (const [nombre, color] of CAPAS) { par(0, "LAYER"); par(2, nombre); par(70, 0); par(62, color); par(6, "CONTINUOUS"); }
  par(0, "ENDTAB"); par(0, "ENDSEC");
  par(0, "SECTION"); par(2, "ENTITIES");

  let x = 0;
  for (const pieza of piezas) {
    const f = pieza.fragmento;
    const corte = lineaDeCorte(f);
    const contorno = corte.flatMap((t, i) => (i === 0 ? t.puntos : t.puntos.slice(1)));
    const minX = Math.min(...contorno.map((q) => q[0])), maxX = Math.max(...contorno.map((q) => q[0]));
    const minY = Math.min(...contorno.map((q) => q[1]));
    const m = (q: Punto): Punto => [q[0] - minX + x, q[1] - minY];
    const sentido = areaConSigno(f) > 0 ? 1 : -1;

    polilinea("CORTE", contorno.slice(0, -1).map(m), true);
    f.bordes.forEach((b, i) => {
      const t = tramoDeBorde(f, b);
      polilinea(CAPA_DE[b.tipo], aplanar(t).map(m));
      for (const pq of b.piquetes ?? []) {
        const u = parametroEnLargo(t, pq.pos_mm), q = puntoEn(t, u), d = derivadaEn(t, u), L = Math.hypot(d[0], d[1]);
        const h = corte[i].margen || 5;
        linea("PIQUETES", m(q), m([q[0] + (d[1] / L) * sentido * h, q[1] - (d[0] / L) * sentido * h]));
      }
    });
    const a = (f.hilo.angulo_grados * Math.PI) / 180, largoHilo = 60;
    const h0: Punto = [f.hilo.punto[0] - Math.cos(a) * largoHilo, f.hilo.punto[1] - Math.sin(a) * largoHilo];
    const h1: Punto = [f.hilo.punto[0] + Math.cos(a) * largoHilo, f.hilo.punto[1] + Math.sin(a) * largoHilo];
    linea("HILO", m(h0), m(h1));
    const base = m([f.hilo.punto[0] + 8, f.hilo.punto[1]]);
    texto("TEXTO", base, 8, pieza.nombre);
    if (pieza.detalle) texto("TEXTO", [base[0], base[1] - 12], 5, pieza.detalle);
    x += maxX - minX + SEPARACION;
  }
  par(0, "ENDSEC"); par(0, "EOF");
  return l.join("\r\n") + "\r\n";
}
