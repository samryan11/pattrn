# PATTRN — Especificación del formato v0.1

Estado: borrador para implementar v1.
Esquemas: [`esquemas/fragmento.schema.json`](../esquemas/fragmento.schema.json), [`esquemas/molde.schema.json`](../esquemas/molde.schema.json).
Ejemplos: [`esquemas/ejemplos/`](../esquemas/ejemplos/).
Licencias: el código, GPLv3; los fragmentos y moldes, CC BY-SA 4.0.

---

## 0. Principios

1. **La unidad es el fragmento.** PATTERNPEDIA crece con fragmentos, no con moldes completos. Cada corte produce material que cualquiera puede reutilizar.
2. **Cortar es la operación central.** El formato registra de dónde salió cada fragmento y por qué línea se cortó.
3. **Precisión siempre.** Los largos se calculan, nunca se estiman. Lo que no se sabe se marca como incierto, nunca se inventa.
4. **El software calcula, la persona decide.** Nada se redibuja sin que se acepte. Los avisos nunca bloquean y nunca se callan.
5. **La inmutabilidad es interna.** Las versiones existen para que las referencias no se rompan. En pantalla se edita y listo.

## 1. Tres archivos

| Archivo | Qué es | Esquema |
|---|---|---|
| **Fragmento** (`frg-….json`) | Polígono con bordes etiquetados, hilo, marcas y origen. Autónomo: se entiende y se publica solo. | `fragmento.schema.json` |
| **Molde** (`mol-….json`) | Una decisión de diseño: instancias de fragmentos (versión fijada), fusiones en piezas y costuras. | `molde.schema.json` |
| **Proyecto** | Imágenes de referencia, ficha adjunta, campos manuales de la hoja de pieza y árbol de moldes. | pendiente (§13) |

Un fragmento no sabe con qué se une; eso vive en el molde.

## 2. Convenciones

- **Unidades:** milímetros. Se guarda con dos decimales (0,01 mm); en pantalla, los largos y diferencias se muestran en cm con dos decimales.
- **Coordenadas:** cada fragmento tiene su sistema local, con x a la derecha e y hacia arriba.
- **Contorno:** cerrado y en sentido antihorario. El `a` de cada borde es el `de` del siguiente y el último cierra en el primero.
- **Ángulos:** en grados, antihorarios desde +x.
- **Identificadores:**
  - fragmento: `frg-` + 6 a 32 caracteres `[0-9a-z]`
  - molde: `mol-…`
  - vértices `v1…`, bordes `b1…`, piquetes `p1…`, marcas `m1…`
- **Referencia a un fragmento:** `frg-id@version`. Siempre va acompañada de su `huella`.
- **Huella:** `sha256` de la serialización canónica (RFC 8785) del objeto `{hilo, vertices, bordes, marcas, escalado}`, con números redondeados a 0,01. Excluye nombre, notas, autoría y número de versión. Garantiza que una referencia apunta exactamente a la geometría que se usó.

## 3. Fragmento

### 3.1 Identidad y versión

`id` es estable: editar no lo cambia. `version` sube con cada edición (ver §6). Desde la versión 2 es obligatorio `version_anterior`, que indica de qué versión salió esta. Así la historia puede ramificarse cuando se edita desde un punto anterior del árbol de moldes.

### 3.2 Origen, linaje y donantes

`origen` describe cómo nació la versión 1. Las ediciones no lo cambian.

| `metodo` | Cuándo | Datos propios |
|---|---|---|
| `foto` | Importado desde foto con regla | foto, objeto (`molde_papel` / `prenda_plana`), calibración con `error_estimado_mm`, medidas verificadas con cinta |
| `dibujado` | Dibujado en el lienzo | — |
| `corte` | Salió de cortar otro fragmento | padre (ref + huella), línea de corte, lado, hermanos, transformación |
| `fusion` | Se consolidaron varios fragmentos fusionados en uno | padres con sus transformaciones |

