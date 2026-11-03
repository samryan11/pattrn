// Del píxel a la curva: separar el papel del fondo, seguir su borde con precisión de
// fracción de píxel, encontrar las esquinas y ajustar cada borde a una recta o una Bézier.

import { derivadaEn, distancia, interseccionRectas, largo, puntoEn, type Bezier, type Punto, type Recta, type Tramo } from "../geometria";

export interface Imagen {
  ancho: number;
  alto: number;
  /** RGBA, 4 bytes por píxel, por filas. */
  datos: Uint8ClampedArray;
}

/** Cuánto "papel" tiene un píxel: claro y poco saturado. El fondo (madera, mesa) da menos. */
function campoDePapel(img: Imagen): Float32Array {
  const f = new Float32Array(img.ancho * img.alto);
  for (let i = 0; i < f.length; i++) {
    const r = img.datos[4 * i], g = img.datos[4 * i + 1], b = img.datos[4 * i + 2];
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    const S = Math.max(r, g, b) - Math.min(r, g, b);
    f[i] = L - 1.5 * S;
  }
  return f;
}

function mediana(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Ancho de línea (en píxeles, a cada lado) que el relleno puede cruzar. */
const RADIO_DE_LAPIZ = 3;

/** Ventana cuadrada de radio r sobre una máscara: `todos` exige que estén todos; si no, alcanza con uno. */
function ventana(m: Uint8Array, W: number, H: number, r: number, todos: boolean): Uint8Array {
  const pasada = (entrada: Uint8Array, horizontal: boolean) => {
    const salida = new Uint8Array(W * H);
    const [largoLinea, lineas, paso, salto] = horizontal ? [W, H, 1, W] : [H, W, W, 1];
    for (let l = 0; l < lineas; l++) {
      const base = l * salto;
      let suma = 0;
      for (let i = 0; i <= Math.min(r, largoLinea - 1); i++) suma += entrada[base + i * paso];
      for (let i = 0; i < largoLinea; i++) {
        const lo = Math.max(0, i - r), hi = Math.min(largoLinea - 1, i + r);
        salida[base + i * paso] = todos ? (suma === hi - lo + 1 ? 1 : 0) : (suma > 0 ? 1 : 0);
        if (i + r + 1 < largoLinea) suma += entrada[base + (i + r + 1) * paso];
        if (i - r >= 0) suma -= entrada[base + (i - r) * paso];
      }
    }
    return salida;
  };
  return pasada(pasada(m, true), false);
}

/** Cierre morfológico: tapa líneas oscuras de hasta 2r píxeles sin mover los bordes rectos. */
function cerrar(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  return ventana(ventana(m, W, H, r, false), W, H, r, true);
}

export interface Segmentacion {
  /** 1 = pieza (con sus agujeros y marcas de lápiz rellenados). */
  mascara: Uint8Array;
  umbral: number;
  campo: Float32Array;
  /** Cuánto se distinguen papel y fondo: menos de ~40 es poco contraste. */
  contraste: number;
  /** true si la pieza toca el borde de la foto: quedó cortada. */
  tocaElBorde: boolean;
}

/** Separa la pieza que contiene `semilla` del fondo. */
export function segmentar(img: Imagen, semilla: Punto): Segmentacion {
  const { ancho: W, alto: H } = img;
  const campo = campoDePapel(img);
  const sx = Math.round(semilla[0]), sy = Math.round(semilla[1]);
  const papel: number[] = [], fondo: number[] = [];
  for (let y = sy - 7; y <= sy + 7; y++) for (let x = sx - 7; x <= sx + 7; x++) {
    if (x >= 0 && y >= 0 && x < W && y < H) papel.push(campo[y * W + x]);
  }
  const paso = Math.max(1, Math.floor((W + H) / 400));
  for (let x = 0; x < W; x += paso) { fondo.push(campo[x], campo[(H - 1) * W + x]); }
  for (let y = 0; y < H; y += paso) { fondo.push(campo[y * W], campo[y * W + W - 1]); }
  const fp = mediana(papel), ff = mediana(fondo);
  const umbral = (fp + ff) / 2;

  // las líneas de lápiz son paredes finas: se cierran antes de rellenar, o el relleno se queda
  // adentro de la línea de costura y se toma esa línea por el borde del papel
  const claro = new Uint8Array(W * H);
  for (let i = 0; i < claro.length; i++) if (campo[i] > umbral) claro[i] = 1;
  const papel_ = cerrar(claro, W, H, RADIO_DE_LAPIZ);

  // relleno desde la semilla: todo lo conectado que se parece al papel
  const mascara = new Uint8Array(W * H);
  const pila = [sy * W + sx];
  mascara[sy * W + sx] = 1;
  let tocaElBorde = false;
  while (pila.length) {
    const i = pila.pop()!;
    const x = i % W, y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) tocaElBorde = true;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || mascara[j]) continue;
      if ((j % W === 0 && i % W === W - 1) || (i % W === 0 && j % W === W - 1)) continue;
      if (papel_[j]) { mascara[j] = 1; pila.push(j); }
    }
  }
  // agujeros (perforaciones, letras, líneas de lápiz): lo que el fondo no alcanza es pieza
  const afuera = new Uint8Array(W * H);
  const cola: number[] = [];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (!mascara[y * W + x]) { afuera[y * W + x] = 1; cola.push(y * W + x); }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (!mascara[y * W + x] && !afuera[y * W + x]) { afuera[y * W + x] = 1; cola.push(y * W + x); }
  while (cola.length) {
    const i = cola.pop()!;
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= W * H || afuera[j] || mascara[j]) continue;
      afuera[j] = 1;
      cola.push(j);
    }
  }
  for (let i = 0; i < mascara.length; i++) if (!afuera[i]) mascara[i] = 1;
  return { mascara, umbral, campo, contraste: fp - ff, tocaElBorde };
}

