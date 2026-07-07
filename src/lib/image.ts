// Decodifica, redimensiona y comprime imágenes en <canvas>.
//
// Clave para el celular: NUNCA mantener la foto en resolución completa más de lo
// necesario. Los celulares sacan fotos de 12+ MP (~48 MB descomprimida cada una);
// tener muchas en memoria a la vez agota la RAM del navegador ("memoria
// insuficiente"). Por eso:
//   - pedimos al navegador que reduzca la imagen ya durante el decode
//     (createImageBitmap con resizeWidth) para bajar el pico de memoria, y
//   - las miniaturas se generan como data URLs chiquitas (no object URLs a la
//     foto original), así la grilla no decodifica 50 fotos full-res.

const MAX_SIDE = 1600; // lado mayor de la imagen que se manda a Gemini
const JPEG_QUALITY = 0.8;
const THUMB_SIDE = 256; // lado mayor de la miniatura
const THUMB_QUALITY = 0.6;

export interface CompressedImage {
  base64: string;
  mimeType: string;
}

interface Loaded {
  src: CanvasImageSource;
  w: number;
  h: number;
  done: () => void;
}

// Decodifica el archivo pidiendo un ancho máximo (`hintWidth`). Cuando el navegador
// soporta las opciones de resize de createImageBitmap, esto reduce la imagen durante
// el decode y baja muchísimo el pico de memoria. Si no, cae a un decode normal.
async function loadBitmap(file: File, hintWidth: number): Promise<Loaded> {
  if ('createImageBitmap' in window) {
    try {
      // Solo resizeWidth: el navegador calcula el alto preservando el aspecto.
      const bmp = await createImageBitmap(file, {
        resizeWidth: hintWidth,
        resizeQuality: 'medium',
      });
      return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    } catch {
      // Navegador sin soporte de resize: decode normal (mayor pico, pero funciona).
    }
    try {
      const bmp = await createImageBitmap(file);
      return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    } catch {
      // Cae al fallback con <img>.
    }
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = url;
  });
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

// Dibuja la fuente en un canvas con el lado mayor limitado a `maxSide` y devuelve
// un data URL JPEG. Libera el canvas al final para ayudar al GC en móviles.
function renderToDataUrl(
  src: CanvasImageSource,
  w: number,
  h: number,
  maxSide: number,
  quality: number,
): string {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto 2D');
  ctx.drawImage(src, 0, 0, cw, ch);
  const url = canvas.toDataURL('image/jpeg', quality);
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

// Miniatura chica (data URL) para mostrar en la grilla sin cargar la foto full-res.
export async function makeThumbnail(file: File): Promise<string> {
  const { src, w, h, done } = await loadBitmap(file, THUMB_SIDE);
  try {
    return renderToDataUrl(src, w, h, THUMB_SIDE, THUMB_QUALITY);
  } finally {
    done();
  }
}

// Imagen comprimida (base64 sin el prefijo data:) para mandar a Gemini en inline_data.
export async function compressImage(file: File): Promise<CompressedImage> {
  const { src, w, h, done } = await loadBitmap(file, MAX_SIDE);
  try {
    const dataUrl = renderToDataUrl(src, w, h, MAX_SIDE, JPEG_QUALITY);
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' };
  } finally {
    done();
  }
}
