// Análisis de un molde: resuelve instancias y mide las fusiones.

import { largo, distancia, puntoEn, type Tramo } from "./geometria";
import { borde, tramoDeBorde } from "./fragmento";
import type { Fragmento, Fusion, Molde } from "./tipos";

/** Devuelve el fragmento de una referencia id@version, verificando su huella. */
export type Resolver = (ref: string, huella: string) => Fragmento;

export interface AnalisisFusion {
  fusion: Fusion;
  largoA: number;
  largoB: number;
  /** largoB − largoA, en mm. */
  diferencia: number;
  /** Qué borde sobra ("a", "b" o ninguno si miden lo mismo a 0,01 mm). */
  sobra: "a" | "b" | null;
  /** Separación entre los bordes en el punto de alineación, en mm. */
  separacion: number | null;
  tramoA: Tramo;
  tramoB: Tramo;
}

export function analizarFusiones(molde: Molde, resolver: Resolver): AnalisisFusion[] {
  const out: AnalisisFusion[] = [];
  for (const pieza of molde.piezas) {
    const inst = new Map(pieza.instancias.map((i) => [i.id, { i, frag: resolver(i.ref, i.huella) }]));
    const tramo = (ref: string) => {
      const [instId, bordeId] = ref.split("#");
      const x = inst.get(instId);
      if (!x) throw new Error(`${molde.id}: no existe la instancia ${instId}`);
      return tramoDeBorde(x.frag, borde(x.frag, bordeId), x.i.transformacion);
    };
    for (const fusion of pieza.fusiones ?? []) {
      const tramoA = tramo(fusion.a), tramoB = tramo(fusion.b);
      const largoA = largo(tramoA), largoB = largo(tramoB);
      const diferencia = largoB - largoA;
      // los contornos son antihorarios: a y b se recorren en sentidos opuestos
      const separacion =
        fusion.alineacion === "inicio" ? distancia(puntoEn(tramoA, 0), puntoEn(tramoB, 1))
        : fusion.alineacion === "fin" ? distancia(puntoEn(tramoA, 1), puntoEn(tramoB, 0))
        : null;
      const sobra = Math.abs(diferencia) < 0.005 ? null : diferencia > 0 ? "b" : "a";
      out.push({ fusion, largoA, largoB, diferencia, sobra, separacion, tramoA, tramoB });
    }
  }
  return out;
}
