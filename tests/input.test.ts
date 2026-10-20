import { it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readSource, makeTable, parseDelimited } from '../src/input';
import { compare } from '../src/compare';
import type { Selection } from '../src/types';
it('BOM·인용쉼표·한글·행 좌표 보존', async () => {
  const s = await readSource('a.csv', new TextEncoder().encode('\uFEFFid,금액\r\n01,"1,200"\r\n'));
  const t = makeTable(s, 'CSV'); expect(t.rows).toHaveLength(1);
  expect(t.rows[0][1]).toMatchObject({ text: '1,200', ref: 'CSV!B2' }); expect(s.sha256).toHaveLength(64);
});
it('다중행 CSV는 논리 레코드 번호', () => {
  const s = parseDelimited('id,amount\n"A\nB",10\nC,20');
  expect(s.rows[2][1].ref).toBe('CSV!B3');
});
it.each(['id,id\nA,1', 'id,,amount\nA,B,1', 'id,amount\nA,1,extra'])('위험한 표 구조 거부', async csv => {
  const s = await readSource('a.csv', new TextEncoder().encode(csv));
  expect(() => makeTable(s, 'CSV')).toThrow();
});
it('닫히지 않은 인용부호 거부', () => expect(() => parseDelimited('id,amount\n"A,10')).toThrow());
it('잘못된 UTF-8은 교체문자로 덮지 않음', async () => {
  await expect(readSource('a.csv', new Uint8Array([0xff, 0xff]))).rejects.toThrow();
});
it('한도 초과와 구형 XLS 거부', async () => {
  await expect(readSource('a.csv', new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow('5MB');
  await expect(readSource('a.xls', new Uint8Array())).rejects.toThrow('XLSX');
});
it('실제 XLSX 읽기: 시트 선택, 수식·숫자 식별자 감지', async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('사업');
  sheet.addRow(['id', '금액']); sheet.addRow([1, { formula: '1+2', result: 3 }]);
  const s = await readSource('a.xlsx', new Uint8Array(await book.xlsx.writeBuffer()));
  const t = makeTable(s, '사업'); expect(t.rows[0][0].numeric).toBe(true);
  expect(t.rows[0][1]).toMatchObject({ ref: '사업!B2', formula: '1+2' });
});
it('제목 위 병합은 허용, 데이터 병합은 거부', async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('예산');
  sheet.mergeCells('A1:B1'); sheet.getCell('A1').value = '제목';
  sheet.addRow(['id', '금액']); sheet.addRow(['A', 10]);
  const s = await readSource('a.xlsx', new Uint8Array(await book.xlsx.writeBuffer()));
  expect(makeTable(s, '예산', 2).rows).toHaveLength(1);
  sheet.mergeCells('A3:B3');
  const merged = await readSource('a.xlsx', new Uint8Array(await book.xlsx.writeBuffer()));
  expect(() => makeTable(merged, '예산', 2)).toThrow('병합');
});
it('손상된 XLSX 빠르게 거부', async () => {
  await expect(readSource('a.xlsx', new Uint8Array([1, 2, 3]))).rejects.toThrow('ZIP');
});
it('XLSX의 안전 범위 밖 숫자는 확정 금액으로 사용하지 않음', async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('예산');
  sheet.addRow(['id', '금액']); sheet.addRow(['A', 9007199254740992]);
  const source = await readSource('large.xlsx', new Uint8Array(await book.xlsx.writeBuffer()));
  const table = makeTable(source, '예산');
  const setting: Selection = { keys: ['id'], amount: '금액', unit: '원', basis: 'budget', period: '2025' };
  const result = compare(table, table, setting, setting);
  expect(result.changes[0].status).toBe('unresolved');
  expect(result.summary.netDeltaWon).toBeUndefined();
  expect(result.issues[0].message).toContain('안전한 정수');
});
