import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('공개자료 전체 흐름: 계산·필터·근거·다운로드·설정 변경', async ({ page }) => {
  const writes: string[] = [], errors: string[] = [];
  page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'KIAT 공개자료로 살펴보기' }).click();
  await page.getByRole('button', { name: '변경사항 검토하기' }).click();
  await expect(page.getByText('숫자가 바뀐 이유를 구분했습니다')).toBeVisible();
  await expect(page.locator('.summary-grid')).toContainText('28.69');
  await page.getByRole('button', { name: '표기·단위만 변경 1', exact: true }).click();
  await expect(page.locator('.changes tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '출연금 근거' }).click();
  await expect(page.getByRole('dialog')).toContainText('CSV!B2');
  await expect(page.getByRole('dialog')).toContainText('6,826,000,000원');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '근거 JSON' }).click();
  const download = await downloading;
  const stream = await download.createReadStream(); let content = '';
  for await (const chunk of stream) content += chunk.toString();
  const report = JSON.parse(content);
  expect(report.summary.netDeltaWon).toBe('2869000000');
  expect(report.sources.before.sha256).toMatch(/^[0-9a-f]{64}$/);
  await page.locator('#after').getByLabel('회계 기준').selectOption('budget');
  await expect(page.getByText('입력이 바뀌었습니다. 다시 비교하세요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '근거 JSON' })).toHaveCount(0);
  await page.getByRole('button', { name: '변경사항 검토하기' }).click();
  await expect(page.locator('.issues')).toContainText('증감률은 계산하지 않습니다');
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});

test('CSV 직접 업로드와 중복 키 차단', async ({ page }) => {
  await page.goto('/');
  for (const side of ['before', 'after']) {
    await page.locator(`#${side} input[type=file]`).setInputFiles({
      name: `${side}.csv`, mimeType: 'text/csv',
      buffer: Buffer.from(side === 'before' ? 'id,금액\nA,100\nA,200' : 'id,금액\nA,300')
    });
  }
  await page.getByRole('button', { name: '변경사항 검토하기' }).click();
  await expect(page.locator('.issues')).toContainText('중복 식별자');
  await expect(page.getByRole('button', { name: '변경표 CSV' })).toBeDisabled();
  await expect(page.locator('.summary-grid')).toHaveCount(0);
});

test('XLSX 수식과 파일 손상 표시', async ({ page }) => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('사업');
  sheet.addRow(['코드', '금액']); sheet.addRow(['A', { formula: '100+20', result: 120 }]);
  await page.goto('/');
  await page.locator('#before input[type=file]').setInputFiles({
    name: 'formula.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await workbook.xlsx.writeBuffer())
  });
  await page.locator('#after input[type=file]').setInputFiles({ name: 'value.csv', mimeType: 'text/csv', buffer: Buffer.from('코드,금액\nA,120') });
  await page.getByRole('button', { name: '변경사항 검토하기' }).click();
  await expect(page.locator('.issues')).toContainText('수식 셀');
  await expect(page.locator('.changes')).toContainText('확인 필요');
  await page.locator('#before input[type=file]').setInputFiles({ name: 'broken.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.locator('#before [role=alert]')).toContainText('올바른 XLSX');
  await expect(page.getByRole('button', { name: '변경사항 검토하기' })).toBeDisabled();
});

test('사용자 문자열은 HTML로 실행되지 않음', async ({ page }) => {
  await page.goto('/');
  for (const side of ['before', 'after']) {
    await page.locator(`#${side} input[type=file]`).setInputFiles({
      name: 'input.csv', mimeType: 'text/csv', buffer: Buffer.from('id,금액\n<img src=x onerror=alert(1)>,10')
    });
  }
  await page.getByRole('button', { name: '변경사항 검토하기' }).click();
  await expect(page.locator('.changes img')).toHaveCount(0);
  await expect(page.locator('.changes')).toContainText('<img src=x onerror=alert(1)>');
});

test('모바일 화면과 키보드 조작', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'KIAT 공개자료로 살펴보기' }).click();
  await page.getByRole('button', { name: '변경사항 검토하기' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '출연금 근거' }).focus();
  await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('오프라인 단일 HTML은 네트워크 없이 XLSX를 비교', async ({ context, page }) => {
  await context.setOffline(true);
  const requests: string[] = [];
  page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await page.goto(pathToFileURL(resolve('dist/won-diff.html')).href);
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('예산');
  sheet.addRow(['id', '금액']); sheet.addRow(['A', 100]);
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  for (const side of ['before', 'after']) {
    await page.locator(`#${side} input[type=file]`).setInputFiles({ name: 'local.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes });
  }
  await page.getByRole('button', { name: '변경사항 검토하기' }).click();
  await expect(page.locator('.changes')).toContainText('동일');
  expect(requests).toEqual([]);
});
