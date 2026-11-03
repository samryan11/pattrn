# Fuentes candidatas para poblar PATTERNPEDIA

Estado: nota para el futuro. **No se importa nada todavía.**
Licencias revisadas el 2026-11-03 en la fuente original de cada una.

## Regla

Una fuente entra a PATTERNPEDIA solo si su licencia permite publicar adaptaciones bajo **CC BY-SA 4.0**. Si no, queda afuera.

- **Compatibles:** dominio público, CC0, CC BY 4.0 y licencias permisivas como MIT, cumpliendo la atribución y conservando el aviso.
- **No compatibles:** licencias "no comercial" (NC), "sin derivadas" (ND), licencias de investigación con restricciones, o material sin licencia declarada.

Cada fragmento convertido lleva su atribución en `linaje` y la fuente original en `origen`.

## Resumen

| Fuente | Licencia verificada | ¿Importable? |
|---|---|---|
| GarmentCodeData v2 | CC BY 4.0 (datos) · MIT (código) | **Sí**, con atribución |
| GCD-MM / AIpparel | `license: mit` en el repositorio, sin aclarar si cubre los datos; GCD-MM-V1 sin licencia | **No por ahora**: hay que confirmarla con los autores |
| FreeSewing | MIT (código y diseños) | **Sí**, conservando el aviso MIT |
| Moldes históricos | depende de cada obra | **Caso por caso** |

## 1. GarmentCodeData (ETH Zurich)

**Qué es:** más de 120.000 moldes generados de forma paramétrica, cada uno con su prenda simulada en 3D.

