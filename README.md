# PATTRN

Software libre de moldería para upcycling.

PATTRN traduce un diseño a molde. Está hecho para piezas únicas que se arman combinando fragmentos de otros moldes y de prendas donantes. No compite con el CAD industrial y no tiene fines comerciales.

La unidad del sistema es el **fragmento**: un polígono de molde con sus bordes etiquetados (escote, sisa, lateral…) y tipados (costura, doblez, unión, terminado). El software combina fragmentos de orígenes distintos, resuelve la unión entre ellos y verifica que los largos de costura coincidan. El resultado es un molde completo y preciso.

Cada fragmento y cada molde se pueden publicar en **PATTERNPEDIA**, un archivo abierto de moldes. Cada corte que se hace produce material que cualquiera puede reutilizar.

## Estado

Formato de datos v0.1 en borrador. Todavía no hay aplicación.

- [Especificación del formato](especificacion/formato-v0.1.md)
- [JSON Schema del fragmento](esquemas/fragmento.schema.json)
- [JSON Schema del molde](esquemas/molde.schema.json)
- [Ejemplos](esquemas/ejemplos/)

## Licencias

- **Código:** GNU General Public License v3.0. Ver [LICENSE](LICENSE).
- **Moldes y fragmentos de PATTERNPEDIA:** [Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/deed.es).

  Cada fragmento lleva dentro su cadena de atribución (`linaje`), así que se puede publicar solo y seguir cumpliendo la licencia.