function bilineal(campo: Float32Array, W: number, H: number, x: number, y: number): number {
  const x0 = Math.max(0, Math.min(W - 2, Math.floor(x))), y0 = Math.max(0, Math.min(H - 2, Math.floor(y)));
  const fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0));
  const a = campo[y0 * W + x0], b = campo[y0 * W + x0 + 1], c = campo[(y0 + 1) * W + x0], d = campo[(y0 + 1) * W + x0 + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/**
 * Borde de la pieza, en píxeles, en sentido antihorario visto desde arriba y con precisión de
 * fracción de píxel: se sigue el borde de la máscara y cada punto se corre, a lo largo de la
 * normal, hasta donde el campo cruza el umbral.
 */
export function seguirBorde(img: Imagen, seg: Segmentacion): Punto[] {
  const { ancho: W, alto: H } = img;
  const m = seg.mascara;
  const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;
  // primer píxel de la pieza, de arriba hacia abajo y de izquierda a derecha
  let inicio = -1;
  for (let i = 0; i < m.length && inicio < 0; i++) if (m[i]) inicio = i;
  if (inicio < 0) throw new Error("no se encontró la pieza");
  // seguimiento de Moore
  const vecinos: Punto[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const borde: Punto[] = [];
  let x = inicio % W, y = (inicio - x) / W, dirAnterior = 7;
  const x0 = x, y0 = y;
  for (let pasos = 0; pasos < 4 * (W + H) * 50; pasos++) {
    borde.push([x, y]);
    let encontrado = false;
    for (let k = 0; k < 8; k++) {
      const d = (dirAnterior + 6 + k) % 8;
      const nx = x + vecinos[d][0], ny = y + vecinos[d][1];
      if (dentro(nx, ny)) { x = nx; y = ny; dirAnterior = d; encontrado = true; break; }
    }
    if (!encontrado || (x === x0 && y === y0 && borde.length > 2)) break;
  }
  // corrección subpíxel a lo largo de la normal
  const n = borde.length, k = 3;
  const fino: Punto[] = [];
  for (let i = 0; i < n; i++) {
    const a = borde[(i - k + n) % n], b = borde[(i + k) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    // en la foto, con este recorrido, afuera queda a la izquierda del avance
    const nx = ty, ny = -tx;
    const [px, py] = borde[i];
    let mejor: Punto = [px, py];
    let anterior = bilineal(seg.campo, W, H, px - nx * 2.5, py - ny * 2.5);
    for (let s = -2.25; s <= 2.5; s += 0.25) {
      const actual = bilineal(seg.campo, W, H, px + nx * s, py + ny * s);
      if ((anterior - seg.umbral) * (actual - seg.umbral) <= 0 && anterior !== actual) {
        const f = (anterior - seg.umbral) / (anterior - actual);
        const sc = s - 0.25 + 0.25 * f;
        mejor = [px + nx * sc, py + ny * sc];
        break;
      }
      anterior = actual;
    }
    fino.push(mejor);
  }
  return fino;
}

// ---------------------------------------------------------------- esquinas y ajuste (en mm)

function giro(a: Punto, b: Punto, c: Punto): number {
  const ang = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
  return Math.atan2(Math.sin(ang), Math.cos(ang));
}

/** Remuestrea el contorno cerrado cada `paso` mm. */
function remuestrear(pts: Punto[], paso: number): Punto[] {
  const out: Punto[] = [pts[0]];
  let resto = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = distancia(a, b);
    let s = paso - resto;
    while (s <= L) {
      out.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L]);
      s += paso;
    }
    resto = L - (s - paso);
  }
  if (distancia(out[out.length - 1], out[0]) < paso / 2) out.pop();
  return out;
}

