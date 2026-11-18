import { decodeText, parseCsv } from '@two-cents/shared/domain';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

/**
 * Picks a bank CSV and reads it on the device (research R11): the raw file never leaves the phone,
 * only the rows the person confirms are sent.
 */
export async function pickCsv(): Promise<{ text: string; encoding: 'utf-8' | 'windows-1252'; delimiter: ';' | ',' | '\t'; rows: string[][] } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const file = new File(result.assets[0].uri);
  const bytes = await file.bytes();
  const { text, encoding } = decodeText(bytes);
  const { delimiter, rows } = parseCsv(text);
  try {
    file.delete();
  } catch {
    // Cache copy already gone.
  }
  return { text, encoding, delimiter, rows };
}
