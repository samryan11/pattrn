// El paquete de descarga: un ZIP con el molde en el talle elegido, en los formatos pedidos.
//
//   pdf-a4/<pieza>.pdf      cada pieza en hojas A4 a escala 1:1, con hoja de control
//   dxf/<molde>.dxf         todas las piezas, para plotter o taller
//   hoja-de-pieza.pdf       lista de piezas, cortes y bordes
//   LEEME.txt               cómo imprimir y verificar la escala
//   licencias/…             avisos de las fuentes de origen

import { enTalle } from "../escalado";
import type { Fragmento } from "../tipos";
import { exportarDxf } from "./dxf";
import { exportarFragmentoPdf } from "./fragmento-pdf";
import { exportarHojaDePieza } from "./hoja-de-pieza";
import { armarZip, bytesDeTexto, type ArchivoZip } from "./zip";

export interface PiezaDePaquete {
  nombre: string;
  /** Fragmento en su talle base; el paquete lo lleva al talle pedido. */
  fragmento: Fragmento;
  cantidad: number;
  alDoblez: boolean;
}

export interface PedidoDePaquete {
  nombre: string;
  /** Talle al que llevar los fragmentos. Sin talle, van tal como están (ya fueron trabajados en el lienzo). */
  talle?: string;
  /** Cómo se le muestra el talle a la persona. */
  etiquetaTalle: string;
  base: string;
  piezas: PiezaDePaquete[];
  formatos: { pdf: boolean; dxf: boolean; hoja: boolean };
  notas?: string[];
  /** Archivos de licencia de las fuentes, que tienen que viajar con el molde. */
  licencias?: ArchivoZip[];
  fecha?: Date;
}

export const nombreDeArchivo = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pieza";

/** Los archivos que va a tener el paquete, sin generarlos: para mostrar antes de descargar. */
export function archivosDelPaquete(p: PedidoDePaquete): string[] {
  const out: string[] = [];
  if (p.formatos.pdf) for (const pz of p.piezas) out.push(`pdf-a4/${nombreDeArchivo(pz.nombre)}.pdf`);
  if (p.formatos.dxf) out.push(`dxf/${nombreDeArchivo(p.nombre)}.dxf`);
  if (p.formatos.hoja) out.push("hoja-de-pieza.pdf");
  if (!out.length) return out;
  out.push("LEEME.txt", ...(p.licencias ?? []).map((l) => `licencias/${l.nombre}`));
  return out;
}

function atribucion(piezas: PiezaDePaquete[]): string[] {
  const fuentes = new Map<string, string>();
  for (const pz of piezas) {
    const o = pz.fragmento.origen as { metodo: string; fuente?: { nombre: string; version: string; licencia: string; aviso: string } };
    if (o.metodo === "convertido" && o.fuente) {
      fuentes.set(o.fuente.nombre, `Piezas convertidas de ${o.fuente.nombre} ${o.fuente.version} (licencia ${o.fuente.licencia}). ${o.fuente.aviso.split(" · ")[0]}.`);
    }
  }
  return [...fuentes.values(), "Moldes bajo CC BY-SA 4.0: se pueden usar, copiar y modificar, nombrando el origen y compartiendo igual.",
    "PATTRN es software libre (GPLv3)."];
}

export async function armarPaquete(p: PedidoDePaquete): Promise<{ nombre: string; zip: Uint8Array; archivos: string[] }> {
  const esperados = archivosDelPaquete(p);
  if (!esperados.length) throw new Error("Elegí al menos un formato.");
  const piezas = [];
  for (const pz of p.piezas) {
    const f = structuredClone(p.talle ? await enTalle(pz.fragmento, p.talle) : pz.fragmento);
    f.nombre = p.etiquetaTalle ? `${pz.nombre} · talle ${p.etiquetaTalle}` : pz.nombre;
    piezas.push({ ...pz, fragmento: f });
  }
  const origen = atribucion(p.piezas);
  const archivos: ArchivoZip[] = [];
  if (p.formatos.pdf) for (const pz of piezas) archivos.push({ nombre: `pdf-a4/${nombreDeArchivo(pz.nombre)}.pdf`, datos: exportarFragmentoPdf(pz.fragmento).pdf });
  if (p.formatos.dxf) {
    const dxf = exportarDxf(piezas.map((pz) => ({
      nombre: pz.nombre, fragmento: pz.fragmento,
      detalle: `${p.etiquetaTalle ? `talle ${p.etiquetaTalle} - ` : ""}cortar ${pz.cantidad}${pz.alDoblez ? " al doblez" : ""}`,
    })));
    archivos.push({ nombre: `dxf/${nombreDeArchivo(p.nombre)}.dxf`, datos: bytesDeTexto(dxf) });
  }
  if (p.formatos.hoja) {
    archivos.push({ nombre: "hoja-de-pieza.pdf", datos: exportarHojaDePieza({
      titulo: p.nombre, talle: p.etiquetaTalle, base: p.base, piezas, notas: p.notas ?? [], atribucion: origen,
    }) });
  }
  const leeme = [
    p.etiquetaTalle ? `PATTRN · ${p.nombre} · talle ${p.etiquetaTalle}` : `PATTRN · ${p.nombre}`, "",
    "Todo está a escala real (1:1) y en milímetros.", "",
    ...(p.formatos.pdf ? [
      "PARA IMPRIMIR EN CASA (carpeta pdf-a4)",
      "1. Imprimí en hojas A4, al 100 %, sin «ajustar a la página».",
      "2. Antes de cortar, medí con regla el cuadrado de control de la primera hoja: tiene que dar 10 x 10 cm.",
      "3. Pegá las hojas siguiendo las marcas: cada una dice su letra y su número.",
      "4. La línea negra de afuera es la de corte: ya incluye el margen de costura.", "",
    ] : []),
    ...(p.formatos.dxf ? [
      "PARA PLOTTER O TALLER (carpeta dxf)",
      "El DXF está en milímetros. Capas: CORTE, COSTURA, DOBLEZ, UNION, TERMINADO, HILO, PIQUETES y TEXTO.", "",
    ] : []),
    "ORIGEN Y LICENCIA", ...origen, "",
  ].join("\r\n");
  archivos.push({ nombre: "LEEME.txt", datos: bytesDeTexto(leeme) });
  for (const l of p.licencias ?? []) archivos.push({ nombre: `licencias/${l.nombre}`, datos: l.datos });
  return {
    nombre: p.etiquetaTalle ? `${nombreDeArchivo(p.nombre)}-talle-${nombreDeArchivo(p.etiquetaTalle)}.zip` : `${nombreDeArchivo(p.nombre)}.zip`,
    zip: armarZip(archivos, p.fecha), archivos: archivos.map((a) => a.nombre),
  };
}
