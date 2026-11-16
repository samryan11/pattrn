# Estado de PATTRN

Actualizado el 2026-11-03, al cierre de la sesión. Último commit de código: `a05d134`.

## Novedades del 2026-11-16, tarde (versión 0.3.0)

La pantalla de Molde dejó de entregar una base entera: ahora es un **lienzo** donde se arma un molde nuevo.

- **Cortar** (`nucleo/cortar.ts`): una recta parte un fragmento en dos. Los bordes atravesados se dividen sin perder etiqueta, tipo, margen ni piquetes; el borde nuevo nace como costura con 1 cm de margen. Cada parte es un fragmento con origen `corte` y la cadena de atribución completa.
- **Lienzo** (`app/lienzo.ts`, `app/pantalla-molde.ts`): traer piezas de varias prendas y en talles distintos, moverlas, cortarlas, quitar partes, cambiar tipo y margen de un borde, y coser dos bordes. La costura avisa la diferencia exacta y permite declararla como frunce o embebido.
- **Patternpedia:** 130 fragmentos de 21 prendas de FreeSewing (torsos, camisa, buzos, saco, tapado, faldas, vestido, pantalones). Se cargan de a uno cuando se piden.
- **Proyecto:** guarda el molde del lienzo, sus fragmentos, las costuras y dónde quedó cada pieza.

**Probado:** en Chrome, de punta a punta: traer, cortar, quitar, coser, declarar embebido, cambiar un margen, mover, descargar, guardar y reabrir. Lo guardado cumple los esquemas. 89 pruebas.

**Sin probar:** el lienzo en la aplicación instalada, y con pantalla táctil.

**Falta en el lienzo:**
- Ajustar el largo de un borde para que una costura coincida (el núcleo ya sabe: «cuál manda» y «transición»; no está conectado a esta pantalla ni a lo que se exporta).
- Fusionar dos fragmentos de la misma tela en una sola pieza.
- Cortes curvos, girar y espejar piezas, deshacer, acercar y alejar.
- Muchos bordes de las prendas nuevas no tienen nombre deducido («borde»).
- Que PATTRN proponga qué traer a partir de la imagen.

## Versión 0.2.0, del 2026-11-16 a la mañana

- **Pantallas nuevas:** Idea (imagen, boceto o texto), Contame más, Molde (elegir base y talle), Descargas y Mi espacio, con el diseño aprobado. El taller anterior (uniones e importador de fotos) se abre desde Mi espacio.
- **Descargas:** ZIP con PDF A4 por pieza, DXF, hoja de pieza, LEEME y el aviso de licencia de la fuente.
- **Formato:** tipo de borde `dobladillo`, hilo `deducido_por_conversor`, origen `convertido`; en el proyecto, entrada `idea_en_texto` y `contexto`.
- **Conversor de FreeSewing:** 10 fragmentos en `patternpedia/freesewing/` (Aaron, Brian, Teagan), con 20 talles cada uno. 83 pruebas.
- **Perfil local:** nombre, medidas, proyectos y descargas recientes, guardados en la computadora.

**Probado:** todas las pantallas en Chrome, la descarga del ZIP (abierto con otras herramientas: ZIP íntegro, DXF legible, PDF en A4), y guardar y reabrir un proyecto.

**Sin probar:** la aplicación instalada en Windows. En particular el diálogo de «Descargar ZIP», guardar el proyecto en una carpeta y reabrirlo desde Mi espacio. Tampoco el DXF en un programa de patronaje ni el PDF impreso y medido.

**Falta:**
- Forrería: la pantalla lo anota, pero los moldes de forro no se generan.
- Talle a medida, y equivalencia de los talles con XS–XL.
- Que PATTRN proponga la base a partir de la imagen: hoy la elige la persona.
- Capas DXF según AAMA/ASTM.
- Conversor de GarmentCodeData.

## Qué mirar primero al volver

