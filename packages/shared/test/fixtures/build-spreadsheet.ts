import * as XLSX from 'xlsx';
import type { Grid } from '../../src/domain/import/types';

/**
 * The household spreadsheet as it looks today (T107): one sheet per month, a column per member,
 * section rows DI / DCR / DCE, a "Reste" row, the Spotify amount typed as text "12,5" and one
 * unreadable amount ("douze").
 */
function sheet(withBadRow: boolean): Grid {
  const rows: Grid = [
    ['Budget', 'Maëlle', 'Fabien'],
    ['Revenus', null, null],
    ['Salaire', 2000, 2990],
    ['Swile', null, 160],
    ['DI', null, null],
    ['Forfait mobile', 15, 19.99],
    ['Spotify', '12,5', null],
    ['Psy', 60, null],
    ['Salle de sport', 29.9, null],
    ['Livret A', 26.92, null],
    ['Assurance vie', null, 300],
    ['Escalade', null, 55],
    ['Abonnements', null, 14.33],
    ['PEA', null, 200],
    ['DCR', null, null],
    ['Loyer', 950, 950],
    ['Courses', 100, 300],
    ['Électricité', 60, 60],
    ['Carburant', 50, 230],
    ['Assurance habitation', 12.52, 12.52],
    ['Chats', 45, 45],
    ['Streaming', 15, 15],
    ['Restaurants', 100, 100],
    ['Épargne commune', 255, 255],
    ['DCE', null, null],
    ['Cadeaux de Noël', 275, 275],
  ];
  if (withBadRow) rows.push(['Ponceuse', 'douze', null]);
  rows.push(['Total', 2131.84, 2831.84], ['Reste', 144.26, 158.16]);
  return rows;
}

export const SHEET_NAMES = ['Septembre 2026', 'Octobre 2026', 'Novembre 2026'] as const;

/** Cell grids per sheet, as the importer receives them. Only November has the unreadable row. */
export function grids(): Record<string, Grid> {
  return Object.fromEntries(SHEET_NAMES.map((name) => [name, sheet(name === 'Novembre 2026')]));
}

/** The same workbook as file bytes. */
export function workbookBytes(bookType: 'xlsx' | 'ods'): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, grid] of Object.entries(grids()))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), name);
  return XLSX.write(wb, { type: 'array', bookType }) as Uint8Array;
}
