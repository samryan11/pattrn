// Calibración de una foto con regla (y, si está, escuadra cruzada).
//
// Con una sola regla se mide la escala a lo largo de ella, y con tres marcas o más se
// detecta si la foto está inclinada en esa dirección. Lo que no se puede ver con una regla
// sola es la inclinación hacia el costado: para eso está la escuadra. Si no hay escuadra,
// se supone la misma escala en las dos direcciones y el error estimado lo dice.

import type { Punto } from "../geometria";

export interface MarcaDeRegla {
  /** Dónde se marcó, en píxeles de la foto (y hacia abajo). */
  px: Punto;
  /** Qué valor de la regla es, en mm. */
  mm: number;
}

export interface Calibracion {
  /** px → mm, con y hacia arriba. */
  aMm: (p: Punto) => Punto;
  /** mm → px: para dibujar sobre la foto. */
  aPx: (p: Punto) => Punto;
  /** mm por píxel a lo largo de la regla y en la dirección perpendicular. */
  escalaRegla: number;
  escalaCruzada: number;
  /** Diferencia relativa entre las dos escalas (0 si no hay escuadra). */
  anisotropia: number;
  conEscuadra: boolean;
  /** Largo de regla usado, en mm. */
  largoReferencia: number;
  /** Mayor diferencia entre una marca y la recta de calibración, en mm. */
  residuoMaximo: number;
  /** Error estimado para una pieza del tamaño dado, en mm. */
  errorPara: (largoPieza_mm: number) => number;
  avisos: string[];
}

/** Error de marcar un punto en la foto, en píxeles. */
const ERROR_DE_MARCA_PX = 1.5;

/** A partir de esta variación se corrige la inclinación: por debajo es del orden del error de marcar. */
const VARIACION_CORREGIBLE = 0.003;

interface Ajuste {
  centro: Punto;
  dir: Punto; // unitario, en píxeles
  /** Valor de la regla a t píxeles del centro: (a + b·t) / (1 + c·t). Con c = 0 es una recta. */
  a: number;
  b: number;
  c: number;
  /** mm por px en el centro de las marcas. */
  escala: number;
  residuos: number[];
  /** Escala de la primera mitad contra la segunda (solo con 3 marcas o más). */
  variacion: number | null;
  corregida: boolean;
}

/** Resuelve un sistema lineal por eliminación de Gauss; null si es singular. */
function resolver(A: number[][], y: number[]): number[] | null {
  const n = y.length;
  const m = A.map((f, i) => [...f, y[i]]);
  for (let k = 0; k < n; k++) {
    let piv = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[piv][k])) piv = i;
    if (Math.abs(m[piv][k]) < 1e-12) return null;
    [m[k], m[piv]] = [m[piv], m[k]];
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = m[i][k] / m[k][k];
      for (let j = k; j <= n; j++) m[i][j] -= f * m[k][j];
    }
  }
  return m.map((f, i) => f[n] / f[i]);
}

