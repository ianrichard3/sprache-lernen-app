# Sprache Lernen App

## Deploy

Cada push a `main` sincroniza el código y redepliega la web app en la misma
URL: <https://script.google.com/macros/s/AKfycbzev-d6D3ftvGW6afcHONQQgX4vs8h5fiTTejgNBVGjnHU2fKDXgno2uaQdUIb1AfEt/exec>.
El repositorio es la fuente de verdad: no edites el código en el editor de Apps
Script porque el próximo push lo reemplaza.

El workflow usa los secrets `CLASPRC_JSON` y `CLASP_JSON`; no los agregues al
repositorio.

La web app es privada. En una copia nueva, su proyecto de Apps Script queda
vinculado al Sheet desde el que abrís **Sprache Lernen App → Abrir app** por primera vez.
Esa apertura también permite usar luego la URL de la web app. Si entrás primero
por la URL de la copia, la app te indica que la abras una vez desde el menú del
Sheet. El despliegue de producción conserva la planilla original.

Para usar el código en otra planilla, creá su Apps Script desde **Extensiones →
Apps Script**, copiá `Code.gs`, `Ai.gs` y `App.html`, recargá el Sheet y abrí
**Sprache Lernen App → Abrir app**. Elegí el idioma objetivo y el idioma de traducción en la configuración inicial.
Cada proyecto conserva su propio par de idiomas y su propia planilla; el CI de este
repositorio sigue desplegando la planilla de producción configurada. Si
querés una URL independiente para la copia, desplegala como web app desde ese
nuevo proyecto. Configurá también allí `GEMINI_API_KEY` para usar la IA: las
Script Properties no se copian al pegar el código.

## Datos y rendimiento

Al abrir, la app carga un único snapshot de frases, historial y colecciones.
Navegar entre pantallas y abrir colecciones usa ese estado local; las
mutaciones hacen una sola llamada y actualizan el estado recibido. Si editás
la planilla directamente mientras la app está abierta, usá **Actualizar datos**
antes de seguir trabajando para traer esos cambios sin pisarlos.

La pantalla **Material** permite previsualizar y editar las frases, y descargar
HTML con tabla, tipografía grande y espaciado ajustable. También conserva la
descarga Markdown para usarla con otro editor. Ejecutá **Sprache Lernen App →
Preparar hoja** para aplicar los encabezados de las columnas nuevas.

## IA con Gemini

Creá una API key en Google AI Studio y guardala como `GEMINI_API_KEY` en las
Script Properties del proyecto de Apps Script. No la agregues al repositorio ni
a GitHub Secrets: el backend la lee al traducir o analizar etimología.

Después del próximo despliegue, autorizá el permiso de solicitudes externas de
Apps Script cuando Google lo pida.

## Audio de colecciones

El reproductor usa la voz del idioma objetivo instalada en el navegador mediante
Web Speech API. No requiere API key, facturación ni guarda archivos MP3. Si el dispositivo no tiene una voz
compatible, la app lo indica y deja el resto de funciones usable.

## Generador de frases

En **Generar**, escribí una situación o temática y elegí **Intermedio (B1–B2)**
o **Avanzado (C1–C2)** para obtener 10 frases en el idioma objetivo con
traducción natural al idioma configurado, usando la misma clave Gemini.
Revisá y editá los resultados y marcá las frases que quieras guardar. Elegir
colecciones es opcional: sin destinos, las frases nuevas quedan en **Sin
colección**. Si una frase ya existe, conserva su traducción, progreso y
colecciones actuales; con destinos marcados, también se agrega a las colecciones
que falten.

Los borradores se conservan al navegar entre secciones, pero se pierden al
recargar o cerrar la app. Generar otra tanda pide confirmar el descarte de los
borradores pendientes y los reemplaza sólo si la generación termina bien.

## Idiomas y pronunciación

En **Configuración**, cada planilla elige su idioma objetivo y su idioma de
traducción (español por defecto). El par se usa al traducir, generar frases,
explicar etimología y titular las columnas del material. Cambiarlo pide
confirmación y conserva las frases existentes. La interfaz sigue en español.

Las frases pueden guardar **Pronunciación** y, para japonés, **Romaji** y
**Kanji con furigana**. El furigana desglosa sólo las palabras que contienen
kanji en una sola línea. El separador exacto entre términos es tres espacios,
tres guiones y tres espacios (`   ---   `):

```text
日本語（にほんご）   ---   本（ほん）   ---   1冊（いっさつ）   ---   読めていません（よめていません）
```

La IA responde sólo con la línea, sin introducciones, traducciones ni explicaciones.
Conserva las formas conjugadas completas
y omite palabras escritas sólo en kana. Si el original no contiene kanji, la app
avisa que no necesita furigana, conserva las ayudas existentes y no llama a la IA.
**Sugerir romaji con IA** y **Sugerir furigana con IA** son botones independientes
en el editor y en cada borrador de **Generar**: cada uno pide y completa sólo
su campo. Podés editar las ayudas y las sugerencias no guardan automáticamente.
La columna existente se reutiliza: las lecturas anteriores se conservan hasta
volver a sugerirlas y guardar. Para otros idiomas,
se pide la romanización convencional, como pinyin con tonos para mandarín.
Si cambiás el original, la app avisa que revises sus ayudas.

**Mostrar/ocultar pronunciación** controla ambas ayudas japonesas a la vez.
En los ejercicios, sólo aparecen cuando el original está visible; el audio
siempre lee el original. La búsqueda también encuentra furigana y romanización.

CSV y TSV permiten mapear columnas opcionales de pronunciación y furigana.
Los archivos de dos columnas siguen funcionando. HTML y Markdown muestran
objetivo | pronunciación | traducción; en japonés, el desglose con furigana precede a romaji.
Si ninguna frase incluida tiene ayudas, se conservan las dos columnas.
La vista previa permite editar las ayudas y **Guardar pronunciación** las
actualiza en la planilla antes de descargar; las demás ediciones sólo afectan
el HTML. Guardar cambios en el original, la traducción o las ayudas quita la
marca **Incluida en material**, para volver a generar la frase corregida.

Verificación local: ejecutá los `test-*.mjs` con Node. Las pruebas no requieren
dependencias adicionales, salvo `test-preview-flow.mjs`, que usa Firefox
instalado para comprobar la edición de la vista previa y el audio al revelar.
