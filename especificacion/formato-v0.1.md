# PATTRN — Especificación del formato v0.1

Estado: borrador para implementar v1.
Esquemas: [`esquemas/fragmento.schema.json`](../esquemas/fragmento.schema.json), [`esquemas/molde.schema.json`](../esquemas/molde.schema.json), [`esquemas/proyecto.schema.json`](../esquemas/proyecto.schema.json).
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
| **Proyecto** (`proyecto.json`) | Con qué se entró, imágenes de referencia, fichas adjuntas, sugerencias de la IA, campos manuales de la hoja de pieza y árbol de moldes. | `proyecto.schema.json` (§13) |

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

**Telas.** El molde declara sus `telas`, y cada instancia dice de cuál se corta. **El criterio es la tela, no el fragmento de origen.** Dos zonas distintas de la misma prenda donante son la misma tela. Dos prendas donantes distintas son dos telas, aunque se parezcan.

**Piezas.** Una pieza es un trozo de una sola tela. Tiene:
- `cortes`: cantidad y si va en espejo
- `instancias`: fragmento fijado con `ref` + `huella`, su `tela` y su transformación (espejo, rotación y traslación, en ese orden)
- `fusiones`

La geometría de la pieza se **calcula** de forma determinista a partir de los fragmentos, las transformaciones y las fusiones con su resolución. Los fragmentos no se modifican.

**Fusiones.** Unen dos bordes de tipo `union`, que desaparecen en la pieza. **Solo entre instancias de la misma tela.** Una fusión entre telas distintas no es válida: el software no la resuelve (`fusion_entre_telas`) y propone convertirla en costura. Convertirla, siempre con la aceptación de la persona, hace tres cosas:

- los dos bordes pasan de `union` a `costura`, con el margen por defecto del proyecto (una versión nueva de cada fragmento, §6)
- la pieza se separa en una pieza por tela
- nace una costura entre esos dos bordes

`alineacion` (`inicio`, `fin` o `centro`) dice dónde coinciden los bordes de una fusión. `alineacion` (`inicio`, `fin` o `centro`) dice dónde coinciden. Se mide en el sentido del borde `a`. Como los dos contornos son antihorarios, los bordes fusionados se recorren en sentidos opuestos: `inicio` hace coincidir `a.de` con `b.a`, y `fin` hace coincidir `a.a` con `b.de`. Si no miden lo mismo o no se superponen:

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

**Resolver una costura que no coincide.** Si el desvío supera la tolerancia, se ofrecen cuatro opciones. Ninguna se aplica sola.

1. **Declarar embebido:** la diferencia es buscada (se embebe o se frunce). Se fija `embebido_mm` y no cambia la geometría.
2. **Manda a** / 3. **manda b:** el borde del otro lado se acorta o se prolonga sobre su propia línea hasta medir lo mismo, y su borde vecino acompaña al extremo que se mueve.
4. **Transición suave:** los dos lados van al largo medio, y los vecinos se redibujan en `zona_mm` junto al extremo.

`alineacion` dice qué extremo queda fijo, como en las fusiones. La resolución se guarda en `costura.resolucion` con su fecha de aceptación. Las reglas del borde terminado (§4) valen igual: un terminado solo se acorta.

## 8. Avisos

Ningún aviso bloquea. Todos se ven en el lienzo sobre el elemento afectado y en un panel.

| Código | Cuándo | Muestra |
|---|---|---|
| `largo_costura` | El desvío supera la tolerancia | Diferencia exacta en cm, qué lado sobra y si algún lado es terminado o incierto |
| `piquetes_desalineados` | Un par de piquetes no coincide | Diferencia en cm sobre la costura |
| `union_distinta` | Los bordes de una fusión difieren | Diferencia de largo, separación máxima y resolución aplicada (si hay) |
| `fusion_entre_telas` | Una fusión une instancias de telas distintas | Las dos telas y la propuesta de convertirla en costura. Es el único aviso que impide resolver: la fusión no se calcula hasta que se convierte |
| `union_sin_fusionar` | Un borde `union` de una pieza no está fusionado | Borde. Al exportar se rotula "unión sin resolver" |
| `costura_sin_pareja` | Un borde `costura` no participa de ninguna costura del molde | Borde |
| `borde_incierto` | Una costura o fusión usa un borde incierto | Motivo; el largo se muestra como incierto |
| `doblez_inconsistente` | Los dobleces de una pieza no forman un solo eje, o el eje sigue en un borde de otro tipo | Bordes en conflicto |
| `medida_no_coincide` | Una medida verificada con cinta difiere del largo calculado más que el error estimado | Ambos valores |