**`linaje`** es obligatorio en `corte` y `fusion`. Es la cadena completa de atribución de los ancestros: ref, nombre, autor, licencia y si está publicado. Viaja dentro del fragmento para que pueda publicarse solo y cumplir CC BY-SA aunque sus ancestros no estén publicados.

**`donantes`** lista las prendas de las que salen la tela o los bordes terminados. Se hereda al cortar.

### 3.3 Hilo (obligatorio)

```json
"hilo": { "punto": [120.0, 210.0], "angulo_grados": 90, "fuente": "declarado", "sentido_unico": false }
```

- `punto` debe estar dentro del fragmento.
- `fuente` puede ser `marcado_en_original`, `declarado` (lo indicaste vos) o `deducido_de_tela`.
- `sentido_unico` va en `true` para pana, terciopelo o dibujos direccionales: ahí el hilo tiene sentido, no solo dirección.

Un fragmento sin hilo no es válido y no se puede guardar. Si el importador no lo puede deducir, lo pregunta: dibujás una flecha sobre la foto.

### 3.4 Geometría

`vertices` es un mapa `id → [x, y]`. Cada borde une dos vértices y puede llevar `curva` (Bézier cúbica con `c1` y `c2` en coordenadas absolutas locales). La geometría es siempre la **línea neta** (línea de costura). El margen nunca se dibuja: se calcula al exportar.

### 3.5 Bordes

Cada borde tiene dos ejes separados, los dos obligatorios. No existe el borde "sin tipo".

**`etiqueta`** dice qué es el borde:
- en el cuerpo: escote, hombro, sisa, lateral, centro_frente, centro_espalda, ruedo, cintura, cadera
- en mangas: copa_manga, costura_manga, puno
- en cuellos y cierres: cuello, pie_cuello, solapa, tapeta, vista, pretina
- en pantalones: tiro, entrepierna
- en el diseño: canesu, linea_diseno, bolsillo
- `otro`, que exige `descripcion`

**`tipo`** dice qué pasa con el borde:

| `tipo` | Significa | `margen_mm` |
|---|---|---|
| `costura` | Se cose a otra pieza | obligatorio |
| `doblez` | Va al doblez; la pieza se corta en espejo | prohibido |
| `union` | Línea de corte que se fusiona con otro fragmento y desaparece en la pieza | prohibido |
| `terminado` | Ya viene terminado de la prenda donante (ver §4) | prohibido; exige `terminado` |

**Otros campos del borde:**

- **`certeza`**: `{estado: cierta | incierta, motivo, nota}`. Si falta, el borde es cierto.
- **`importacion.margen_en_contorno`**: lo que respondiste al importar. Puede ser un número (ya descontado de la geometría) o `"no_se"`. `"no_se"` obliga a `certeza.estado = incierta` con `motivo = margen_desconocido`. El borde se guarda tal como se trazó y se marca: nunca se inventa un número.
- **`procedencia`**: solo en fragmentos de corte o fusión. Es `{heredado_de: "b3"}` (tramo de un borde del padre) o `{nacido_de_corte: true}`.
- **`piquetes`**: `{id, pos_mm, cantidad 1–3, nota}`. `pos_mm` es la distancia sobre la línea neta desde el vértice `de`, así sobrevive a rotaciones, espejos y escalado.

### 3.6 Marcas

- **`pinza`**: se define por el borde en que abre (`borde`, `inicio_mm`, `fin_mm`) y su `vertice`. **La boca de la pinza se descuenta del largo de costura de ese borde.**
- **`boton`, `ojal`, `bolsillo`, `perforacion`, `linea_hilvan`, `linea_doblez`, `texto`**: se definen por sus `puntos`.

### 3.7 Escalado (previsto, no usado en v1)

Se gradúa por deltas por talle:

- **Vértices y puntos de control:** las claves son `v3` o `b2.c1`, con valores `[dx, dy]`. Un punto de control sin delta propio se mueve con su vértice más cercano.
- **Piquetes:** su posición se escala en proporción al largo del borde, salvo que el talle la fije en `piquetes["b4.p1"]`.

