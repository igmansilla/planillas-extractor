# Extractor de Planillas → Excel (web mobile-first)

## Contexto

El papá de Ignacio tiene planillas en papel a las que les saca fotos y necesita extraer sus datos. Hoy usa Gemini por la web, pero **no puede subir más de X fotos por request**, lo que hace el trabajo lento y manual. Tiene un **token de API de Gemini (pago)**.

La solución: una **app web mobile-first** donde suba todas las fotos de una vez y, usando la **API de Gemini**, extraiga los datos de todas las planillas y los descargue en un **Excel**. La app resuelve el límite de fotos procesando en **lotes automáticos** contra la API (que no tiene el tope de la UI web).

## Decisiones ya tomadas (con el usuario)

- **Formato de planillas:** todas iguales (esquema fijo de columnas).
- **Columnas:** **configurables dentro de la app** (pantalla de configuración, sin tocar código).
- **Datos por foto:** cada foto es una **tabla con muchas filas**; en el Excel se vuelcan todas las filas de todas las fotos, una debajo de otra.
- **Volumen:** 50+ fotos por vez → lotes con reintentos y progreso persistente.
- **Errores:** **marcar y seguir** (celda con `REVISAR`), y reporte final de fotos con problemas.
- **Hosting / token:** **100% en el navegador**. El token de Gemini lo pega el papá una vez y queda guardado solo en su teléfono (`localStorage`). Llamadas directas del navegador a la API de Gemini. Sin backend.
- **Stack:** **Vite + React + TypeScript**, deploy gratis en **GitHub Pages**.
- **Modelo:** **elegible desde la app** — se pide la lista de modelos a la API con el token y se elige; por defecto el Pro de visión más nuevo.

## Arquitectura

App estática (SPA) que corre íntegramente en el navegador. No hay servidor propio: el navegador llama directo a `https://generativelanguage.googleapis.com`.

```
[ Config ]  →  esquema de columnas + API key + modelo  (localStorage)
     │
[ Upload ]  →  fotos (input file multiple + cámara)
     │           ↓ compresión en canvas (máx ~1600px, JPEG ~0.8)
[ Cola de procesamiento ]  →  concurrencia limitada (~4) + reintentos backoff
     │           ↓ 1 request por foto, structured output (responseSchema)
[ Gemini API ]  →  JSON { filas: [ {col1, col2, ...}, ... ] }
     │
[ Resultados ]  →  todas las filas juntas + estado por foto  (IndexedDB para resume)
     │
[ Exportar ]  →  .xlsx (SheetJS)
```

### Módulos (cada uno con una responsabilidad clara)

- `src/lib/gemini.ts` — cliente de la API: `listModels(apiKey)` (GET `/v1beta/models`, filtra los que soportan `generateContent` + visión) y `extractRows(apiKey, model, imageBase64, schema, prompt)` (POST `generateContent` con `generationConfig.responseMimeType = "application/json"` y `responseSchema`). Maneja 429/5xx con backoff exponencial.
- `src/lib/image.ts` — `compressImage(file)`: redimensiona y comprime en `<canvas>`, devuelve base64 para `inlineData`.
- `src/lib/queue.ts` — procesa la lista de fotos con concurrencia configurable, reintentos y callbacks de progreso.
- `src/lib/schema.ts` — a partir de las columnas configuradas arma el `responseSchema` de Gemini (objeto `{ filas: array de objetos con esas claves, todas string }`) y el texto del prompt.
- `src/lib/excel.ts` — `exportXlsx(rows, columns)`: arma la hoja con SheetJS y dispara la descarga. Columnas = las configuradas + metadatos (`_foto`, `_estado`).
- `src/lib/storage.ts` — persistencia: config en `localStorage`; resultados/estado por foto en IndexedDB para poder **retomar si se corta**.
- `src/state/` — estado de la app (config, cola, resultados).

### Pantallas (mobile-first, en español)

