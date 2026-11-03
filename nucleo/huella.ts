// Huella de un fragmento: sha256 de la serialización canónica (RFC 8785) de
// {hilo, vertices, bordes, marcas, escalado}, con números redondeados a 0,01.

import { redondear } from "./geometria";
import type { Fragmento } from "./tipos";

const CAMPOS = ["hilo", "vertices", "bordes", "marcas", "escalado"] as const;

/** Serialización canónica RFC 8785: claves ordenadas, sin espacios, números como en JavaScript. */
export function canonico(valor: unknown): string {
  if (valor === null || typeof valor === "boolean" || typeof valor === "string") return JSON.stringify(valor);
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new Error("número no finito en la huella");
    return JSON.stringify(redondear(valor));
  }
  if (Array.isArray(valor)) return "[" + valor.map(canonico).join(",") + "]";
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort()
      .map((k) => JSON.stringify(k) + ":" + canonico(o[k])).join(",") + "}";
  }
  throw new Error(`valor no serializable en la huella: ${typeof valor}`);
}

export async function huella(frag: Fragmento): Promise<string> {
  const nucleo: Record<string, unknown> = {};
  for (const c of CAMPOS) if (frag[c] !== undefined) nucleo[c] = frag[c];
  const datos = new TextEncoder().encode(canonico(nucleo));
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return "sha256:" + Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
