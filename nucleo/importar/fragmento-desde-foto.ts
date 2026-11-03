// De los bordes detectados en la foto (ya en mm) y las respuestas de la persona al fragmento
// PATTRN. Si el contorno del papel incluye margen, se descuenta borde por borde para que la
// geometría sea la línea neta. Si la respuesta es "no sé", el borde queda tal cual y marcado
// como incierto: nunca se inventa un número.

import { aplanar, distancia, interseccionRectas, largo, redondear, type Punto, type Tramo } from "../geometria";
import { huella } from "../huella";
import { desplazar } from "../margen";
import type { Borde, Fragmento, TipoBorde } from "../tipos";
import { ajustarCurva, type BordeDetectado } from "./contorno";
import type { Calibracion } from "./calibracion";

export interface RespuestaDeBorde {
  etiqueta: string;
  descripcion?: string;
  tipo: TipoBorde;
  /** Margen que trae el papel en este borde, en mm, o "no_se". */
  margenEnContorno: number | "no_se";
  /** Margen a agregar al exportar (solo en costura). */
  margenMm?: number;
  terminado?: { que: string; descripcion?: string; ancho_mm?: number };
}

export interface DatosDeImportacion {
  nombre: string;
  autor: string;
  fecha: string;
  foto: string;
  calibracion: Calibracion;
  bordes: BordeDetectado[];
  respuestas: RespuestaDeBorde[];
  /** Dos puntos sobre la línea de hilo, en mm (las mismas coordenadas que los bordes). */
  hilo: { desde: Punto; hasta: Punto; fuente: "marcado_en_original" | "declarado" };
  tolerancia: number;
  talle?: string;
}

