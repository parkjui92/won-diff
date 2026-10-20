import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import Papa from 'papaparse';
import { compare } from '../src/compare';
import { D } from '../src/money';
import { parseDelimited, makeTable } from '../src/input';
import type { Selection } from '../src/types';
const require = createRequire(import.meta.url);
const daff = require('daff');
const cases = JSON.parse(await readFile('benchmarks/cases.json', 'utf8')) as { id: string; case: string; before: string; after: string; beforeWon: string; afterWon: string }[];
const python = process.env.BENCH_PYTHON ?? '.venv/bin/python';
const baselines = JSON.parse(execFileSync(python, ['benchmarks/baselines.py', 'benchmarks/cases.json'], { encoding: 'utf8' }));
const raw = { ...baselines.raw, daff: {} as Record<string, boolean>, 'won-diff': {} as Record<string, boolean> };
const normalized = { ...baselines.normalized, daff: {} as Record<string, boolean> };
const s: Selection = { keys: ['id'], amount: 'amount', unit: '원', basis: 'budget', period: 'benchmark' };
const table = (id: string, amount: string) => makeTable({ name: 'fixture.csv', sha256: 'fixture', sheets: [parseDelimited(Papa.unparse([['id', 'amount'], [id, amount]]))] }, 'CSV');
function daffChanged(id: string, a: string, b: string) {
  const flags = new daff.CompareFlags(); flags.addPrimaryKey('id'); flags.ordered = false; flags.unchanged_context = 0;
  const output: string[][] = [];
  new daff.TableDiff(daff.compareTables(new daff.TableView([['id', 'amount'], [id, a]]), new daff.TableView([['id', 'amount'], [id, b]])).align(), flags).hilite(new daff.TableView(output));
  return output.some(row => row[0].includes('->'));
}
for (const c of cases) {
  raw.daff[c.id] = daffChanged(c.id, c.before, c.after);
  normalized.daff[c.id] = daffChanged(c.id, c.beforeWon, c.afterWon);
  const report = compare(table(c.id, c.before), table(c.id, c.after), s, s);
  if (!report.valid || report.changes[0].status === 'unresolved') throw new Error(`Unresolved case: ${c.id}`);
  raw['won-diff'][c.id] = report.changes[0].status === 'changed';
}
function metrics(results: Record<string, Record<string, boolean>>) {
  return Object.fromEntries(Object.entries(results).map(([tool, predictions]) => {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const c of cases) {
      const truth = !new D(c.beforeWon).eq(c.afterWon), prediction = predictions[c.id];
      if (prediction && truth) tp++; else if (prediction) fp++; else if (truth) fn++; else tn++;
    }
    return [tool, { tp, fp, tn, fn, correct: tp + tn, total: cases.length, precision: tp / (tp + fp), recall: tp / (tp + fn) }];
  }));
}
const result = {
  date: '2026-10-21',
  task: '24 authored pairs, binary REAL MONEY CHANGE classification; not a general-purpose diff ranking',
  versions: { ...baselines.versions, daff: require('daff/package.json').version, 'won-diff': '0.1.0', node: process.version },
  raw: { metrics: metrics(raw), predictions: raw },
  independentNormalizationControl: { metrics: metrics(normalized), predictions: normalized },
  cases
};
await writeFile('benchmarks/results.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ raw: result.raw.metrics, normalized: result.independentNormalizationControl.metrics }, null, 2));
if (result.raw.metrics['won-diff'].correct !== cases.length) process.exitCode = 1;
