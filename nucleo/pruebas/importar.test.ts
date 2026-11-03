// Importador de fotos contra una foto sintética de medidas conocidas: una pieza con una
// curva arriba, fotografiada rotada 3° a 0,5 mm por píxel, sobre "madera" con ruido, con una
// perforación y la línea de costura a lápiz a 10 mm del borde.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, test } from "vitest";
import {
  aplanar, bordesDesdeContorno, calibrar, cm, fragmentoDesdeFoto, huella, largo, largoDeBorde,
  segmentar, seguirBorde, type Bezier, type Imagen, type MarcaDeRegla, type Punto, type Tramo,
} from "../index";

const ESCALA = 0.5; // mm por píxel
const GIRO = (3 * Math.PI) / 180;
const W = 900, H = 1400;

// la pieza, en mm, antihoraria: base recta, laterales rectos y una curva arriba (más alta a la izquierda)
const CURVA: Bezier = { tipo: "bezier", p0: [300, 500], c1: [220, 560], c2: [80, 540], p1: [0, 520] };
const PIEZA: Tramo[] = [
  { tipo: "recta", p0: [0, 0], p1: [300, 0] },
  { tipo: "recta", p0: [300, 0], p1: [300, 500] },
  CURVA,
  { tipo: "recta", p0: [0, 520], p1: [0, 0] },
];

/** mm → píxeles de la foto: giro, escala, y hacia abajo. */
function aPx(p: Punto): Punto {
  const x = p[0] * Math.cos(GIRO) - p[1] * Math.sin(GIRO), y = p[0] * Math.sin(GIRO) + p[1] * Math.cos(GIRO);
  return [120 + x / ESCALA, H - 150 - y / ESCALA];
}

