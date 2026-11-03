// Exportación de un fragmento a PDF A4 en escala 1:1, en mosaico con marcas de pegado.
// La primera hoja es de control: un cuadrado de 10 cm para verificar la escala de
// impresión y las medidas que tienen que dar con la regla.

import { aplanar, largo, parametroEnLargo, puntoEn, derivadaEn, type Punto } from "../geometria";
import { areaConSigno, tramoDeBorde } from "../fragmento";
import { largoPolilinea, lineaDeCorte } from "../margen";
import { cm } from "../unidades";
import type { Fragmento } from "../tipos";
import { A4, documentoPdf, Pagina, type Color } from "./pdf";

const MARGEN_HOJA = 10; // mm sin imprimir alrededor del cuadro
const CUADRO: Punto = [A4[0] - 2 * MARGEN_HOJA, A4[1] - 2 * MARGEN_HOJA]; // 190 × 277 mm
const AIRE = 15; // mm libres alrededor del molde

const COLOR: Record<string, Color> = {
  costura: [0.12, 0.37, 0.75],
  doblez: [0.48, 0.25, 0.63],
  union: [0.88, 0.48, 0],
  terminado: [0.1, 0.54, 0.29],
};
const GRIS: Color = [0.55, 0.55, 0.55];
const NEGRO: Color = [0, 0, 0];

export interface MedidaBorde {
  borde: string;
  etiqueta: string;
  tipo: string;
  neto: number;
  margen: number;
  /** Largo del borde sobre la línea de corte, con las esquinas prolongadas. */
  corte: number;
}

export interface ExportacionPdf {
  pdf: Uint8Array;
  medidas: MedidaBorde[];
  hojas: { columnas: number; filas: number };
}

const anchoTexto = (s: string, tam: number) => s.length * tam * 0.52; // promedio de Helvetica

interface Grilla { x0: number; y0: number }

/** true si la caja (en coordenadas del molde) entra entera en una sola hoja, lejos de sus bordes. */
function enUnaHoja(g: Grilla, x0: number, x1: number, y0: number, y1: number, holgura = 6): boolean {
  const c = Math.floor((x0 - g.x0) / CUADRO[0]), f = Math.floor((y0 - g.y0) / CUADRO[1]);
  const hx0 = g.x0 + c * CUADRO[0], hy0 = g.y0 + f * CUADRO[1];
  return x0 >= hx0 + holgura && x1 <= hx0 + CUADRO[0] - holgura && y0 >= hy0 + holgura && y1 <= hy0 + CUADRO[1] - holgura;
}

export function exportarFragmentoPdf(frag: Fragmento): ExportacionPdf {
  const sentido = areaConSigno(frag) > 0 ? 1 : -1;
  const corte = lineaDeCorte(frag);
  const contornoCorte: Punto[] = corte.flatMap((t, i) => (i === 0 ? t.puntos : t.puntos.slice(1)));

  const medidas: MedidaBorde[] = frag.bordes.map((b, i) => ({
    borde: b.id, etiqueta: b.etiqueta, tipo: b.tipo,
    neto: largo(tramoDeBorde(frag, b)), margen: corte[i].margen, corte: largoPolilinea(corte[i].puntos),
  }));

  // extensión del molde y del mosaico
  const xs = contornoCorte.map((p) => p[0]), ys = contornoCorte.map((p) => p[1]);
  const ancho = Math.max(...xs) - Math.min(...xs) + 2 * AIRE, alto = Math.max(...ys) - Math.min(...ys) + 2 * AIRE;
  const columnas = Math.ceil(ancho / CUADRO[0]), filas = Math.ceil(alto / CUADRO[1]);
  const x0 = Math.min(...xs) - AIRE - (columnas * CUADRO[0] - ancho) / 2;
  const y0 = Math.min(...ys) - AIRE - (filas * CUADRO[1] - alto) / 2;
  const nombreHoja = (c: number, fDesdeAbajo: number) => String.fromCharCode(65 + c) + (filas - fDesdeAbajo);

  const paginas = [hojaDeControl(frag, medidas, columnas, filas)];

  for (let fila = filas - 1; fila >= 0; fila--) {
    for (let c = 0; c < columnas; c++) {
      const p = new Pagina();
      const ox = x0 + c * CUADRO[0], oy = y0 + fila * CUADRO[1];
      const m = (q: Punto): Punto => [MARGEN_HOJA + q[0] - ox, MARGEN_HOJA + q[1] - oy];
      const hoja = nombreHoja(c, fila);

      p.texto(MARGEN_HOJA, A4[1] - 6, `PATTRN · ${frag.nombre} · hoja ${hoja} (${columnas} × ${filas}) · imprimir al 100 %`, 3);
      marcasDePegado(p, c, fila, columnas, filas, nombreHoja);
      // barra de 5 cm fuera del cuadro, para verificar cada hoja
      p.polilinea([[A4[0] - 60, 5], [A4[0] - 10, 5]], { ancho: 0.4 });
      p.polilinea([[A4[0] - 60, 3.5], [A4[0] - 60, 6.5]], { ancho: 0.3 });
      p.polilinea([[A4[0] - 10, 3.5], [A4[0] - 10, 6.5]], { ancho: 0.3 });
      p.texto(A4[0] - 85, 4, "5,00 cm", 2.6);

      p.guardar();
      p.recortar(MARGEN_HOJA, MARGEN_HOJA, CUADRO[0], CUADRO[1]);
      dibujarFragmento(p, frag, m, contornoCorte, corte, sentido, medidas, { x0, y0 });
      p.restaurar();
      paginas.push(p);
    }
  }

  return { pdf: documentoPdf(paginas, `PATTRN · ${frag.nombre}`), medidas, hojas: { columnas, filas } };
}

