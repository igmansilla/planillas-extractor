import * as XLSX from 'xlsx';
import type { Column, PhotoItem } from '../types';

// Arma una hoja con SheetJS y dispara la descarga.
// Encabezados = labels configurados + metadatos _foto y _estado.
// Cada fila (keyed por column.key) se re-mapea a los labels visibles.
export function exportXlsx(photos: PhotoItem[], columns: Column[]): void {
  const aoa: (string | undefined)[][] = [];
  const header = [...columns.map((c) => c.label), '_foto', '_estado'];
  aoa.push(header);

  for (const photo of photos) {
    if (photo.rows.length === 0) {
      // Foto sin filas (error/REVISAR sin datos): igual dejamos rastro en el reporte.
      if (photo.status === 'error' || photo.status === 'REVISAR') {
        aoa.push([...columns.map(() => ''), photo.name, photo.status]);
      }
      continue;
    }
    for (const row of photo.rows) {
      aoa.push([...columns.map((c) => row[c.key] ?? ''), photo.name, photo.status]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planillas');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `planillas-${stamp}.xlsx`);
}
