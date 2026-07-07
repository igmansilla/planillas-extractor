// Redimensiona y comprime una imagen en <canvas> antes de enviarla a Gemini.
// Devuelve base64 SIN el prefijo "data:...;base64," (que es lo que espera inline_data).

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.8;

export interface CompressedImage {
  base64: string;
  mimeType: string;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return await createImageBitmap(file);
  }
  // Fallback para navegadores sin createImageBitmap.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await loadBitmap(file);
  const w = 'width' in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
  const h = 'height' in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;

  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto 2D');
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, cw, ch);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { base64, mimeType: 'image/jpeg' };
}
