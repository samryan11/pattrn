// Convertir una fusión entre telas distintas en costura. Es una propuesta: devuelve el molde
// y los fragmentos nuevos que resultarían, sin aplicarlos. Quien la acepta los guarda.

import { nuevaVersion } from "./fragmento";
import { fusionesEntreTelas } from "./resolucion";
import type { Resolver } from "./molde";
import type { Costura, Fragmento, Instancia, Molde, Pieza } from "./tipos";
import { cm } from "./unidades";

export interface PropuestaDeCostura {
  molde: Molde;
  /** Versiones nuevas de los fragmentos cuyo borde pasa de unión a costura. */
  fragmentos: Fragmento[];
  /** Lo que cambia, en palabras, para mostrarlo antes de aceptar. */
  cambios: string[];
}

/**
 * Propone convertir en costura la fusión entre telas de la pieza:
 * - los dos bordes de unión pasan a costura con `margen_mm` (versión nueva de cada fragmento)
 * - la pieza se separa en una pieza por tela
 * - nace una costura entre esos dos bordes, con la alineación que tenía la fusión
 */
export async function proponerCostura(
  molde: Molde, resolver: Resolver, piezaId: string, margen_mm: number, fecha: string,
): Promise<PropuestaDeCostura> {
  const entre = fusionesEntreTelas(molde).find((x) => x.pieza === piezaId);
  if (!entre) throw new Error(`${piezaId}: no tiene una fusión entre telas distintas`);
  const copia: Molde = structuredClone(molde);
  const pieza = copia.piezas.find((p) => p.id === piezaId)!;
  const fusion = pieza.fusiones![entre.indice];
  const cambios: string[] = [];

  // versión nueva de cada fragmento: el borde de unión pasa a costura
  const fragmentos: Fragmento[] = [];
  for (const ref of [fusion.a, fusion.b]) {
    const [instId, bordeId] = ref.split("#");
    const inst = pieza.instancias.find((i) => i.id === instId)!;
    const frag = resolver(inst.ref, inst.huella);
    const nueva = await nuevaVersion(frag, (f) => {
      const b = f.bordes.find((x) => x.id === bordeId)!;
      b.tipo = "costura";
      b.margen_mm = margen_mm;
    }, fecha);
    inst.ref = `${nueva.id}@${nueva.version}`;
    inst.huella = nueva.huella;
    fragmentos.push(nueva);
    const etiqueta = frag.bordes.find((x) => x.id === bordeId)!.etiqueta;
    cambios.push(`${ref} (${etiqueta}) pasa de unión a costura con margen ${cm(margen_mm)}: versión ${nueva.version} de ${nueva.id}`);
  }

  // una pieza por tela, en el orden en que aparecen
  const restantes = (pieza.fusiones ?? []).filter((_, i) => i !== entre.indice);
  const telas = [...new Set(pieza.instancias.map((i) => i.tela))];
  const nuevas: Pieza[] = telas.map((tela) => {
    const instancias: Instancia[] = pieza.instancias.filter((i) => i.tela === tela);
    const ids = new Set(instancias.map((i) => i.id));
    const fusiones = restantes.filter((f) => ids.has(f.a.split("#")[0]) && ids.has(f.b.split("#")[0]));
    const descripcion = copia.telas.find((t) => t.id === tela)?.descripcion ?? tela;
    const nueva: Pieza = { id: `${pieza.id}_${tela}`, nombre: `${pieza.nombre} · ${descripcion}`, cortes: pieza.cortes, instancias };
    if (fusiones.length) nueva.fusiones = fusiones;
    return nueva;
  });
  copia.piezas.splice(copia.piezas.indexOf(pieza), 1, ...nuevas);
  cambios.push(`la pieza ${pieza.id} se separa en ${nuevas.map((p) => p.id).join(" y ")}, una por tela`);

  const piezaDe = (ref: string) => nuevas.find((p) => p.instancias.some((i) => i.id === ref.split("#")[0]))!.id;
  const costura: Costura = {
    id: `${fusion.a.split("#")[0]}_${fusion.b.split("#")[0]}`,
    a: { pieza: piezaDe(fusion.a), bordes: [fusion.a] },
    b: { pieza: piezaDe(fusion.b), bordes: [fusion.b] },
    embebido_mm: 0,
    alineacion: fusion.alineacion,
  };
  copia.costuras = [...(copia.costuras ?? []), costura];
  cambios.push(`nace la costura ${costura.id} entre ${fusion.a} y ${fusion.b}`);

  return { molde: copia, fragmentos, cambios };
}