**Licencia:**
- Los **datos (v2)** están bajo **Creative Commons Atribución 4.0 Internacional**, según el campo *Rights / License* del registro oficial en la ETH Research Collection ([DOI 10.3929/ethz-b-000690432](https://doi.org/10.3929/ethz-b-000690432)).
- El **código** (GarmentCode) está bajo **MIT**, © 2024 Maria Korosteleva ([LICENSE](https://github.com/maria-korosteleva/GarmentCode/blob/main/LICENSE)).
- **CC BY permite publicar adaptaciones bajo CC BY-SA**, siempre que se atribuya a la fuente, se enlace la licencia y se indiquen los cambios.
- Solo se verificó la **v2**. El registro de la v1 no cargó, así que no se usa hasta verificarlo.

**Qué tiene y qué le falta:** su JSON tiene paneles, bordes con curvatura y costuras. Le faltan etiquetas semánticas, tipos de borde, piquetes, margen e hilo.

**Conversor (a escribir):**

| Dato de GarmentCodeData | En PATTRN | Cómo |
|---|---|---|
| Panel | Fragmento | Uno por panel. `origen` registra la fuente, el id del molde, la versión y la licencia |
| Borde recto | Borde recto | Directo, de cm a mm |
| Borde con curvatura | Bézier cúbica | Si la curva original no es una cúbica (por ejemplo, un arco), se aproxima y se registra la tolerancia de ajuste |
| Costura entre paneles | Costura en el molde; `tipo: costura` en los dos bordes | Directo |
| Borde sin costura | Ver la brecha **a** | — |
| Nombre del panel (front, back, sleeve…) | `etiqueta` de los bordes | Se deduce por posición cuando el nombre lo permite. Si no, `otro` con descripción y **borde incierto** |
| Hilo | Eje vertical del panel | Los paneles están diseñados verticales, pero es una suposición: ver la brecha **b** |
| Piquetes | — | No hay. Quedan vacíos; no se inventan |
| Margen | Margen por defecto | Se asigna el del proyecto y se anota que lo asignó el conversor |
| Prenda 3D | — | Se ignora: el 3D está fuera de alcance |

**Advertencia de volumen:** son variaciones paramétricas de pocas tipologías. Importar los 120.000 llenaría el archivo de casi duplicados y lo volvería inútil para buscar. Conviene una selección curada.

## 2. GCD-MM / AIpparel (Hugging Face)

**Qué es:** los moldes de GarmentCodeData anotados con texto (descripciones, palabras clave, instrucciones de edición) para entrenar AIpparel. Es el material que podría entrenar o evaluar la sugerencia asistida de fragmentos.

**Licencia:**
- El repositorio [georgeNakayama/AIpparel](https://huggingface.co/georgeNakayama/AIpparel) declara `license: mit` en sus metadatos. Contiene `gcd-mm.parquet`, las anotaciones comprimidas y los pesos del modelo.
- La ficha **no dice si esa licencia cubre las anotaciones** o solo el repositorio.
- Los moldes son de GarmentCodeData, así que siguen bajo **CC BY 4.0** aunque las anotaciones fueran MIT.
- El repositorio [GCD-MM/GCD-MM-V1](https://huggingface.co/datasets/GCD-MM/GCD-MM-V1) (272 GB) **no tiene ficha ni licencia**.

**Estado: no importable hasta confirmar.** Primero hay que pedir a los autores que confirmen por escrito la licencia de las anotaciones.

**Uso previsto:** entrenar o evaluar la sugerencia de fragmentos, no publicar sus moldes en PATTERNPEDIA. Para los moldes alcanza GarmentCodeData. Los pesos de AIpparel no se usan: se basan en LLaVA 1.5, que tiene su propia licencia.

## 3. FreeSewing

**Qué es:** diseños de moldería hechos por personas, escritos en JavaScript, que generan el molde a la medida de quien lo usa. Son pocos comparados con GarmentCodeData, pero están verificados en prendas reales.

**Licencia:**
- **MIT**, © 2022 Joost De Cock ([LICENSE](https://github.com/freesewing/freesewing/blob/develop/LICENSE)). El proyecto se mudó a [Codeberg](https://codeberg.org/freesewing/freesewing).
- En su foro, FreeSewing dice que todos sus diseños se publican bajo MIT ([foro](https://forum.freesewing.eu/t/pattern-contributions/107)). Su FAQ permite el uso comercial ([FAQ](https://freesewing.eu/docs/about/faq/commercial-use/)).
- **MIT permite incorporar el material en una obra bajo CC BY-SA**, conservando el aviso de copyright y de licencia. El aviso viaja en `linaje`.
- Antes de importar un diseño hay que **verificar su licencia uno por uno**: los diseños aportados por la comunidad podrían declarar otra.

**Conversor (a escribir):** es la fuente más rica en información de moldería.

| Dato de FreeSewing | En PATTRN |
|---|---|
| Parte (*part*) | Fragmento |
| Trazos | Bézier cúbicas, el mismo modelo que PATTRN: conversión exacta |
| Línea de hilo (*grainline*) | `hilo` con `fuente: marcado_en_original` |
| Piquetes (*notch*) | `piquetes`, con su posición medida sobre el borde |
| Al doblez (*cutonfold*) | `tipo: doblez` |
| Margen (*sa*) | `margen_mm` |
| Medidas de entrada | Futura fuente para `escalado`: el diseño se genera en varios talles y la diferencia da los deltas |
| Nombres de trazos | `etiqueta` cuando el nombre lo dice. Si no, `otro` e incierto |

Para obtener la geometría hay que ejecutar el diseño con un juego de medidas de referencia y leer sus partes. Es JavaScript, así que el conversor corre con el mismo stack de PATTRN.

## 4. Moldes históricos de dominio público

**Qué es:** sistemas de construcción y moldes de manuales antiguos de sastrería y corte, que la industria dejó de usar.

**Licencia: caso por caso.** No hay un repositorio único. Cada obra se verifica antes de usarla:

1. **Plazo de protección:** depende del país. En Estados Unidos, al 2026 están en dominio público las obras publicadas antes de 1931. En la Argentina y en la mayor parte de Europa rige la vida del autor más 70 años, así que entran las de autores muertos antes de 1956. Hay que registrar el país, el año de publicación y, cuando se sepa, el año de muerte del autor.
2. **El escaneo:** el archivo que lo aloja (Internet Archive, Wikimedia Commons, una biblioteca) puede declarar condiciones propias. Se registra el estado que declara la fuente.
3. **Qué se toma:** un método de construcción en general no está protegido por derecho de autor, pero el texto y las ilustraciones sí. Por eso el plazo se verifica aunque solo se use el método.

**Conversión:** sin conversor automático. Cada construcción se redibuja en PATTRN como fragmento `dibujado`. La obra original queda en `origen` y en una nota, y el fragmento resultante se publica bajo CC BY-SA. Las medidas del manual se pasan a milímetros y se marca como incierto todo lo que la fuente no precise.

## Brechas del formato encontradas

Hay tres cosas del formato v0.1 que **habría que resolver antes de escribir cualquier conversor**. No se cambian ahora; se discuten cuando llegue el momento.

- **a) Bordes que se terminan en la confección.** Un ruedo o un escote cortado de tela nueva no es `costura` (no se cose a otra pieza), ni `doblez`, ni `terminado` (no viene terminado de una donante). Hoy no tiene tipo. Probablemente falta un tipo `dobladillo`, o una terminación a realizar, con su propio margen.
- **b) Hilo sin certeza.** El hilo es obligatorio, pero no se puede marcar como incierto, y su `fuente` no contempla "deducido por un conversor". Para GarmentCodeData habría que suponerlo.
- **c) Origen externo.** `origen.metodo` admite foto, dibujado, corte y fusión, pero no "convertido de una fuente externa", con datos de la fuente (base, id, versión, licencia, URL). Además, `linaje` solo admite referencias a fragmentos PATTRN.
