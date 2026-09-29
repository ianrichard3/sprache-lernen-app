# deutsch-lernen-app

## Deploy

Cada push a `main` sincroniza el código y redepliega la web app en la misma
URL: <https://script.google.com/macros/s/AKfycbzev-d6D3ftvGW6afcHONQQgX4vs8h5fiTTejgNBVGjnHU2fKDXgno2uaQdUIb1AfEt/exec>.
El repositorio es la fuente de verdad: no edites el código en el editor de Apps
Script porque el próximo push lo reemplaza.

El workflow usa los secrets `CLASPRC_JSON` y `CLASP_JSON`; no los agregues al
repositorio.

La web app es privada. En una copia nueva, su proyecto de Apps Script queda
vinculado al Sheet desde el que abrís **Frases → Abrir frases** por primera vez.
Esa apertura también permite usar luego la URL de la web app. Si entrás primero
por la URL de la copia, la app te indica que la abras una vez desde el menú del
Sheet. El despliegue de producción conserva la planilla original.

Para usar el código en otra planilla, creá su Apps Script desde **Extensiones →
Apps Script**, copiá `Code.gs`, `Ai.gs` y `App.html`, recargá el Sheet y abrí
**Frases → Abrir frases**. Elegí el idioma objetivo en la configuración inicial.
Cada proyecto conserva su propio idioma y su propia planilla; el CI de este
repositorio sigue desplegando únicamente la instalación alemana original. Si
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
descarga Markdown para usarla con otro editor. Ejecutá **Frases → Preparar
hoja** una vez para aplicar la columna `Incluida en material`.

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
traducción natural al español, usando la misma clave Gemini.
Revisá y editá los resultados, marcá las frases y elegí una o varias colecciones
existentes. **Agregar seleccionadas** guarda sólo las marcadas en todos los
destinos elegidos. Si una frase ya existe, conserva su traducción y progreso y
se agrega a las colecciones que falten.

Los borradores se conservan al navegar entre secciones, pero se pierden al
recargar o cerrar la app. Generar otra tanda pide confirmar el descarte de los
borradores pendientes y los reemplaza sólo si la generación termina bien.
