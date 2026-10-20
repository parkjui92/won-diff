#!/usr/bin/env node
import { readFile, writeFile, access } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { basename, resolve } from 'node:path';
import { readSource, makeTable } from './input';
import { compare } from './compare';
import { reportCSV, reportJSON } from './export';
import type { Selection } from './types';

const help = `won-diff — 한국어 예산표 변경 검토

node dist-cli/cli.mjs BEFORE.csv AFTER.xlsx --config mapping.json [--out result.json] [--csv changes.csv]

설정 파일 예:
{
  "before": {"keys":["사업코드"],"amount":"금액","unit":"백만원","basis":"settlement","period":"2023"},
  "after":  {"keys":["사업코드"],"amount":"금액","unit":"억원","basis":"settlement","period":"2024"}
}
각 설정에 sheet(시트명), headerRow(기본 1), encoding(utf-8/euc-kr), totalKey(["합계"])를 추가할 수 있습니다.
종료 코드: 0=비교 성공, 1=입력 오류, 2=--fail-on-change 사용 시 금액 변경·추가·삭제, 3=비교 성공하나 확인할 사항.
--help 도움말 / --version 버전 / --fail-on-change 변경 시 종료 코드 2
`;
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: 'boolean' }, version: { type: 'boolean' }, config: { type: 'string' }, out: { type: 'string' }, csv: { type: 'string' }, 'fail-on-change': { type: 'boolean' } }
  });
  if (values.help) { console.log(help); return; }
  if (values.version) { console.log('0.1.0'); return; }
  if (positionals.length !== 2 || !values.config) throw new Error(help);
  const outputPaths = [values.out, values.csv].filter((p): p is string => !!p).map(p => resolve(p));
  if (new Set(outputPaths).size !== outputPaths.length) throw new Error('JSON과 CSV 출력 경로가 같습니다.');
  for (const path of outputPaths) {
    try { await access(path); } catch { continue; }
    throw new Error(`기존 파일을 덮어쓰지 않습니다. 새 출력 경로를 지정하세요: ${path}`);
  }
  type InputConfig = Selection & { sheet?: string; headerRow?: number; encoding?: 'utf-8' | 'euc-kr' };
  const config = JSON.parse(await readFile(values.config, 'utf8')) as { before: InputConfig; after: InputConfig };
  const tables = await Promise.all(positionals.map(async (path, index) => {
    const selection = index === 0 ? config.before : config.after;
    if (!selection || !Array.isArray(selection.keys) || !selection.keys.every(k => typeof k === 'string') ||
      typeof selection.amount !== 'string' || typeof selection.period !== 'string') throw new Error('설정에 keys·amount·unit·basis·period를 지정하세요.');
    if (selection.encoding && !['utf-8', 'euc-kr'].includes(selection.encoding)) throw new Error('encoding은 utf-8 또는 euc-kr이어야 합니다.');
    const source = await readSource(basename(path), await readFile(path), selection.encoding);
    return makeTable(source, selection.sheet ?? source.sheets[0].name, selection.headerRow ?? 1);
  }));
  const report = compare(tables[0], tables[1], config.before, config.after);
  const json = reportJSON(report);
  if (values.out) await writeFile(values.out, json, { flag: 'wx' });
  else process.stdout.write(json);
  if (values.csv && report.valid) await writeFile(values.csv, reportCSV(report), { flag: 'wx' });
  // Invalid data and unresolved values take precedence over a change signal.
  if (!report.valid) process.exitCode = 1;
  else if (report.issues.length) process.exitCode = 3;
  else if (values['fail-on-change'] && report.changes.some(c => ['changed', 'added', 'removed'].includes(c.status))) process.exitCode = 2;
}
main().catch(error => { console.error(`won-diff: ${error.message}`); process.exitCode = 1; });