function dibujarFragmento(
  p: Pagina, frag: Fragmento, m: (q: Punto) => Punto, contornoCorte: Punto[],
  corte: ReturnType<typeof lineaDeCorte>, sentido: number, medidas: MedidaBorde[], grilla: Grilla,
) {
  // línea de corte
  p.polilinea(contornoCorte.map(m), { color: NEGRO, ancho: 0.35, cerrado: true });

  frag.bordes.forEach((b, i) => {
    const t = tramoDeBorde(frag, b);
    const pts = aplanar(t).map(m);
    const estilo = b.tipo === "union" ? { guiones: [3, 1.6] } : b.tipo === "doblez" ? { guiones: [5, 1.2, 1, 1.2] } : {};
    // la línea neta coincide con la de corte donde no hay margen: se dibuja encima, en su color
    p.polilinea(pts, { color: COLOR[b.tipo], ancho: b.tipo === "terminado" ? 0.9 : 0.3, ...estilo });

    for (const pq of b.piquetes ?? []) {
      const u = parametroEnLargo(t, pq.pos_mm);
      const q = puntoEn(t, u), d = derivadaEn(t, u), L = Math.hypot(d[0], d[1]);
      const afuera: Punto = [(d[1] / L) * sentido, (-d[0] / L) * sentido];
      const h = (corte[i].margen || 5) + 1;
      p.polilinea([m([q[0] - afuera[0], q[1] - afuera[1]]), m([q[0] + afuera[0] * h, q[1] + afuera[1] * h])],
        { color: NEGRO, ancho: 0.5 });
    }

    const lineas = [`${b.id} ${b.etiqueta} · neto ${cm(medidas[i].neto)}`];
    if (b.tipo === "costura") lineas.push(`margen ${cm(medidas[i].margen)} · en el corte ${cm(medidas[i].corte)}`);
    if (b.tipo === "terminado") lineas.push(`TERMINADO ${b.terminado?.que ?? ""} · no agregar margen`);
    if (b.tipo === "union") lineas.push("UNIÓN · sin margen, se fusiona con otro fragmento");
    if (b.tipo === "doblez") lineas.push("AL DOBLEZ");
    if (b.certeza?.estado === "incierta") lineas.push("INCIERTO: medir antes de cortar");

    // rótulo hacia adentro del borde, en el primer lugar que entre entero en una hoja
    const w = Math.max(...lineas.map((s, k) => anchoTexto(s, k === 0 ? 3.2 : 2.8)));
    const altoTexto = (lineas.length - 1) * 4.2;
    let centroMolde: Punto | null = null;
    for (const fraccion of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const u = parametroEnLargo(t, medidas[i].neto * fraccion);
      const q = puntoEn(t, u), d = derivadaEn(t, u), L = Math.hypot(d[0], d[1]);
      const adentro: Punto = [(-d[1] / L) * sentido, (d[0] / L) * sentido];
      // lo que hay que alejarse para que la caja del texto no toque el borde
      const base = 6 + Math.abs(adentro[0]) * (w / 2) + Math.abs(adentro[1]) * (altoTexto / 2 + 3);
      for (const extra of [0, 8, 16]) {
        const hacia = base + extra;
        const c: Punto = [q[0] + adentro[0] * hacia, q[1] + adentro[1] * hacia + altoTexto / 2];
        if (enUnaHoja(grilla, c[0] - w / 2, c[0] + w / 2, c[1] - altoTexto - 1, c[1] + 3.5)) {
          centroMolde = c;
          break;
        }
      }
      if (centroMolde) break;
    }
    if (!centroMolde) {
      const u = parametroEnLargo(t, medidas[i].neto / 2);
      const q = puntoEn(t, u), d = derivadaEn(t, u), L = Math.hypot(d[0], d[1]);
      centroMolde = [q[0] + (-d[1] / L) * sentido * 16, q[1] + (d[0] / L) * sentido * 16];
    }
    const centro = m(centroMolde);
    lineas.forEach((s, k) => {
      const tam = k === 0 ? 3.2 : 2.8;
      p.texto(centro[0] - anchoTexto(s, tam) / 2, centro[1] - k * 4.2, s, tam,
        { color: COLOR[b.tipo], negrita: k === 0 });
    });
  });

  // marcas
  for (const mk of (frag.marcas ?? []) as { tipo: string; puntos?: Punto[] }[]) {
    if (mk.tipo === "boton" && mk.puntos) {
      const c = m(mk.puntos[0]);
      p.circulo(c, 3, { ancho: 0.25 });
      p.polilinea([[c[0] - 1.5, c[1]], [c[0] + 1.5, c[1]]], { ancho: 0.2 });
      p.polilinea([[c[0], c[1] - 1.5], [c[0], c[1] + 1.5]], { ancho: 0.2 });
    }
  }

  // hilo
  const h = frag.hilo;
  const vys = Object.values(frag.vertices).map((v) => v[1]);
  const lh = Math.min(240, 0.45 * (Math.max(...vys) - Math.min(...vys))) / 2;
  const a = (h.angulo_grados * Math.PI) / 180, dir: Punto = [Math.cos(a), Math.sin(a)];
  const e1 = m([h.punto[0] - dir[0] * lh, h.punto[1] - dir[1] * lh]);
  const e2 = m([h.punto[0] + dir[0] * lh, h.punto[1] + dir[1] * lh]);
  p.polilinea([e1, e2], { ancho: 0.45 });
  const punta = (tip: Punto, haciaAfuera: Punto) => {
    const ang = Math.atan2(haciaAfuera[1], haciaAfuera[0]);
    const izq: Punto = [tip[0] - 4 * Math.cos(ang - 0.4), tip[1] - 4 * Math.sin(ang - 0.4)];
    const der: Punto = [tip[0] - 4 * Math.cos(ang + 0.4), tip[1] - 4 * Math.sin(ang + 0.4)];
    p.polilinea([izq, tip, der], { ancho: 0.45, relleno: NEGRO, cerrado: true, color: NEGRO });
  };
  punta(e2, dir);
  if (!h.sentido_unico) punta(e1, [-dir[0], -dir[1]]);
  const ph = m(h.punto);
  p.texto(ph[0] + 3, ph[1] + 2, "HILO", 3.2, { negrita: true, angulo: h.angulo_grados });

  // nombre del fragmento cerca del hilo, entero en una hoja
  const wn = anchoTexto(frag.nombre, 3.6);
  let nombre: Punto = [h.punto[0] - wn - 8, h.punto[1] - 30];
  buscar: for (const dy of [-30, 30, -60, 60, -90, 90, 0]) {
    for (const dx of [-wn - 8, 8, -wn / 2, -wn - 40, 40]) {
      const c: Punto = [h.punto[0] + dx, h.punto[1] + dy];
      if (enUnaHoja(grilla, c[0], c[0] + wn, c[1] - 6, c[1] + 4)) {
        nombre = c;
        break buscar;
      }
    }
  }
  const pn = m(nombre);
  p.texto(pn[0], pn[1], frag.nombre, 3.6, { negrita: true, color: GRIS });
  p.texto(pn[0], pn[1] - 5, `${frag.id}@${frag.version} · CC BY-SA 4.0`, 2.8, { color: GRIS });
}