function fotoSintetica(): Imagen {
  const datos = new Uint8ClampedArray(W * H * 4);
  let semilla = 12345;
  const ruido = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return (semilla / 0x7fffffff - 0.5) * 2; };
  const poligono = PIEZA.flatMap((t) => aplanar(t).slice(0, -1)).map(aPx);
  // cobertura exacta por filas: 4 subfilas por píxel
  const cobertura = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let s = 0; s < 4; s++) {
      const yy = y + (s + 0.5) / 4;
      const xs: number[] = [];
      for (let i = 0; i < poligono.length; i++) {
        const [x0, y0] = poligono[i], [x1, y1] = poligono[(i + 1) % poligono.length];
        if ((y0 > yy) !== (y1 > yy)) xs.push(x0 + ((yy - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.floor(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
          cobertura[y * W + x] += Math.max(0, Math.min(x + 1, xs[k + 1]) - Math.max(x, xs[k])) / 4;
        }
      }
    }
  }
  const lapiz = ([[10, 10], [290, 10], [290, 490], [10, 505]] as Punto[]).map(aPx);
  const perforacion = aPx([150, 25]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = cobertura[y * W + x];
    const veta = 12 * Math.sin(y / 9 + Math.sin(x / 40));
    let r = 190 * (1 - c) + 245 * c + 4 * ruido() + (1 - c) * veta;
    let g = 140 * (1 - c) + 243 * c + 4 * ruido() + (1 - c) * veta * 0.7;
    let b = 90 * (1 - c) + 238 * c + 4 * ruido();
    // línea de lápiz y perforación, solo sobre el papel
    const cercaDeLapiz = lapiz.some((p, i) => {
      const q = lapiz[(i + 1) % lapiz.length];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const t = Math.max(0, Math.min(1, ((x - p[0]) * (q[0] - p[0]) + (y - p[1]) * (q[1] - p[1])) / (L * L)));
      return Math.hypot(x - (p[0] + t * (q[0] - p[0])), y - (p[1] + t * (q[1] - p[1]))) < 1;
    });
    if (c > 0.99 && cercaDeLapiz) { r = g = b = 110; }
    if (Math.hypot(x - perforacion[0], y - perforacion[1]) < 6) { r = 190; g = 140; b = 90; }
    const i = 4 * (y * W + x);
    datos[i] = r; datos[i + 1] = g; datos[i + 2] = b; datos[i + 3] = 255;
  }
  return { ancho: W, alto: H, datos };
}

// regla a lo largo de la base, 3 cm por debajo de la pieza; escuadra cruzada a la izquierda
const regla: MarcaDeRegla[] = [0, 300, 600].map((mm) => ({ px: aPx([mm - 50, -30]), mm }));
const escuadra: MarcaDeRegla[] = [0, 300].map((mm) => ({ px: aPx([-40, mm]), mm }));

describe("importar una foto sintética", () => {
  const img = fotoSintetica();
  const seg = segmentar(img, aPx([150, 250]));
  const borde = seguirBorde(img, seg);
  const cal = calibrar(regla, escuadra);
  const enMm = borde.map(cal.aMm);
  const det = bordesDesdeContorno(enMm, 0.5); // un píxel de esta foto

  test("separa la pieza del fondo con buen contraste, entera y sin tocar el borde de la foto", () => {
    expect(seg.contraste).toBeGreaterThan(60);
    expect(seg.tocaElBorde).toBe(false);
  });

  test("calibra 0,5 mm por píxel sin inclinación", () => {
    expect(cal.escalaRegla).toBeCloseTo(0.5, 5);
    expect(cal.escalaCruzada).toBeCloseTo(0.5, 5);
    expect(cal.anisotropia).toBeLessThan(1e-6);
  });

  test("encuentra las cuatro esquinas, aunque la perforación y el lápiz estén adentro", () => {
    expect(det.bordes).toHaveLength(4);
  });

  test("cada borde mide lo que mide la pieza, con menos de un píxel de diferencia (0,5 mm en esta foto)", () => {
    const verdad = PIEZA.map((t) => largo(t)).sort((a, b) => a - b);
    const medidos = det.bordes.map((b) => b.largo).sort((a, b) => a - b);
    medidos.forEach((m, i) => expect(Math.abs(m - verdad[i])).toBeLessThan(ESCALA));
  });

  test("tres bordes son rectas y la curva se ajusta con una sola Bézier dentro de la tolerancia", () => {
    const tipos = det.bordes.map((b) => b.tramos.map((t) => t.tipo).join("+")).sort();
    expect(tipos).toEqual(["bezier", "recta", "recta", "recta"]);
    for (const b of det.bordes) expect(b.desvio).toBeLessThanOrEqual(0.5);
  });

  test("arma el fragmento: margen descontado, hilo, sin espejar y válido según el esquema", async () => {
    // ordenar respuestas por borde: el lateral más corto es el derecho (500), el largo el izquierdo (520)
    const respuestas = det.bordes.map((b) => {
      const curva = b.tramos[0].tipo === "bezier";
      return { etiqueta: curva ? "escote" : "lateral", tipo: "costura" as const, margenEnContorno: curva ? ("no_se" as const) : 10, margenMm: 10 };
    });
    const { fragmento, avisos } = await fragmentoDesdeFoto({
      nombre: "Pieza de prueba", autor: "PATTRN prueba", fecha: "2026-11-04", foto: "sintetica.png",
      calibracion: cal, bordes: det.bordes, respuestas, tolerancia: 0.5,
      hilo: { desde: cal.aMm(aPx([150, 100])), hasta: cal.aMm(aPx([150, 400])), fuente: "marcado_en_original" },
    });
    expect(avisos).toEqual([]);
    expect(await huella(fragmento)).toBe(fragmento.huella);

    // la base neta: 300 − 2 × 10 de margen en los laterales
    const largos = fragmento.bordes.map((b) => largoDeBorde(fragmento, b.id));
    const rectas = fragmento.bordes.filter((b) => !b.curva).map((b) => largoDeBorde(fragmento, b.id)).sort((a, b) => a - b);
    expect(cm(rectas[0])).toBe("28,00 cm");
    expect(largos.length).toBe(4);

    // la curva sin margen conocido queda tal cual y marcada como incierta
    const curva = fragmento.bordes.find((b) => b.curva)!;
    expect(curva.certeza).toEqual({ estado: "incierta", motivo: "margen_desconocido" });
    expect(curva.importacion).toEqual({ margen_en_contorno: "no_se" });

    // sin espejo: la curva es más alta del lado izquierdo, como en la pieza
    const izq = Object.values(fragmento.vertices).filter((v) => v[0] < 50).map((v) => v[1]);
    const der = Object.values(fragmento.vertices).filter((v) => v[0] > 250).map((v) => v[1]);
    expect(Math.max(...izq)).toBeGreaterThan(Math.max(...der));

    // hilo vertical, dentro de la pieza
    expect(Math.abs(Math.sin((fragmento.hilo.angulo_grados * Math.PI) / 180))).toBeCloseTo(1, 3);

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validar = ajv.compile(JSON.parse(readFileSync(join(__dirname, "..", "..", "esquemas", "fragmento.schema.json"), "utf-8")));
    expect(validar(fragmento), JSON.stringify(validar.errors)).toBe(true);
  });
});

describe("calibración", () => {
  test("orienta como en la foto: con la regla vertical, arriba sigue siendo arriba y sin espejo", () => {
    const c = calibrar([{ px: [100, 100], mm: 0 }, { px: [100, 700], mm: 300 }]);
    const a = c.aMm([100, 100]), abajo = c.aMm([100, 700]), derecha = c.aMm([400, 100]);
    expect(abajo[1]).toBeLessThan(a[1]); // lo que en la foto está abajo tiene y menor
    expect(Math.abs(abajo[0] - a[0])).toBeLessThan(1e-9);
    expect(derecha[0]).toBeGreaterThan(a[0]); // lo que está a la derecha sigue a la derecha
    const v = c.aPx(derecha);
    expect(Math.hypot(v[0] - 400, v[1] - 100)).toBeLessThan(1e-9);
  });

  test("sin escuadra avisa que no puede comprobar la inclinación hacia el costado", () => {
    expect(calibrar(regla).avisos).toContain("sin escuadra no se puede comprobar la inclinación hacia el costado de la regla");
  });

  test("detecta una foto inclinada: la escala cambia a lo largo de la regla", () => {
    const inclinada: MarcaDeRegla[] = [{ px: [100, 100], mm: 0 }, { px: [700, 100], mm: 300 }, { px: [1290, 100], mm: 600 }];
    expect(calibrar(inclinada).avisos.some((a) => a.includes("la foto está inclinada en esa dirección"))).toBe(true);
  });

  test("corrige la inclinación: una foto con perspectiva vuelve a medir bien en toda la regla", () => {
    // la misma regla vista con perspectiva: m = 0,5·t / (1 + 2e-5·t)
    const px = (mm: number) => mm / (0.5 - 2e-5 * mm);
    const marcas: MarcaDeRegla[] = [0, 150, 300, 450, 600].map((mm) => ({ px: [100, 100 + px(mm)], mm }));
    const c = calibrar(marcas);
    expect(c.avisos.some((a) => a.includes("se corrigió con las marcas"))).toBe(true);
    expect(c.residuoMaximo).toBeLessThan(1e-6);
    for (const mm of [75, 225, 525]) {
      const m = c.aMm([100, 100 + px(mm)]);
      const cero = c.aMm([100, 100 + px(0)]);
      expect(Math.abs(Math.hypot(m[0] - cero[0], m[1] - cero[1]) - mm)).toBeLessThan(1e-6);
      // aPx deshace aMm
      const vuelta = c.aPx(m);
      expect(Math.hypot(vuelta[0] - 100, vuelta[1] - (100 + px(mm)))).toBeLessThan(1e-6);
    }
  });

  test("detecta la inclinación hacia el costado con la escuadra", () => {
    const r: MarcaDeRegla[] = [{ px: [100, 1000], mm: 0 }, { px: [700, 1000], mm: 300 }];
    const e: MarcaDeRegla[] = [{ px: [80, 990], mm: 0 }, { px: [80, 402], mm: 300 }]; // 588 px contra 600: 2 %
    const c = calibrar(r, e);
    expect(c.anisotropia).toBeGreaterThan(0.005);
    expect(c.avisos.some((a) => a.includes("inclinada hacia el costado"))).toBe(true);
  });
});
