// Geometría base de PATTRN: puntos, tramos rectos y Bézier cúbicas.
// Todo en milímetros, con y hacia arriba. Los largos se calculan sobre la
// curva exacta, nunca sobre una polilínea.

export type Punto = readonly [number, number];

export interface Recta {
  tipo: "recta";
  p0: Punto;
  p1: Punto;
}

export interface Bezier {
  tipo: "bezier";
  p0: Punto;
  c1: Punto;
  c2: Punto;
  p1: Punto;
}

export type Tramo = Recta | Bezier;

export interface Transformacion {
  traslacion: Punto;
  rotacion_grados: number;
  espejo: boolean;
}

export const IDENTIDAD: Transformacion = { traslacion: [0, 0], rotacion_grados: 0, espejo: false };

export function distancia(a: Punto, b: Punto): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function mezclar(a: Punto, b: Punto, t: number): Punto {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function puntoEn(tr: Tramo, t: number): Punto {
  if (tr.tipo === "recta") return mezclar(tr.p0, tr.p1, t);
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [
    a * tr.p0[0] + b * tr.c1[0] + c * tr.c2[0] + d * tr.p1[0],
    a * tr.p0[1] + b * tr.c1[1] + c * tr.c2[1] + d * tr.p1[1],
  ];
}

export function derivadaEn(tr: Tramo, t: number): Punto {
  if (tr.tipo === "recta") return [tr.p1[0] - tr.p0[0], tr.p1[1] - tr.p0[1]];
  const u = 1 - t;
  const a = 3 * u * u, b = 6 * u * t, c = 3 * t * t;
  return [
    a * (tr.c1[0] - tr.p0[0]) + b * (tr.c2[0] - tr.c1[0]) + c * (tr.p1[0] - tr.c2[0]),
    a * (tr.c1[1] - tr.p0[1]) + b * (tr.c2[1] - tr.c1[1]) + c * (tr.p1[1] - tr.c2[1]),
  ];
}

// Gauss-Legendre de 8 puntos en [0, 1].
const GL_X = [
  0.0198550717512319, 0.1016667612931866, 0.2372337950418355, 0.4082826787521751,
  0.5917173212478249, 0.7627662049581645, 0.8983332387068134, 0.9801449282487681,
];
const GL_W = [
  0.0506142681451881, 0.1111905172266872, 0.1568533229389436, 0.1813418916891810,
  0.1813418916891810, 0.1568533229389436, 0.1111905172266872, 0.0506142681451881,
];

function largoEntre(tr: Bezier, t0: number, t1: number): number {
  let s = 0;
  for (let i = 0; i < 8; i++) {
    const d = derivadaEn(tr, t0 + (t1 - t0) * GL_X[i]);
    s += GL_W[i] * Math.hypot(d[0], d[1]);
  }
  return s * (t1 - t0);
}

function largoAdaptativo(tr: Bezier, t0: number, t1: number, entero: number, prof: number): number {
  const m = (t0 + t1) / 2;
  const izq = largoEntre(tr, t0, m), der = largoEntre(tr, m, t1);
  if (prof > 30 || Math.abs(izq + der - entero) < 1e-10) return izq + der;
  return largoAdaptativo(tr, t0, m, izq, prof + 1) + largoAdaptativo(tr, m, t1, der, prof + 1);
}

/** Largo del tramo entre los parámetros t0 y t1 (por defecto, entero). */
export function largo(tr: Tramo, t0 = 0, t1 = 1): number {
  if (tr.tipo === "recta") return distancia(tr.p0, tr.p1) * Math.abs(t1 - t0);
  return largoAdaptativo(tr, t0, t1, largoEntre(tr, t0, t1), 0);
}

/** Parámetro t en el que el largo recorrido desde el inicio es s. */
export function parametroEnLargo(tr: Tramo, s: number): number {
  const total = largo(tr);
  if (s <= 0) return 0;
  if (s >= total) return 1;
  if (tr.tipo === "recta") return s / total;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (largo(tr, 0, m) < s) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Divide el tramo en t sin perder nada: los dos tramos reproducen el original. */
export function dividir(tr: Tramo, t: number): [Tramo, Tramo] {
  if (tr.tipo === "recta") {
    const m = mezclar(tr.p0, tr.p1, t);
    return [{ tipo: "recta", p0: tr.p0, p1: m }, { tipo: "recta", p0: m, p1: tr.p1 }];
  }
  const a = mezclar(tr.p0, tr.c1, t), b = mezclar(tr.c1, tr.c2, t), c = mezclar(tr.c2, tr.p1, t);
  const d = mezclar(a, b, t), e = mezclar(b, c, t);
  const m = mezclar(d, e, t);
  return [
    { tipo: "bezier", p0: tr.p0, c1: a, c2: d, p1: m },
    { tipo: "bezier", p0: m, c1: e, c2: c, p1: tr.p1 },
  ];
}

export interface Cruce {
  /** Parámetro sobre el tramo. */
  t: number;
  /** Parámetro sobre el segmento de corte, de 0 a 1. */
  s: number;
  punto: Punto;
}

/** Cruces de un tramo con el segmento a→b. */
export function cruces(tr: Tramo, a: Punto, b: Punto): Cruce[] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  const n: Punto = [-dy / L, dx / L];
  const alto = (p: Punto) => (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1];
  const sobre = (p: Punto) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L);
  const resultado: Cruce[] = [];
  const agregar = (t: number) => {
    const p = puntoEn(tr, t);
    const s = sobre(p);
    if (s >= -1e-12 && s <= 1 + 1e-12 && !resultado.some((c) => Math.abs(c.t - t) < 1e-9)) {
      resultado.push({ t, s, punto: p });
    }
  };

  if (tr.tipo === "recta") {
    const h0 = alto(tr.p0), h1 = alto(tr.p1);
    if (h0 === h1) return [];
    const t = h0 / (h0 - h1);
    if (t >= 0 && t <= 1) agregar(t);
    return resultado;
  }

  // la altura sobre la recta de corte es un polinomio cúbico en t: se buscan sus raíces en [0, 1]
  const f = (t: number) => alto(puntoEn(tr, t));
  const N = 256;
  let t0 = 0, f0 = f(0);
  if (f0 === 0) agregar(0);
  for (let i = 1; i <= N; i++) {
    const t1 = i / N, f1 = f(t1);
    if (f1 === 0) agregar(t1);
    else if (f0 * f1 < 0) {
      let lo = t0, hi = t1, flo = f0;
      for (let k = 0; k < 200 && hi - lo > 1e-15; k++) {
        const m = (lo + hi) / 2, fm = f(m);
        if (fm === 0) { lo = hi = m; break; }
        if (flo * fm < 0) hi = m;
        else { lo = m; flo = fm; }
      }
      agregar((lo + hi) / 2);
    }
    t0 = t1;
    f0 = f1;
  }
  return resultado.sort((x, y) => x.t - y.t);
}

export function transformarPunto(p: Punto, tr: Transformacion): Punto {
  let x = tr.espejo ? -p[0] : p[0];
  let y = p[1];
  const a = (tr.rotacion_grados * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x + tr.traslacion[0], y + tr.traslacion[1]];
}

export function transformarTramo(t: Tramo, tr: Transformacion): Tramo {
  const f = (p: Punto) => transformarPunto(p, tr);
  return t.tipo === "recta"
    ? { tipo: "recta", p0: f(t.p0), p1: f(t.p1) }
    : { tipo: "bezier", p0: f(t.p0), c1: f(t.c1), c2: f(t.c2), p1: f(t.p1) };
}

/** Redondeo a 0,01 mm, como se guarda en el formato. */
export function redondear(x: number): number {
  const r = Math.round(x * 100) / 100;
  return r === 0 ? 0 : r;
}