function areaConSigno(pts: Punto[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function adentroDe(p: Punto, poligono: Punto[]) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i], [xj, yj] = poligono[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function idAleatorio() {
  return "frg-" + Array.from({ length: 8 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");
}

export async function fragmentoDesdeFoto(d: DatosDeImportacion): Promise<{ fragmento: Fragmento; avisos: string[] }> {
  if (d.respuestas.length !== d.bordes.length) throw new Error("falta responder algún borde");
  const avisos: string[] = [];

  // cada tramo detectado es un borde del formato; un borde partido en dos curvas da dos bordes
  const partes: { tramo: Tramo; r: RespuestaDeBorde; parte: number; de: number }[] = [];
  d.bordes.forEach((b, i) => b.tramos.forEach((t, k) => partes.push({ tramo: t, r: d.respuestas[i], parte: k + 1, de: b.tramos.length })));

  // orientación antihoraria
  const contorno = partes.flatMap((p) => aplanar(p.tramo).slice(0, -1));
  const sentido = areaConSigno(contorno) > 0 ? 1 : -1;

  // línea neta: cada borde se corre hacia adentro lo que trae de margen el papel
  const polis = partes.map((p) => {
    const m = p.r.margenEnContorno === "no_se" ? 0 : p.r.margenEnContorno;
    return desplazar(aplanar(p.tramo), m, -sentido); // -sentido: hacia la izquierda de un antihorario, adentro
  });
  // esquinas: los tramos vecinos se prolongan o recortan hasta cortarse
  for (let i = 0; i < polis.length; i++) {
    const a = polis[i], b = polis[(i + 1) % polis.length];
    const x = interseccionRectas(a[a.length - 2], a[a.length - 1], b[0], b[1]);
    if (x && distancia(x, a[a.length - 1]) < 50) { a[a.length - 1] = x; b[0] = x; }
  }
  // de vuelta a recta o Bézier, con las esquinas ya unidas
  const netos: Tramo[] = polis.map((pts, i) => {
    if (partes[i].tramo.tipo === "recta") return { tipo: "recta", p0: pts[0], p1: pts[pts.length - 1] } as Tramo;
    return ajustarCurva(pts); // el tramo ya era una sola curva: corrido sigue siéndolo
  });

  // a coordenadas del fragmento: en sentido antihorario y con el mínimo en (0, 0)
  const orden = sentido > 0 ? netos.map((_, i) => i) : netos.map((_, i) => netos.length - 1 - i);
  const tramos: Tramo[] = orden.map((i) => {
    const t = netos[i];
    if (sentido > 0) return t;
    return t.tipo === "recta" ? { tipo: "recta", p0: t.p1, p1: t.p0 } : { tipo: "bezier", p0: t.p1, c1: t.c2, c2: t.c1, p1: t.p0 };
  });
  const todos = tramos.flatMap((t) => aplanar(t));
  const mx = Math.min(...todos.map((p) => p[0])), my = Math.min(...todos.map((p) => p[1]));
  const mover = (p: Punto): [number, number] => [redondear(p[0] - mx), redondear(p[1] - my)];

  const vertices: Record<string, [number, number]> = {};
  const bordes: Borde[] = tramos.map((t, k) => {
    const p = partes[orden[k]];
    vertices[`v${k + 1}`] = mover(t.p0);
    const b: Borde = {
      id: `b${k + 1}`, de: `v${k + 1}`, a: `v${(k + 1) % tramos.length + 1}`,
      etiqueta: p.r.etiqueta, tipo: p.r.tipo,
    };
    if (t.tipo === "bezier") b.curva = { tipo: "bezier", c1: mover(t.c1), c2: mover(t.c2) };
    const descripcion = [p.r.descripcion, p.de > 1 ? `parte ${p.parte} de ${p.de}` : ""].filter(Boolean).join(" · ");
    if (descripcion || p.r.etiqueta === "otro") b.descripcion = descripcion || "sin descripción";
    if (p.r.tipo === "costura") b.margen_mm = p.r.margenMm ?? 10;
    if (p.r.tipo === "terminado") b.terminado = p.r.terminado ?? { que: "otro" };
    b.importacion = { margen_en_contorno: p.r.margenEnContorno };
    if (p.r.margenEnContorno === "no_se") b.certeza = { estado: "incierta", motivo: "margen_desconocido" };
    return b;
  });

  // hilo: punto medio de la línea marcada y su ángulo
  const h0 = mover(d.hilo.desde), h1 = mover(d.hilo.hasta);
  const punto: [number, number] = [redondear((h0[0] + h1[0]) / 2), redondear((h0[1] + h1[1]) / 2)];
  let angulo = (Math.atan2(h1[1] - h0[1], h1[0] - h0[0]) * 180) / Math.PI;
  angulo = redondear(((angulo % 360) + 360) % 360);
  if (angulo >= 360) angulo = 0;
  const poligono = tramos.flatMap((t) => aplanar(t).slice(0, -1)).map(mover);
  if (!adentroDe(punto, poligono)) avisos.push("el punto medio de la línea de hilo queda fuera de la pieza: revisá dónde la marcaste");

  const alto = Math.max(...poligono.map((p) => p[1])), ancho = Math.max(...poligono.map((p) => p[0]));
  const errorEstimado = d.calibracion.errorPara(Math.hypot(ancho, alto));
  avisos.push(...d.calibracion.avisos);

  const fragmento: Fragmento = {
    pattrn: "0.1", tipo: "fragmento", id: idAleatorio(), version: 1, huella: "",
    nombre: d.nombre, unidades: "mm", licencia: "CC-BY-SA-4.0",
    autoria: { autor: d.autor, fecha_creacion: d.fecha, fecha_version: d.fecha },
    origen: {
      metodo: "foto", foto: d.foto, objeto: "molde_papel",
      calibracion: {
        referencia: "regla", largo_referencia_mm: redondear(d.calibracion.largoReferencia),
        error_estimado_mm: errorEstimado, tolerancia_ajuste_curvas_mm: d.tolerancia,
      },
    },
    ...(d.talle ? { talle_base: d.talle } : {}),
    hilo: { punto, angulo_grados: angulo, fuente: d.hilo.fuente, sentido_unico: false },
    vertices, bordes,
    escalado: { metodo: "deltas", talles: {} },
  };
  fragmento.huella = await huella(fragmento);
  const perimetro = tramos.reduce((s, t) => s + largo(t), 0);
  if (perimetro < 50) avisos.push("la pieza mide menos de 5 cm de contorno: revisá la calibración");
  return { fragmento, avisos };
}