function marcasDePegado(
  p: Pagina, c: number, fila: number, columnas: number, filas: number,
  nombre: (c: number, f: number) => string,
) {
  const [x, y, w, h] = [MARGEN_HOJA, MARGEN_HOJA, CUADRO[0], CUADRO[1]];
  p.rectangulo(x, y, w, h, { color: GRIS, ancho: 0.2, guiones: [2, 1.5] });
  // cruces de registro en las esquinas del cuadro
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as Punto[]) {
    p.polilinea([[cx - 3, cy], [cx + 3, cy]], { ancho: 0.25 });
    p.polilinea([[cx, cy - 3], [cx, cy + 3]], { ancho: 0.25 });
  }
  // un triángulo en el medio de cada lado que pega con otra hoja; al unir dos hojas se completa un rombo
  const lado = (a: Punto, b: Punto, vecino: string, txt: Punto) => {
    p.polilinea([a, b, [(a[0] + b[0]) / 2 + (b[1] - a[1]) / 2, (a[1] + b[1]) / 2 - (b[0] - a[0]) / 2]],
      { color: GRIS, relleno: [0.85, 0.85, 0.85], cerrado: true, ancho: 0.2 });
    p.texto(txt[0], txt[1], `pegar con ${vecino}`, 2.6, { color: GRIS });
  };
  if (c < columnas - 1) lado([x + w, y + h / 2 + 6], [x + w, y + h / 2 - 6], nombre(c + 1, fila), [x + w - 26, y + h / 2 + 9]);
  if (c > 0) lado([x, y + h / 2 - 6], [x, y + h / 2 + 6], nombre(c - 1, fila), [x + 2, y + h / 2 + 9]);
  if (fila < filas - 1) lado([x + w / 2 - 6, y + h], [x + w / 2 + 6, y + h], nombre(c, fila + 1), [x + w / 2 + 9, y + h - 4]);
  if (fila > 0) lado([x + w / 2 + 6, y], [x + w / 2 - 6, y], nombre(c, fila - 1), [x + w / 2 + 9, y + 2]);
}

