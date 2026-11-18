import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeText, headerFingerprint, parseCsv, proposeCsvMapping, rowsFromCsv } from '../../src/domain/csv';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/csv', name)));

describe('decodeText', () => {
  it('reads UTF-8 with a BOM and drops the BOM', () => {
    const { text, encoding } = decodeText(fixture('signed-utf8-bom.csv'));
    expect(encoding).toBe('utf-8');
    expect(text.startsWith('Date,')).toBe(true);
  });

  it('falls back to Windows-1252 for French bank exports', () => {
    const { text, encoding } = decodeText(fixture('debit-credit-cp1252.csv'));
    expect(encoding).toBe('windows-1252');
    expect(text).toContain('Libellé');
    expect(text).toContain('CAFÉ');
  });

  it('decodes the euro sign and curly quotes of Windows-1252', () => {
    expect(decodeText(new Uint8Array([0x80, 0x20, 0x92])).text).toBe('€ ’');
  });

  it('reads plain UTF-8 accents', () => {
    expect(decodeText(new TextEncoder().encode('élan')).text).toBe('élan');
  });
});

describe('parseCsv', () => {
  it('detects the delimiter and handles quotes, escaped quotes, CRLF and newlines in fields', () => {
    const { delimiter, rows } = parseCsv(decodeText(fixture('signed-utf8-bom.csv')).text);
    expect(delimiter).toBe(',');
    expect(rows).toEqual([
      ['Date', 'Label', 'Amount'],
      ['2026-11-12', 'Leclerc, Brest', '-104.47'],
      ['2026-11-13', 'Remboursement "Amazon"', '25.00'],
      ['2026-11-14', 'Ligne\r\nsur deux', '-3.20'],
    ]);
  });

  it('detects semicolons', () => {
    expect(parseCsv('a;b;c\n1;2;3\n').delimiter).toBe(';');
    expect(parseCsv('a\tb\n1\t2').delimiter).toBe('\t');
  });
});

describe('proposeCsvMapping', () => {
  it('finds the header row below a title and the debit / credit columns', () => {
    const { text, encoding } = decodeText(fixture('debit-credit-cp1252.csv'));
    const { delimiter, rows } = parseCsv(text);
    const mapping = proposeCsvMapping(rows, delimiter, encoding);
    expect(mapping).toEqual({
      delimiter: ';',
      encoding: 'windows-1252',
      dateColumn: 0,
      dateFormat: 'DD/MM/YYYY',
      labelColumns: [1],
      amountColumn: null,
      debitColumn: 2,
      creditColumn: 3,
      skipRows: 1,
    });
  });

  it('finds a signed amount column and ISO dates', () => {
    const { text, encoding } = decodeText(fixture('signed-utf8-bom.csv'));
    const { delimiter, rows } = parseCsv(text);
    expect(proposeCsvMapping(rows, delimiter, encoding)).toMatchObject({
      dateColumn: 0,
      dateFormat: 'YYYY-MM-DD',
      labelColumns: [1],
      amountColumn: 2,
      debitColumn: null,
      creditColumn: null,
      skipRows: 0,
    });
  });

  it('returns null when no header is recognized', () => {
    expect(proposeCsvMapping([['x', 'y'], ['1', '2']], ',', 'utf-8')).toBeNull();
  });
});

describe('rowsFromCsv', () => {
  it('reads debit/credit rows as expenses and credits, in cents', () => {
    const { text, encoding } = decodeText(fixture('debit-credit-cp1252.csv'));
    const { delimiter, rows } = parseCsv(text);
    const mapping = proposeCsvMapping(rows, delimiter, encoding)!;
    expect(rowsFromCsv(rows, mapping, 'EUR')).toEqual([
      { index: 0, date: '2026-11-12', direction: 'debit', amountMinor: 10447n, label: 'CB LECLERC 12/11', error: null },
      { index: 1, date: '2026-11-13', direction: 'debit', amountMinor: 1999n, label: 'PRLV SEPA FREE MOBILE', error: null },
      { index: 2, date: '2026-11-14', direction: 'credit', amountMinor: 299000n, label: 'VIR SALAIRE NOVEMBRE', error: null },
      { index: 3, date: '2026-11-15', direction: 'debit', amountMinor: 450n, label: 'CB CAFÉ DE LA GARE', error: null },
    ]);
  });

  it('reads signed amounts and flags unreadable rows', () => {
    const rows = [
      ['Date', 'Label', 'Amount'],
      ['2026-11-12', 'Leclerc', '-104.47'],
      ['2026-11-13', 'Amazon', '+25,00'],
      ['31/02/2026', 'Bad date', '-1'],
      ['2026-11-14', 'Bad amount', 'abc'],
      ['2026-11-15', 'Zero', '0'],
    ];
    const mapping = proposeCsvMapping(rows, ',', 'utf-8')!;
    const out = rowsFromCsv(rows, mapping, 'EUR');
    expect(out[0]).toMatchObject({ direction: 'debit', amountMinor: 10447n, error: null });
    expect(out[1]).toMatchObject({ direction: 'credit', amountMinor: 2500n, error: null });
    expect(out[2]).toMatchObject({ date: null, error: 'UNREADABLE_DATE' });
    expect(out[3]).toMatchObject({ amountMinor: null, error: 'UNREADABLE_AMOUNT' });
    expect(out[4]).toMatchObject({ error: 'UNREADABLE_AMOUNT' });
  });
});

describe('headerFingerprint', () => {
  it('is stable across case, accents and spacing', () => {
    expect(headerFingerprint(['Date', ' Libellé ', 'Débit'])).toBe(headerFingerprint(['date', 'libelle', 'DEBIT']));
    expect(headerFingerprint(['Date', 'Libellé'])).not.toBe(headerFingerprint(['Date', 'Montant']));
  });
});