1. **Configuración**
   - Campo para pegar el **API key** (guardado en `localStorage`, ofuscado en pantalla).
   - **Selector de modelo** poblado con `listModels` (default: Pro de visión más nuevo).
   - **Editor de columnas**: agregar/quitar/reordenar; cada columna con nombre y una *pista/descripción* opcional (mejora la extracción).
   - Vista previa del prompt generado.
2. **Subir y procesar**
   - `<input type="file" multiple accept="image/*" capture>` para elegir o sacar fotos.
   - Grilla de miniaturas con estado por foto: pendiente / procesando / ok / **REVISAR** / error.
   - Botón **Procesar**, barra de progreso global, botón **Reintentar fallidas**.
3. **Resultados**
   - Tabla con todas las filas extraídas y contador.
   - Lista de **fotos con problemas** (para rehacer o revisar).
   - Botón **Descargar Excel**.

### Prompt / structured output

Instrucción a Gemini: extractor de datos de planillas; se le pasan las columnas y sus descripciones; debe devolver JSON `{ "filas": [ ... ] }` con una entrada por fila detectada; si un dato no se lee poné `"REVISAR"`; **no inventar datos**. Se fuerza con `responseSchema` para que la salida sea siempre JSON válido y parseable (nada de regex sobre texto libre).

### Manejo de errores y límites

- **Marcar y seguir:** una foto que falla no frena el lote; queda con estado error/`REVISAR` y aparece en el reporte final.
- **Rate limits (429) / errores 5xx:** reintento con backoff exponencial (máx 3).
- **Concurrencia limitada** (~4 en paralelo, configurable) para no golpear el rate limit.
- **Resume:** las filas ya extraídas se guardan en IndexedDB; si se recarga la página, se conserva lo hecho y se continúa con lo que falta.
- **Compresión de imágenes** antes de enviar → menos tokens, menos costo, subida más rápida.

## Archivos a crear (greenfield)

Proyecto nuevo en `/home/ignacio/planillas-extractor/` (con `git init`):

- `package.json`, `vite.config.ts` (con `base` para GitHub Pages), `tsconfig.json`, `index.html`
- `src/main.tsx`, `src/App.tsx`
- `src/lib/{gemini,image,queue,schema,excel,storage}.ts`
- `src/screens/{Config,Upload,Results}.tsx`
- `src/state/…`
- Estilos mobile-first (CSS simple o Tailwind — a definir en implementación)
- `.github/workflows/deploy.yml` (deploy automático a GitHub Pages)
- `README.md` con instrucciones para el papá (cómo entrar, dónde pegar el token)

### Dependencias

- `react`, `react-dom`, `vite`, `typescript`
- `xlsx` (SheetJS) para el Excel
- Sin SDK de Gemini: `fetch` directo a la REST API (menos peso, control total del batching)

## Verificación (end-to-end)

1. `npm run dev` y abrir la app; simular viewport de teléfono.
2. **Config:** pegar un API key de prueba → verificar que `listModels` puebla el selector; definir 3-4 columnas.
3. **Procesamiento:** subir varias fotos de planilla de muestra → ver progreso, estados por foto y que se generan las filas. Probar una foto borrosa → debe quedar `REVISAR` y seguir.
4. **Excel:** descargar el `.xlsx` y verificar columnas + todas las filas de todas las fotos.
5. **Resume:** recargar a mitad de un lote → confirmar que lo ya procesado se conserva.
6. Automatizar el recorrido con el MCP de Playwright (mobile viewport). La llamada real a Gemini requiere el token del usuario; para tests sin token, mockear `gemini.ts` con una respuesta JSON de ejemplo.
7. `npm run build` sin errores y deploy de prueba a GitHub Pages.

## Fuera de alcance (YAGNI)

- Backend / login / multiusuario.
- Soporte de múltiples formatos de planilla (hoy: uno solo, columnas configurables).
- Edición manual de celdas dentro de la app (por ahora se corrige en el Excel descargado).