export interface OpcionesDeEsquinas {
  /** Giro mínimo para que haya esquina, en grados. */
  angulo?: number;
  /** Largo sobre el que se mide el giro, en mm. */
  alcance?: number;
}

/**
 * Índices de las esquinas del contorno (en mm, remuestreado cada 0,5 mm): donde el borde gira
 * más de `angulo` grados en `alcance` mm de cada lado.
 */
export function esquinas(pts: Punto[], { angulo = 28, alcance = 6 }: OpcionesDeEsquinas = {}): number[] {
  const n = pts.length;
  const k = Math.max(2, Math.round(alcance / 0.5));
  const g = pts.map((_, i) => Math.abs(giro(pts[(i - k + n) % n], pts[i], pts[(i + k) % n])));
  const lim = (angulo * Math.PI) / 180;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (g[i] < lim) continue;
    let esMax = true;
    for (let j = -k; j <= k && esMax; j++) if (j !== 0 && g[(i + j + n) % n] > g[i]) esMax = false;
    if (esMax && !out.some((o) => Math.min(Math.abs(o - i), n - Math.abs(o - i)) < k)) out.push(i);
  }
  return out.sort((a, b) => a - b);
}

function distanciaASegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Máxima distancia de los puntos al tramo: a la línea, no a puntos sueltos sobre ella. */
export function desvioMaximo(t: Tramo, pts: Punto[]): number {
  const linea = t.tipo === "recta" ? [t.p0, t.p1] : Array.from({ length: 101 }, (_, i) => puntoEn(t, i / 100));
  let max = 0;
  for (const p of pts) {
    let min = Infinity;
    for (let i = 0; i < linea.length - 1; i++) min = Math.min(min, distanciaASegmento(p, linea[i], linea[i + 1]));
    if (min > max) max = min;
  }
  return max;
}

/**
 * La Bézier cúbica que mejor sigue los puntos, con los extremos fijos: los dos puntos de control
 * salen por mínimos cuadrados, y los parámetros se reajustan por el método de Newton.
 */
export function ajustarCurva(pts: Punto[]): Bezier {
  const p0 = pts[0], p3 = pts[pts.length - 1];
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + distancia(pts[i - 1], pts[i]));
  const total = u[u.length - 1];
  for (let i = 0; i < u.length; i++) u[i] /= total;
  let mejor: Bezier = { tipo: "bezier", p0, c1: p0, c2: p3, p1: p3 };
  for (let iter = 0; iter < 12; iter++) {
    let a11 = 0, a12 = 0, a22 = 0, bx1 = 0, bx2 = 0, by1 = 0, by2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const t = u[i], s = 1 - t;
      const b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
      const rx = pts[i][0] - b0 * p0[0] - b3 * p3[0], ry = pts[i][1] - b0 * p0[1] - b3 * p3[1];
      a11 += b1 * b1; a12 += b1 * b2; a22 += b2 * b2;
      bx1 += b1 * rx; bx2 += b2 * rx; by1 += b1 * ry; by2 += b2 * ry;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-12) break;
    mejor = {
      tipo: "bezier", p0,
      c1: [(bx1 * a22 - bx2 * a12) / det, (by1 * a22 - by2 * a12) / det],
      c2: [(a11 * bx2 - a12 * bx1) / det, (a11 * by2 - a12 * by1) / det],
      p1: p3,
    };
    for (let i = 1; i < pts.length - 1; i++) {
      const t = u[i], s = 1 - t;
      const q = puntoEn(mejor, t), d1 = derivadaEn(mejor, t);
      const d2: Punto = [
        6 * (s * (mejor.c2[0] - 2 * mejor.c1[0] + p0[0]) + t * (p3[0] - 2 * mejor.c2[0] + mejor.c1[0])),
        6 * (s * (mejor.c2[1] - 2 * mejor.c1[1] + p0[1]) + t * (p3[1] - 2 * mejor.c2[1] + mejor.c1[1])),
      ];
      const ex = q[0] - pts[i][0], ey = q[1] - pts[i][1];
      const den = d1[0] * d1[0] + d1[1] * d1[1] + ex * d2[0] + ey * d2[1];
      if (den !== 0) u[i] = Math.min(1, Math.max(0, t - (ex * d1[0] + ey * d1[1]) / den));
    }
  }
  return mejor;
}

/**
 * Ajusta un tramo de contorno (de esquina a esquina) a una recta si entra en la tolerancia, o
 * a una o más Bézier. Devuelve los tramos y el mayor desvío del ajuste.
 */
