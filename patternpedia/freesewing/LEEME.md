# Semilla de Patternpedia: FreeSewing

Fragmentos convertidos de [FreeSewing](https://freesewing.eu), para que Patternpedia arranque con material.

- **Origen:** FreeSewing 4.10.2, licencia MIT. El aviso completo está en `LICENCIA-FreeSewing-MIT.txt` y viaja dentro de cada fragmento, en `origen.fuente` y en `linaje`.
- **Licencia de estos fragmentos:** CC BY-SA 4.0, como todo Patternpedia.
- **Cómo se generan:** `npx tsx herramientas/convertir-freesewing.ts [diseño…]`. No se editan a mano: se vuelven a generar.
- **Talles:** el talle base es `cisFemaleAdult36`, uno de los juegos de medidas de referencia de FreeSewing. Los otros 19 van como deltas en `escalado`.
- **Qué revisar:** `indice.json` lista los avisos de cada fragmento. Un borde `incierto` es uno que el conversor no supo nombrar o al que le asignó el margen.

Esta carpeta es provisoria: el archivo va a vivir separado del software.