## 9. Importación desde foto

Flujo, en orden:

1. Calibración con marcas sobre la regla. Con tres marcas o más se detecta la inclinación a lo largo de la regla y, si supera el 0,3 %, se corrige. Con una escuadra cruzada se comprueba la inclinación hacia el costado; sin ella, el `error_estimado_mm` supone 0,5 %.
2. Clic sobre la pieza: se sigue el borde del papel y se proponen las esquinas, que la persona puede sacar o agregar. Cada borde es una recta o una Bézier, con la tolerancia registrada. Si un borde se aparta del papel más de 1,5 mm, se avisa que quizá le falta una esquina.
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
| Fragmentos que propuso la IA y qué se decidió | `sugerencias` del proyecto |
| Orden de armado, notas, advertencias | Campos manuales del nodo actual del árbol (§13.6) |

Se regenera cada vez que cambia el molde, porque todo sale de datos que ya existen. También se puede generar sin molde: en ese caso muestra las referencias, las fichas y los campos manuales.

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
12 bis. La `tela` de cada instancia existe en `telas`, y las dos instancias de una fusión tienen la misma tela.
13. Si una pieza tiene bordes `doblez`, todos están sobre una misma recta (el eje de espejo), y ningún borde de otro tipo continúa sobre esa recta. Una pieza no puede ir al doblez en un tramo del centro frente y tener tapeta en otro. Si no se cumple, se avisa con `doblez_inconsistente`.

**Proyecto**

14. Los ids son únicos: nodos, referencias, fichas y sugerencias.
15. El árbol tiene exactamente una raíz (`padre: null`), todo `padre` existe y no hay ciclos.
16. `arbol.actual` y `referencia_activa` existen.
17. Cada molde de un nodo existe en su `archivo` y su `id` coincide. Un mismo molde no aparece en dos nodos.
18. El `desde` de una referencia generada apunta a una referencia de tipo `boceto`.
19. Las costuras que cita `orden_armado` existen en el molde de ese nodo.
20. Toda versión de fragmento que usa algún molde del árbol está copiada en `fragmentos/`.

## 12. Exportación (lo que el formato garantiza)

- El hilo existe siempre, así que el DXF siempre lo lleva.
- El tipo de cada borde define su capa y su tratamiento: margen calculado en `costura`; marca de doblez en `doblez`; sin margen y rotulado en `terminado`.
- Las curvas se aproximan a polilíneas con 0,1 mm de tolerancia para plotter y tizadora.
- El detalle de capas DXF (convención AAMA/ASTM) y el armado del PDF A4 con marcas de pegado van en una especificación de exportación aparte.

## 13. Proyecto

### 13.1 Entrada

Lo primero que pregunta el software es con qué se entra. La respuesta queda en `entrada.modo`:

| Opción | `modo` | Qué queda en `referencias` |
|---|---|---|
| a) generar la imagen desde un boceto, dentro de PATTRN | `generar_desde_boceto` | el boceto (subido) y la imagen generada |
| b) imagen ya generada en otro generador | `imagen_ia_externa` | la imagen |
| c) boceto a mano | `boceto_a_mano` | el boceto |
| d) foto de una prenda existente | `foto_prenda` | la foto |
| e) directo al lienzo | `lienzo` | puede quedar vacío |

Salvo en `lienzo`, el proyecto tiene al menos una referencia y una `referencia_activa`.

### 13.2 Referencias