export function ajustarBorde(pts: Punto[], tolerancia: number, partidas = 0): { tramos: Tramo[]; desvio: number } {
  const recta: Recta = { tipo: "recta", p0: pts[0], p1: pts[pts.length - 1] };
  const dRecta = desvioMaximo(recta, pts);
  if (dRecta <= tolerancia || pts.length < 6) return { tramos: [recta], desvio: dRecta };
  const bz = ajustarCurva(pts);
  const d = desvioMaximo(bz, pts);
  // el papel cortado a mano tiene el borde ondulado: partir copiaría cada imperfección. Por defecto
  // queda una curva por borde y se informa el desvío: si es grande, lo que falta es una esquina.
  if (d <= tolerancia || pts.length < 20 || partidas === 0) return { tramos: [bz], desvio: d };
  const medio = Math.floor(pts.length / 2);
  const a = ajustarBorde(pts.slice(0, medio + 1), tolerancia, partidas - 1);
  const b = ajustarBorde(pts.slice(medio), tolerancia, partidas - 1);
  return { tramos: [...a.tramos, ...b.tramos], desvio: Math.max(a.desvio, b.desvio) };
}

/** Puntos del contorno (cada 0,5 mm) que se descartan junto a una esquina: 2 mm. */
const RECORTE_DE_ESQUINA = 4;

/** Recta (punto y dirección) que mejor pasa por los puntos. */
function rectaPor(pts: Punto[]): { p: Punto; d: Punto } {
  const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const q of pts) { sxx += (q[0] - cx) ** 2; sxy += (q[0] - cx) * (q[1] - cy); syy += (q[1] - cy) ** 2; }
  const a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { p: [cx, cy], d: [Math.cos(a), Math.sin(a)] };
}

/** Intersección de los dos bordes que llegan a la esquina i, medidos entre 2 y 8 mm de ella. */
function esquinaReal(pts: Punto[], i: number): Punto {
  const n = pts.length;
  const lado = (signo: number) => Array.from({ length: 12 }, (_, k) => pts[(i + signo * (k + RECORTE_DE_ESQUINA + 1) + n * 2) % n]);
  const a = rectaPor(lado(-1)), b = rectaPor(lado(1));
  const x = interseccionRectas(a.p, [a.p[0] + a.d[0], a.p[1] + a.d[1]], b.p, [b.p[0] + b.d[0], b.p[1] + b.d[1]]);
  // en una punta muy aguda la intersección se escapa: ahí vale el punto detectado
  return x && distancia(x, pts[i]) < 4 ? x : pts[i];
}

export interface BordeDetectado {
  tramos: Tramo[];
  desvio: number;
  largo: number;
}

/**
 * Del contorno en mm (cerrado, antihorario) a los bordes: remuestreo, esquinas y ajuste.
 * `esquinasExtra` son puntos (en mm) donde la persona marcó una esquina que no se detectó.
 */
export function bordesDesdeContorno(
  contornoMm: Punto[], tolerancia = 0.5, opciones: OpcionesDeEsquinas = {}, esquinasExtra: Punto[] = [], sacar: Punto[] = [],
): { puntos: Punto[]; esquinas: number[]; bordes: BordeDetectado[] } {
  const puntos = remuestrear(contornoMm, 0.5);
  const cercano = (p: Punto) => puntos.reduce((m, q, i) => (distancia(q, p) < distancia(puntos[m], p) ? i : m), 0);
  let idx = esquinas(puntos, opciones).filter((i) => !sacar.some((s) => distancia(s, puntos[i]) < 5));
  idx = [...new Set([...idx, ...esquinasExtra.map(cercano)])].sort((a, b) => a - b);
  if (idx.length < 2) throw new Error("se encontraron menos de dos esquinas: marcá las esquinas a mano");

  // la foto redondea las esquinas: la esquina real es donde se cortan los dos bordes vecinos
  const n = puntos.length;
  const reales = idx.map((i) => esquinaReal(puntos, i));
  const bordes: BordeDetectado[] = [];
  for (let e = 0; e < idx.length; e++) {
    const i = idx[e], j = idx[(e + 1) % idx.length];
    const cantidad = (j - i + n) % n || n;
    // sin los puntos redondeados junto a cada esquina, y con las esquinas reales en las puntas
    const recorte = Math.min(RECORTE_DE_ESQUINA, Math.floor((cantidad - 1) / 3));
    const medio = Array.from({ length: Math.max(0, cantidad - 2 * recorte - 1) }, (_, k) => puntos[(i + recorte + 1 + k) % n]);
    const tramo = [reales[e], ...medio, reales[(e + 1) % idx.length]];
    const { tramos, desvio } = ajustarBorde(tramo, tolerancia);
    // las esquinas quedan exactamente donde se detectaron: los tramos encadenan sin huecos
    bordes.push({ tramos, desvio, largo: tramos.reduce((s, t) => s + largo(t), 0) });
  }
  return { puntos, esquinas: idx, bordes };
}