Un delta que alargue un borde `terminado` va a ser un aviso cuando se implemente el escalado.

## 4. Borde terminado (transversal)

Un borde `terminado` es tela que ya viene resuelta de la donante: un ruedo, una tapeta, un orillo, un puño. Es la diferencia central entre esta moldería y la industrial, y cada parte del sistema lo trata distinto:

| Dónde | Comportamiento |
|---|---|
| **Formato** | `margen_mm` prohibido. `terminado.que` obligatorio; opcionales `ancho_mm`, `descripcion` y `donante` (índice en `donantes`). |
| **Regla física** | Se puede **acortar** cortando a través. **Nunca** se alarga, se desplaza ni cambia de forma. |
| **Lienzo** | Trazo propio, distinto de costura, doblez y unión, con candado en sus vértices. Para moverlos hay que cambiar el tipo, un clic deliberado. |
| **Corte** | Si la línea de corte lo cruza, cada lado conserva su tramo como `terminado`, porque acortar está permitido. |
| **Aviso de costura** | Si hay diferencia de largo y un lado es terminado, el aviso lo dice y solo propone ajustar el otro lado. Si los dos lados son terminados, dice que ninguno se puede ajustar: queda declarar embebido o cambiar el diseño. |
| **Fusión** | Las opciones `manda_a` / `manda_b` que obligarían a alargar o deformar un terminado del fragmento subordinado no se ofrecen, y se explica por qué. |
| **Exportación** | El PDF no agrega margen y rotula "TERMINADO · no agregar margen". El DXF lo pone en una capa propia. |
| **Hoja de pieza** | Sección propia: pieza, borde, qué terminación es, ancho y prenda donante. |

## 5. Corte (operación central)

**Cortar** es una herramienta de primera clase en la barra del lienzo.

**Entrada.** Una línea dibujada sobre el fragmento, con tramos rectos o curvos, que cruza el contorno. v1 admite una línea que cruza exactamente dos veces y produce dos fragmentos; el formato admite N. En v0.1 la línea no puede atravesar una pinza: el lienzo lo indica y hay que mover la línea o quitar la pinza.

**Resultado.**
1. El padre no cambia.
2. Cada lado es un fragmento nuevo, con `id` propio y versión 1, y queda guardado en el archivo local.
3. `origen.metodo = corte`, con:
   - `padre`: ref y huella
   - `linea`: en coordenadas del padre
   - `lado`: izquierda o derecha según el sentido de la línea
   - `hermanos`
   - `transformacion`: identidad por defecto
4. `linaje` = linaje del padre + el padre.
5. `donantes` se heredan.
6. Hilo: se conserva el ángulo y `sentido_unico`. Si el punto queda fuera, se mueve al interior.
7. Bordes heredados: cada tramo de un borde del padre conserva etiqueta, tipo, margen, terminado y certeza, con `procedencia.heredado_de`. Los piquetes se reubican y los que quedan fuera se descartan.
8. Bordes nuevos: llevan `procedencia.nacido_de_corte`. Por defecto son `tipo: union` y la etiqueta se elige una vez en la herramienta, con una sugerencia preseleccionada (un clic). Si se cambian a `costura`, toman el margen por defecto del proyecto.
9. Nombre automático: "‹nombre del padre› · corte ‹etiqueta› · lado A/B". Se puede renombrar cuando quieras.
10. En el molde activo, la instancia del padre se reemplaza por las de los hijos en el mismo lugar.

**Publicación.** Cada fragmento cortado es autónomo: la geometría completa está en el archivo, y la referencia al padre es información, no una dependencia. El linaje garantiza la atribución.

## 6. Versionado automático

**Qué ves:** editás un fragmento y listo. No hay diálogos ni renombres, ni nada que confirmar.

**Qué pasa por dentro:**

