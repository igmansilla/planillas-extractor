# Extractor de Planillas → Excel

App web mobile-first para extraer datos de fotos de planillas de papel usando la API de
Gemini y descargarlos en un Excel. Corre 100% en el navegador: no hay servidor y el token
queda guardado solo en tu teléfono.

## Para usarla (papá 👋)

1. Abrí la página en el teléfono.
2. En **Config**, pegá tu **token de API de Gemini** y tocá **Cargar modelos**. Elegí el
   modelo (viene seleccionado el Pro más nuevo).
3. Definí las **columnas** de la planilla (el nombre de cada columna, y opcionalmente una
   pista para ayudar a leerla). La *vista previa del prompt* te muestra qué se le pide a la IA.
4. Tocá **Continuar** → **Fotos**: elegí o sacá todas las fotos y tocá **Procesar**.
   - Cada foto muestra su estado: Pendiente / Procesando / OK / **REVISAR** / Error.
   - Si alguna falla, **Reintentar fallidas**. Si cerrás y volvés, se conserva lo procesado.
5. En **Resultados**, revisá las filas y tocá **Descargar Excel**. Las celdas que quedaron
   como `REVISAR` corregilas directo en el Excel.

El token queda guardado en tu teléfono (`localStorage`); no se manda a ningún servidor
nuestro, solo directo a Google.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm run build    # build de producción a dist/
npm run preview  # sirve el build
```

Stack: Vite + React + TypeScript, SheetJS para el Excel, `fetch` directo a la REST API de
Gemini (`generativelanguage.googleapis.com`). Sin backend.

## Deploy (GitHub Pages)

El workflow `.github/workflows/deploy.yml` construye y publica en cada push a `main`.
Activá Pages en el repo: **Settings → Pages → Source: GitHub Actions**. Como el build usa
rutas relativas (`base: './'`), funciona bajo cualquier `usuario.github.io/<repo>/`.