1. **La compilación de `a05d134`.** Al escribir esto seguía corriendo: [ver ejecución](https://github.com/samryan11/pattrn/actions/runs/41741021500). Si falló, se arregla antes que nada.
2. **El PDF del delantero inferior, medido con regla** ([PDF](esquemas/ejemplos/exportados/frg-cua4m8d1@2.pdf), impreso al 100 %). Tiene que dar:
   - cuadrado de control: 10,00 × 10,00 cm
   - lateral: 38,02 cm neto, con margen de 1,00 cm en perpendicular
   - ruedo: 25,00 cm neto, 26,00 cm en la línea de corte
   - canesú: 26,20 cm neto, 27,20 cm en la línea de corte
   - centro frente: 38,00 cm
   - piquete: a 20,00 cm de la esquina del ruedo, sobre la línea azul
3. **La aplicación instalada, que todavía no probó nadie con guardar ni con el importador:** Guardar como, cerrar, abrir de nuevo. Después, importar una pieza.
4. **Las dos fotos a repetir,** en `fotos/campera/` (fuera del repositorio):
   - fondo de bolsillo: sin el lápiz y con el papel plano
   - espalda: sin el doblez del borde

   Con regla y escuadra, y sin recortar en la galería.
5. **La primera comprobación real del importador:** importar una pieza, imprimir su PDF y apoyarlo sobre el molde de papel.

## Qué quedó hecho

- **Formato v0.1:** fragmento, molde y proyecto, con [especificación](especificacion/formato-v0.1.md), esquemas y ejemplos.
- **Núcleo en TypeScript:** una sola geometría, verificada con 69 pruebas y con los números de referencia (23,72 / 26,20 / 2,48 cm).
- **PDF A4 1:1 en mosaico,** con hoja de control y margen de costura.
- **Resolución de uniones y costuras:** nada se aplica sin aceptarlo. Una fusión entre telas distintas no se permite, y se propone coserla.
- **Abrir y guardar proyectos,** con autoguardado y aviso al cerrar.
- **Importador de fotos,** probado con la foto real de la delantera en el navegador. Esa prueba no se guardó: **ninguna pieza de la campera está importada todavía.**
- **Repositorio público y compilación automática** del instalador de Windows.

## Qué quedó a medias

**Sin verificar:**
- El PDF impreso y medido.
- Guardar, abrir e importar en la aplicación instalada: se probaron en el navegador, con una carpeta de prueba y clics simulados.

**Precisión del importador, con la foto de la delantera:**
- **Inclinación hacia el costado:** sin escuadra no se comprueba, y el error estimado da ±4,3 mm.
- **Regla curvada en la foto:** sale curvada unos 3,5 píxeles (1 mm en 60 cm), y los bordes rectos vecinos también. Parece la lente del celular, sin confirmar. Para corregirla hace falta el centro de la imagen, y por eso las fotos no tienen que estar recortadas.
- **Borde del papel:** el importador sigue el borde de corte, no la línea de lápiz. Las ondas del corte a mano, de alrededor de 1 mm, entran en la medida. Falta decidir si conviene seguir la línea de lápiz.
- **Falta en el importador:** piquetes, perforaciones y pinzas.

**Límites conocidos del código:**
- Las costuras y fusiones se resuelven con un borde por lado, una fusión por pieza y alineación de inicio o fin.
- Las bocas de pinza todavía no se descuentan del largo de costura, aunque la especificación lo pide.
- Al dejar una rama no se abre el campo para su nota, aunque la especificación lo pide.
- El PDF solo se exporta desde el importador, o con la herramienta de línea de comandos.
- `herramientas/` en Python sigue siendo solo de referencia, con su propio cálculo de largos.

**Sin decidir, antes de escribir conversores** ([fuentes candidatas](especificacion/fuentes-candidatas.md)):
- Tipo de borde para lo que se termina en la confección (dobladillo).
- Certeza del hilo.
- Origen externo de un fragmento.

**Punto de la v1 sin empezar:**
- Lienzo con arrastre y unión de fragmentos.
- Exportación a DXF.
- Hoja de pieza en PDF.
- Generar la imagen desde el boceto, y sugerencia asistida de fragmentos.
- Pantalla del árbol de versiones (el formato ya lo tiene y guardar lo respeta, pero no se ve ni se maneja).

## Resuelto: el borde con 2 cm de diferencia

No quedó pendiente. Apareció en la prueba con foto sintética, y tenía dos causas:

- **La diferencia de 2 cm:** el relleno se quedaba adentro de la línea de lápiz y tomaba esa línea por el borde del papel. Ahora cruza las líneas finas.
- **Bordes partidos en muchos tramos:** el desvío se medía contra puntos sueltos en vez de contra la línea, y las rectas parecían torcidas.

La prueba exige ahora menos de un píxel de diferencia (0,5 mm en esa foto). En la curva quedan 0,34 mm sobre 310 mm.