- Cada **acción completada** (soltar un vértice, aplicar una herramienta, confirmar un campo) crea una versión nueva, con el mismo `id` y `version + 1`. Deshacer y rehacer recorren estas versiones.
- El **molde activo** actualiza su referencia solo.
- Los **otros moldes** conservan la versión que fijaron. A lo sumo muestran un indicador pasivo de "hay versión más nueva", nunca un diálogo.
- **Compactación:** las versiones que no referencia ningún molde guardado en el árbol ni ninguna publicación pueden fusionarse con la siguiente. La última versión nunca se compacta, y las publicadas tampoco.
- El **árbol de versiones de moldes** (interruptor on/off) es otra cosa: ramifica moldes. Si volvés a un molde viejo y editás un fragmento desde su v3, nace una v6 con `version_anterior: 3`, sin conflicto con la rama que llegó a v5.

**Qué conserva la identidad y qué crea una nueva:**

| Acción | Resultado |
|---|---|
| Mover vértices o curvas, cambiar etiqueta, tipo, margen, piquetes, hilo o marcas | Misma identidad, versión nueva |
| Cortar | Identidades nuevas (§5) |
| Consolidar una fusión como fragmento | Identidad nueva (`metodo: fusion`) |
| Duplicar | Identidad nueva |

## 7. Molde

**Piezas.** Una pieza tiene:
- `cortes`: cantidad, si va en espejo y en qué tela
- `instancias`: fragmento fijado con `ref` + `huella` y su transformación (espejo, rotación y traslación, en ese orden)
- `fusiones`

La geometría de la pieza se **calcula** de forma determinista a partir de los fragmentos, las transformaciones y las fusiones con su resolución. Los fragmentos no se modifican.

**Fusiones.** Unen dos bordes de tipo `union`, que desaparecen en la pieza. `alineacion` (`inicio`, `fin` o `centro`) dice dónde coinciden. Se mide en el sentido del borde `a`. Como los dos contornos son antihorarios, los bordes fusionados se recorren en sentidos opuestos: `inicio` hace coincidir `a.de` con `b.a`, y `fin` hace coincidir `a.a` con `b.de`. Si no miden lo mismo o no se superponen:

1. **Siempre se avisa** (`union_distinta`), aun con una resolución aplicada.
2. Se ofrece **elegir cuál manda** (`manda_a` / `manda_b`): el otro fragmento se ajusta en la pieza calculada.
3. Como tercera opción se propone una **transición suave** (`transicion`, con `zona_mm`). Nunca es automática.

Cualquier resolución distinta de `ninguna` lleva `aceptada` con la fecha. Es la constancia de que la aceptaste: nada se redibuja sin eso.

**Costuras.**
- Cada lado es una **cadena** de bordes contiguos de una pieza, que pueden venir de fragmentos distintos.
- El largo de un lado es la suma de los largos netos, con Béziers calculadas a 0,01 mm, menos las bocas de pinza.
- **Desvío** = largo(a) − largo(b) − `embebido_mm`.
- El desvío **se muestra siempre**, en vivo, en cm con dos decimales.
- `tolerancia_mm` (1,0 por defecto) solo separa "dentro de tolerancia" (informativo) de "aviso" (resaltado). Nada pasa en silencio.
- Si el desvío está dentro del error de importación sumado de los fragmentos involucrados, el aviso lo aclara.
- `piquetes_pares` se verifican por distancia sobre la costura.

## 8. Avisos

Ningún aviso bloquea. Todos se ven en el lienzo sobre el elemento afectado y en un panel.

| Código | Cuándo | Muestra |
|---|---|---|
| `largo_costura` | El desvío supera la tolerancia | Diferencia exacta en cm, qué lado sobra y si algún lado es terminado o incierto |
| `piquetes_desalineados` | Un par de piquetes no coincide | Diferencia en cm sobre la costura |
| `union_distinta` | Los bordes de una fusión difieren | Diferencia de largo, separación máxima y resolución aplicada (si hay) |
| `union_sin_fusionar` | Un borde `union` de una pieza no está fusionado | Borde. Al exportar se rotula "unión sin resolver" |
| `costura_sin_pareja` | Un borde `costura` no participa de ninguna costura del molde | Borde |
| `borde_incierto` | Una costura o fusión usa un borde incierto | Motivo; el largo se muestra como incierto |
| `doblez_inconsistente` | Los dobleces de una pieza no forman un solo eje, o el eje sigue en un borde de otro tipo | Bordes en conflicto |
| `medida_no_coincide` | Una medida verificada con cinta difiere del largo calculado más que el error estimado | Ambos valores |