function ajustarRegla(marcas: MarcaDeRegla[]): Ajuste {
  if (marcas.length < 2) throw new Error("hacen falta al menos dos marcas en la regla");
  const n = marcas.length;
  const cx = marcas.reduce((s, m) => s + m.px[0], 0) / n, cy = marcas.reduce((s, m) => s + m.px[1], 0) / n;
  // dirección principal de los puntos marcados
  let sxx = 0, sxy = 0, syy = 0;
  for (const m of marcas) {
    const dx = m.px[0] - cx, dy = m.px[1] - cy;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let dir: Punto = [Math.cos(ang), Math.sin(ang)];
  // que la dirección vaya hacia los valores crecientes de la regla
  const orden = [...marcas].sort((p, q) => p.mm - q.mm);
  const t = (p: Punto) => (p[0] - cx) * dir[0] + (p[1] - cy) * dir[1];
  if (t(orden[n - 1].px) < t(orden[0].px)) dir = [-dir[0], -dir[1]];
  // regresión mm = a + b·t
  const ts = marcas.map((m) => t(m.px)), ms = marcas.map((m) => m.mm);
  const mt = ts.reduce((s, x) => s + x, 0) / n, mm = ms.reduce((s, x) => s + x, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (ts[i] - mt) * (ms[i] - mm); den += (ts[i] - mt) ** 2; }
  let b = num / den, a = mm - b * mt, c = 0;
  let variacion: number | null = null;
  if (n >= 3) {
    const [p0, pm, p1] = [orden[0], orden[Math.floor((n - 1) / 2)], orden[n - 1]];
    const e1 = (pm.mm - p0.mm) / (t(pm.px) - t(p0.px)), e2 = (p1.mm - pm.mm) / (t(p1.px) - t(pm.px));
    if (Number.isFinite(e1) && Number.isFinite(e2)) variacion = Math.abs(e2 / e1 - 1);
  }
  // foto inclinada a lo largo de la regla: la escala cambia de forma proyectiva. m(1 + c·t) = a + b·t
  // es lineal en a, b y c. Se escala a miles para que el sistema esté bien condicionado.
  let corregida = false;
  if (variacion !== null && variacion > VARIACION_CORREGIBLE) {
    const K = 1000;
    const filas = ts.map((x, i) => [1, x / K, (-x / K) * (ms[i] / K)]);
    const A = [0, 1, 2].map((f) => [0, 1, 2].map((g) => filas.reduce((s, r) => s + r[f] * r[g], 0)));
    const y = [0, 1, 2].map((f) => filas.reduce((s, r, i) => s + r[f] * (ms[i] / K), 0));
    const x = resolver(A, y);
    if (x) { a = x[0] * K; b = x[1]; c = x[2] / K; corregida = true; }
  }
  const residuos = marcas.map((m, i) => ms[i] - (a + b * ts[i]) / (1 + c * ts[i]));
  return { centro: [cx, cy], dir, a, b, c, escala: b - a * c, residuos, variacion, corregida };
}

/**
 * Calibra con las marcas de la regla y, opcionalmente, de la escuadra. Las coordenadas que
 * devuelve `aMm` tienen el 0 de la regla en el origen, y hacia arriba de la foto: la regla queda
 * sobre el eje más cercano al que tenía en la imagen.
 */
export function calibrar(regla: MarcaDeRegla[], escuadra?: MarcaDeRegla[]): Calibracion {
  const r = ajustarRegla(regla);
  const avisos: string[] = [];
  let escalaCruzada = r.escala, anisotropia = 0;
  if (escuadra && escuadra.length >= 2) {
    const e = ajustarRegla(escuadra);
    const coseno = Math.abs(e.dir[0] * r.dir[0] + e.dir[1] * r.dir[1]);
    if (coseno > 0.26) avisos.push("la escuadra no está cruzada con la regla: se usa solo para comprobar la escala");
    else {
      escalaCruzada = e.escala;
      anisotropia = Math.abs(e.escala / r.escala - 1);
    }
  }
  if (r.corregida) {
    avisos.push(`la escala cambia ${(r.variacion! * 100).toFixed(1).replace(".", ",")} % a lo largo de la regla: la foto está inclinada en esa dirección; se corrigió con las marcas`);
  }
  if (anisotropia > 0.005) {
    avisos.push(`la regla y la escuadra no dan la misma escala (${(anisotropia * 100).toFixed(1).replace(".", ",")} %): la foto está inclinada hacia el costado`);
  }
  if (!escuadra || escuadra.length < 2) {
    avisos.push("sin escuadra no se puede comprobar la inclinación hacia el costado de la regla");
  }

  // x a lo largo de la regla, y a 90° antihorario visto desde arriba. En la foto y crece hacia
  // abajo, así que esa perpendicular es (u1, −u0): sin esto la pieza saldría en espejo.
  const u = r.dir;
  const v: Punto = [u[1], -u[0]];
  // la pieza queda orientada como en la foto: se gira de a 90°, según hacia dónde va la regla
  const cuartos = Math.round(Math.atan2(-u[1], u[0]) / (Math.PI / 2));
  const coseno = Math.round(Math.cos((cuartos * Math.PI) / 2)), seno = Math.round(Math.sin((cuartos * Math.PI) / 2));
  const aMm = (p: Punto): Punto => {
    const dx = p[0] - r.centro[0], dy = p[1] - r.centro[1];
    const t = dx * u[0] + dy * u[1], s = dx * v[0] + dy * v[1];
    const w = 1 + r.c * t;
    const X = (r.a + r.b * t) / w, Y = (s * escalaCruzada) / w;
    return [X * coseno - Y * seno, X * seno + Y * coseno];
  };
  const aPx = (p: Punto): Punto => {
    const X = p[0] * coseno + p[1] * seno, Y = -p[0] * seno + p[1] * coseno;
    const t = (X - r.a) / (r.b - r.c * X);
    const s = (Y * (1 + r.c * t)) / escalaCruzada;
    return [r.centro[0] + t * u[0] + s * v[0], r.centro[1] + t * u[1] + s * v[1]];
  };
  const residuoMaximo = Math.max(...r.residuos.map(Math.abs));
  const largoReferencia = Math.max(...regla.map((m) => m.mm)) - Math.min(...regla.map((m) => m.mm));
  const errorPara = (largoPieza: number) => {
    const marca = ERROR_DE_MARCA_PX * r.escala * Math.SQRT2 * (largoPieza / largoReferencia) + ERROR_DE_MARCA_PX * r.escala;
    const inclinacion = (escuadra && escuadra.length >= 2 ? anisotropia : 0.005) * largoPieza;
    // si se corrigió ya no suma; si no llegó al umbral, puede quedar hasta ese tanto
    const perspectiva = r.corregida ? 0 : ((r.variacion ?? 0) * largoPieza) / 2;
    return Math.round((marca + residuoMaximo + inclinacion + perspectiva) * 100) / 100;
  };
  return {
    aMm, aPx, escalaRegla: r.escala, escalaCruzada, anisotropia, conEscuadra: !!escuadra && escuadra.length >= 2,
    largoReferencia, residuoMaximo, errorPara, avisos,
  };
}
