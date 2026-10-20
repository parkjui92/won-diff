import { it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const base = ['--import', 'tsx', 'src/cli.ts', 'examples/kiat-2023-백만원.csv', 'examples/kiat-2024-억원.csv', '--config', 'examples/mapping.json'];
it('CLI 실제 예제 결과와 변경 종료 코드', () => {
  const output = spawnSync(process.execPath, [...base, '--fail-on-change'], { encoding: 'utf8' });
  expect(output.status).toBe(2);
  expect(JSON.parse(output.stdout).summary.netDeltaWon).toBe('2869000000');
});
it('기준 불일치는 검토 필요 종료 코드 3', () => {
  const output = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'examples/kiat-2024-백만원.csv', 'examples/kiat-2025-백만원.csv', '--config', 'examples/basis-mapping.json'], { encoding: 'utf8' });
  expect(output.status).toBe(3);
  expect(JSON.parse(output.stdout).basisComparable).toBe(false);
});
it('CLI 원본·기존 파일 덮어쓰기 거부', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'won-diff-test-'));
  const path = join(dir, 'keep.json'); await writeFile(path, 'preserve');
  const output = spawnSync(process.execPath, [...base, '--out', path], { encoding: 'utf8' });
  expect(output.status).toBe(1);
  expect(await readFile(path, 'utf8')).toBe('preserve');
});
it('CLI JSON과 CSV를 함께 생성하고 BOM 보존', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'won-diff-test-'));
  const output = spawnSync(process.execPath, [...base, '--out', join(dir, 'out.json'), '--csv', join(dir, 'out.csv')], { encoding: 'utf8' });
  expect(output.status).toBe(0);
  expect(JSON.parse(await readFile(join(dir, 'out.json'), 'utf8')).valid).toBe(true);
  expect((await readFile(join(dir, 'out.csv'), 'utf8')).startsWith('\uFEFF')).toBe(true);
});
