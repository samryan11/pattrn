# Estado de PATTRN

Actualizado el 2026-11-03, al cierre de la sesión. Último commit de código: `a05d134`.

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
