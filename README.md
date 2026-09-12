# deutsch-lernen-app

## Deploy

Cada push a `main` sincroniza el código y redepliega la web app en la misma
URL: <https://script.google.com/macros/s/AKfycbzev-d6D3ftvGW6afcHONQQgX4vs8h5fiTTejgNBVGjnHU2fKDXgno2uaQdUIb1AfEt/exec>.
El repositorio es la fuente de verdad: no edites el código en el editor de Apps
Script porque el próximo push lo reemplaza.

El workflow usa los secrets `CLASPRC_JSON` y `CLASP_JSON`; no los agregues al
repositorio.

La web app es privada y usa la planilla de frases configurada en `Code.gs`.

## Datos y rendimiento

Al abrir, la app carga un único snapshot de frases, historial y colecciones.
Navegar entre pantallas y abrir colecciones usa ese estado local; las
mutaciones hacen una sola llamada y actualizan el estado recibido. Si editás
la planilla directamente mientras la app está abierta, usá **Actualizar datos**
antes de seguir trabajando para traer esos cambios sin pisarlos.

La pantalla **Material** descarga un archivo Markdown con las frases en tablas
de dos columnas. Podés convertirlo luego a PDF o DOCX desde tu editor preferido.
Ejecutá **Deutsch → Preparar hoja** una vez para aplicar la columna
`Incluida en material`.

## IA con Gemini

Creá una API key en Google AI Studio y guardala como `GEMINI_API_KEY` en las
Script Properties del proyecto de Apps Script. No la agregues al repositorio ni
a GitHub Secrets: el backend la lee al traducir o analizar etimología.

Después del próximo despliegue, autorizá el permiso de solicitudes externas de
Apps Script cuando Google lo pida.

## Audio de colecciones

El reproductor usa la voz alemana instalada en el navegador mediante Web Speech
API. No requiere API key, facturación ni guarda archivos MP3. Si el dispositivo
no tiene una voz alemana, la app lo indica y deja el resto de funciones usable.