## 9. Importación desde foto

Flujo, en orden:

1. Calibración con la regla en el encuadre (o cuadrícula u objeto medido). Se registra el `error_estimado_mm`.
2. Vectorización del contorno y ajuste a Béziers, con la tolerancia registrada.
3. Por cada borde:
   - etiqueta y tipo, ambos obligatorios
   - margen que trae el contorno: número, 0 o **no sé** (el borde queda incierto)
   - si es terminado, qué terminación es
4. Hilo: si está marcado en el original se toma de ahí; si no, **se pregunta**.
5. Medidas con cinta, optativas, para contrastar.

No se guarda sin hilo y sin etiqueta y tipo en cada borde.

## 10. Hoja de pieza: de dónde sale cada dato

| Sección | Fuente |
|---|---|
| Imagen de referencia, ficha adjunta | Proyecto |
| Molde armado (dibujo) | Molde → geometría calculada |
| Fragmentos usados y su origen | Instancias → `origen` y `linaje` de cada fragmento |
| Prendas donantes | `donantes` de los fragmentos |
| Medidas clave y largos de costura | Calculados, con desvío y embebido |
| Bordes terminados | §4 |
| Bordes inciertos y avisos abiertos | §8 |
| Hilo de cada pieza, con su fuente | `hilo` |
| Atribución CC BY-SA | `linaje` + autoría |
| Orden de armado, notas, advertencias | Proyecto (campos manuales) |

Se regenera cada vez que cambia el molde, porque todo sale de datos que ya existen.

## 11. Reglas que el esquema no puede verificar

El validador semántico del software comprueba:

**Fragmento**
1. El contorno está encadenado, cerrado, en sentido antihorario y sin autointersecciones.
2. Todos los vértices referenciados existen y no hay vértices sueltos.
3. Los ids son únicos: bordes, marcas y piquetes dentro de su borde.
4. `pos_mm` de cada piquete ≤ largo del borde.
5. En cada pinza, `inicio_mm < fin_mm ≤ largo` y el vértice está dentro del fragmento.
6. `hilo.punto` está dentro del fragmento.
7. La `huella` coincide con el contenido.
8. En fragmentos de corte o fusión, todos los bordes tienen `procedencia`. En un corte, al menos uno es `nacido_de_corte`.
9. `terminado.donante` es un índice válido.

**Molde**

10. Las refs resuelven y su huella coincide.
11. Las fusiones son solo entre bordes `union`.
12. Los lados de costura son cadenas contiguas de bordes `costura` o `terminado`.
13. Si una pieza tiene bordes `doblez`, todos están sobre una misma recta (el eje de espejo), y ningún borde de otro tipo continúa sobre esa recta. Una pieza no puede ir al doblez en un tramo del centro frente y tener tapeta en otro. Si no se cumple, se avisa con `doblez_inconsistente`.

## 12. Exportación (lo que el formato garantiza)

- El hilo existe siempre, así que el DXF siempre lo lleva.
- El tipo de cada borde define su capa y su tratamiento: margen calculado en `costura`; marca de doblez en `doblez`; sin margen y rotulado en `terminado`.
- Las curvas se aproximan a polilíneas con 0,1 mm de tolerancia para plotter y tizadora.
- El detalle de capas DXF (convención AAMA/ASTM) y el armado del PDF A4 con marcas de pegado van en una especificación de exportación aparte.

## 13. Pendiente fuera de v0.1

- Esquema del **proyecto**: imágenes, ficha adjunta, campos manuales de la hoja de pieza, árbol de moldes con interruptor y notas por rama.
- Motor de escalado (el formato ya lo admite).
- Cortes con más de dos cruces y cortes que atraviesan pinzas.
