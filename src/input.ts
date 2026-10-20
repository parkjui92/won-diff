import Papa from 'papaparse';
import type { Cell, Source, Sheet, Table } from './types';
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 10000;
const MAX_COLUMNS = 100;
export const columnName = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : columnName(Math.floor(index / 26) - 1) + columnName(index % 26);
export function parseDelimited(text: string, delimiter = ''): Sheet {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter, skipEmptyLines: false });
  const errors = parsed.errors.filter(e => e.code !== 'UndetectableDelimiter');
  if (errors.length) throw new Error(`CSV 형식 오류: ${errors[0].message}`);
  if (parsed.data.length > MAX_ROWS + 100) throw new Error('헤더 포함 10,100행을 넘는 파일은 지원하지 않습니다.');
  return {
    name: 'CSV', rows: parsed.data.map((row, r) => {
      if (row.length > MAX_COLUMNS) throw new Error('100열 초과 파일은 지원하지 않습니다.');
      return row.map((text, c) => ({ text, ref: `CSV!${columnName(c)}${r + 1}` }));
    })
  };
}

// Check ZIP central-directory expanded size before loading XLSX into memory.
function checkZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('올바른 XLSX ZIP 파일이 아닙니다.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), total = 0;
  if (count > 2000 || count === 0) throw new Error('XLSX 내부 파일 수가 지원 범위를 벗어납니다.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('손상된 XLSX 디렉터리입니다.');
    if (view.getUint16(offset + 8, true) & 1) throw new Error('암호화된 XLSX는 지원하지 않습니다.');
    total += view.getUint32(offset + 24, true);
    if (total > 40 * 1024 * 1024) throw new Error('압축 해제 후 40MB를 초과하는 XLSX는 지원하지 않습니다.');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

export async function readSource(name: string, bytes: Uint8Array, encoding: 'utf-8' | 'euc-kr' = 'utf-8'): Promise<Source> {
  if (bytes.byteLength > MAX_BYTES) throw new Error('파일 하나당 5MB까지 지원합니다.');
  const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  const sha256 = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
  let sheets: Sheet[];
  if (/\.xlsx$/i.test(name)) {
    checkZip(bytes);
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
    sheets = book.worksheets.map(sheet => {
      if (sheet.rowCount > MAX_ROWS + 100 || sheet.columnCount > MAX_COLUMNS) throw new Error('XLSX는 시트당 10,100행·100열까지 지원합니다.');
      const rows: Cell[][] = [];
      for (let r = 1; r <= sheet.rowCount; r++) {
        const row: Cell[] = [];
        for (let c = 1; c <= sheet.columnCount; c++) {
          const cell = sheet.getCell(r, c), value = cell.value;
          let text = '', formula: string | undefined;
          if (value !== null && value !== undefined) {
            if (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
              formula = cell.formula || '[shared formula]'; text = `=${formula}`;
            } else if (value instanceof Date) text = value.toISOString();
            else text = cell.text;
          }
          row.push({
            text, ref: `${sheet.name}!${cell.address}`, formula, numeric: typeof value === 'number',
            unsafeNumeric: typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
          });
        }
        rows.push(row);
      }
      return { name: sheet.name, rows, merges: sheet.model.merges };
    });
  } else if (/\.(csv|tsv|txt)$/i.test(name)) {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    sheets = [parseDelimited(text, /\.tsv$/i.test(name) ? '\t' : '')];
  } else throw new Error('CSV, TSV, XLSX 파일을 선택하세요. 구형 XLS는 XLSX로 저장해야 합니다.');
  if (!sheets.length) throw new Error('데이터 시트가 없습니다.');
  return { name, sha256, sheets };
}

export function makeTable(source: Source, sheetName: string, headerRow = 1): Table {
  const sheet = source.sheets.find(s => s.name === sheetName);
  if (!sheet) throw new Error('시트를 찾지 못했습니다.');
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > sheet.rows.length) throw new Error('올바른 헤더 행 번호를 입력하세요.');
  const raw = sheet.rows[headerRow - 1];
  let width = raw.length;
  while (width > 0 && !raw[width - 1].text.trim()) width--;
  const headers = raw.slice(0, width).map(c => c.text.normalize('NFC').trim());
  if (!headers.length || headers.some(h => !h)) throw new Error('헤더 이름이 비어 있습니다. 표의 열 제목이 있는 행을 선택하세요.');
  if (new Set(headers).size !== headers.length) throw new Error('중복된 헤더 이름이 있습니다. 열 이름을 고유하게 정리하세요.');
  if (raw.some(c => c.formula)) throw new Error('수식 헤더는 지원하지 않습니다.');
  if (sheet.merges?.some(range => Number(range.split(':').at(-1)!.replace(/[A-Z]/g, '')) >= headerRow)) throw new Error('헤더·데이터 영역에 병합 셀이 있습니다. 병합을 풀고 평면 표로 정리하세요.');
  const rows = sheet.rows.slice(headerRow).filter(row => row.some(c => c.text.trim())).map(row => {
    if (row.slice(width).some(c => c.text.trim())) throw new Error('헤더보다 넓은 데이터 행이 있습니다.');
    return headers.map((_, i) => row[i] ?? { text: '', ref: `${sheet.name}!${columnName(i)}?` });
  });
  if (!rows.length) throw new Error('헤더 아래에 데이터가 없습니다.');
  if (rows.length > MAX_ROWS) throw new Error('상세 데이터는 10,000행까지 지원합니다.');
  return { source: source.name, sha256: source.sha256, sheet: sheet.name, headers, rows };
}
