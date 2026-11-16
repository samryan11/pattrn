// Archivo ZIP sin compresión, escrito a mano: alcanza para empaquetar los PDF y el DXF
// de un molde, y evita una dependencia. Los nombres van en UTF-8.

export interface ArchivoZip {
  nombre: string;
  datos: Uint8Array;
}

const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const bytesDeTexto = (s: string) => new TextEncoder().encode(s);

/** Arma el ZIP. `fecha` queda como fecha de cada archivo. */
export function armarZip(archivos: ArchivoZip[], fecha = new Date()): Uint8Array {
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1);
  const dia = ((Math.max(1980, fecha.getFullYear()) - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  const vistos = new Set<string>();
  for (const a of archivos) {
    if (vistos.has(a.nombre)) throw new Error(`ZIP: nombre repetido ${a.nombre}`);
    vistos.add(a.nombre);
    const nombre = bytesDeTexto(a.nombre), crc = crc32(a.datos), n = a.datos.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, hora, true); local.setUint16(12, dia, true);
    local.setUint32(14, crc, true); local.setUint32(18, n, true); local.setUint32(22, n, true);
    local.setUint16(26, nombre.length, true); local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, a.datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, hora, true); c.setUint16(14, dia, true);
    c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true);
    c.setUint16(28, nombre.length, true); c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), nombre);
    pos += 30 + nombre.length + n;
  }
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, pos, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of todo) { out.set(x, o); o += x.length; }
  return out;
}