Cada referencia es una imagen con `tipo` (`boceto`, `imagen_ia`, `foto_prenda`, `otra`) y `origen`:

- **`subida`:** opcionalmente con `fuente`, por ejemplo el nombre del generador externo.
- **`generada_en_pattrn`:** con `generador`, `prompt` y `desde`, que es el boceto del que salió. Así la imagen se puede rastrear hasta el dibujo a mano.

La `referencia_activa` se ve al costado del lienzo todo el tiempo. Se puede cambiar, y las demás quedan a mano.

### 13.3 Fichas adjuntas

Una ficha propia es información de entrada: la IA la lee para sugerir y la persona la consulta. No es la hoja de pieza, y nada de su contenido pasa al molde sin una decisión.

### 13.4 Sugerencias

Cada vez que la IA propone un fragmento del archivo, queda una sugerencia con el fragmento, lo que se leyó para proponerlo (`desde`) y un `motivo`. Los estados son:

- `propuesta`: la IA la hizo y todavía no se decidió.
- `aceptada`: el fragmento entró tal cual.
- `descartada`: no entró.
- `modificada`: entró cambiado. `resultado` apunta al fragmento derivado.

Una sugerencia `propuesta` no crea nada en el molde. Aceptarla pone la instancia en el molde actual.

### 13.5 Árbol de moldes

Cada **nodo** tiene un molde (o `null`, al principio, cuando solo hay imagen), una `nota` y los campos manuales de su hoja. `arbol.actual` es el nodo en el que se está trabajando.

**Editar y ramificar:**

- **Un nodo sin hijos se edita en su lugar.** El molde es un archivo de trabajo; lo que se versiona por dentro son los fragmentos (§6).
- **Un nodo con hijos queda fijo.** Si volvés a él y cambiás algo, nace solo un nodo hermano con una copia del molde y de los campos manuales. No hay diálogos.
- **Marcar punto** crea un hijo del nodo actual con una copia, para fijar un estado al que querés poder volver.

**El interruptor (`registrar_ramas`):**

- **Encendido:** cuando nace una rama nueva desde un punto anterior, la rama que dejás queda guardada. En ese momento se abre un campo para la nota de esa rama, que va en su nodo final. Es el único momento en que el software pide algo, y dejarla vacía no impide seguir.
- **Apagado:** la historia es lineal. Cambiar un nodo con hijos descarta los nodos posteriores, y deshacer los recupera mientras el proyecto esté abierto. Las ramas que ya existían cuando lo apagaste se conservan.

Los fragmentos nunca se borran por podar el árbol: son material del archivo, no del proyecto.

### 13.6 Campos manuales de la hoja de pieza

Cada nodo tiene en `hoja`:

- **`orden_armado`:** pasos en orden. Cada paso tiene `texto` y opcionalmente las `costuras` del molde a las que se refiere. La hoja puede dibujar esas costuras junto al paso.
- **`notas`:** texto libre.
- **`advertencias`:** una lista. La hoja las pone junto a los avisos abiertos y los bordes terminados.

Al nacer una rama, los campos se copian del nodo de origen y después evoluciona cada uno por su lado.

### 13.7 Carpeta del proyecto

```
mi-proyecto/
  proyecto.json
  moldes/mol-….json
  fragmentos/frg-…@N.json   cada versión que usa algún molde del árbol, y los fragmentos importados
  exportados/…               PDF generados
  referencias/…              imágenes
  fichas/…                   fichas adjuntas
```

`fragmentos` en `proyecto.json` lista los fragmentos que todavía no están en ningún molde, como los recién importados.

La carpeta es autónoma: se puede copiar, compartir o publicar tal cual, sin depender de la biblioteca local de fragmentos de quien la hizo.

## 14. Pendiente fuera de v0.1

- Biblioteca local de fragmentos y formato de publicación en PATTERNPEDIA.
- Medidas clave con nombre, definidas por la persona. En v0.1 la hoja calcula largos de costura y dimensiones de cada pieza.
- Motor de escalado (el formato ya lo admite).
- Cortes con más de dos cruces y cortes que atraviesan pinzas.