function hojaDeControl(frag: Fragmento, medidas: MedidaBorde[], columnas: number, filas: number): Pagina {
  const p = new Pagina();
  let y = A4[1] - 20;
  const linea = (s: string, tam = 3.4, negrita = false, color: Color = NEGRO) => {
    p.texto(20, y, s, tam, { negrita, color });
    y -= tam * 1.6;
  };
  linea("PATTRN · hoja de control", 5, true);
  linea(`${frag.nombre} · ${frag.id}@${frag.version}`, 3.4);
  linea(`huella ${frag.huella}`, 2.4, false, GRIS);
  y -= 4;
  linea("1. Imprimí al 100 % (tamaño real). No uses \"ajustar a la página\".", 3.4, true);
  linea("2. Medí el cuadrado: tiene que dar 10,00 cm de cada lado. Si no, la escala está mal.", 3.4);
  linea(`3. Recortá cada hoja por el borde punteado del cuadro y pegalas (${columnas} × ${filas}).`, 3.4);
  linea("   Los triángulos grises de hojas vecinas forman un rombo. Cada hoja trae una barra de 5 cm.", 3.4);

  // cuadrado de control
  const [qx, qy] = [20, y - 108];
  p.rectangulo(qx, qy, 100, 100, { ancho: 0.3 });
  p.texto(qx + 30, qy + 52, "10,00 cm × 10,00 cm", 4, { negrita: true });
  for (let i = 0; i <= 10; i++) p.polilinea([[qx + i * 10, qy], [qx + i * 10, qy + (i % 5 === 0 ? 5 : 3)]], { ancho: 0.2 });

  // medidas esperadas
  let ty = qy + 100;
  const fila = (s: string, negrita = false, color: Color = NEGRO) => {
    p.texto(130, ty, s, 3, { negrita, color });
    ty -= 5;
  };
  fila("Medidas que tienen que dar", true);
  ty -= 1;
  for (const md of medidas) {
    fila(`${md.borde} ${md.etiqueta} (${md.tipo})`, true, COLOR[md.tipo]);
    fila(`  neto ${cm(md.neto)}`);
    if (md.margen > 0) fila(`  margen ${cm(md.margen)}, en perpendicular`);
    fila(`  en la línea de corte ${cm(md.corte)}`);
    ty -= 1.5;
  }

  // mapa del mosaico
  y = qy - 14;
  p.texto(20, y, "Mapa de hojas", 3.4, { negrita: true });
  const celda = 14;
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const cx = 20 + c * celda, cy = y - 6 - (f + 1) * celda * 1.4;
      p.rectangulo(cx, cy, celda, celda * 1.4, { ancho: 0.25 });
      p.texto(cx + 4, cy + 8, String.fromCharCode(65 + c) + (f + 1), 3.4, { negrita: true });
    }
  }

  // advertencias que salen de la geometría
  let ay = y - 10 - filas * celda * 1.4 - 10;
  for (const md of medidas) {
    if (md.tipo === "terminado" && md.corte - md.neto > 0.005) {
      p.texto(20, ay, `Atención: el borde terminado ${md.borde} (${md.etiqueta}) se prolonga ${cm(md.corte - md.neto)} en la línea de corte`, 3);
      p.texto(20, ay - 4.5, "por el margen del borde vecino: la prenda donante tiene que tener ese tramo terminado.", 3);
      ay -= 11;
    }
  }
  p.texto(20, 12, "Moldes PATTRN bajo CC BY-SA 4.0 · software GPLv3", 2.6, { color: GRIS });
  return p;
}
