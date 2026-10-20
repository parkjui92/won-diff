import type { Money, Unit } from './money';

export type Cell = { text: string; ref: string; formula?: string; numeric?: boolean; unsafeNumeric?: boolean };
export type Sheet = { name: string; rows: Cell[][]; merges?: string[] };
export type Source = { name: string; sha256: string; sheets: Sheet[] };
export type Table = { source: string; sha256: string; sheet: string; headers: string[]; rows: Cell[][] };
export type Selection = {
  keys: string[];
  amount: string;
  unit: Unit | 'cell';
  basis: 'budget' | 'settlement' | 'proposal' | 'other' | 'unknown';
  period: string;
  totalKey?: string[];
};
export type Issue = { code: string; message: string; side?: 'before' | 'after'; ref?: string; blocking: boolean };
export type Entry = { key: string[]; raw: string; ref: string; money: Money };
export type Change = {
  key: string[];
  status: 'changed' | 'representation' | 'unchanged' | 'added' | 'removed' | 'unresolved';
  before?: Entry; after?: Entry; deltaWon?: string; percent?: string; percentReason?: string;
};
export type SideSummary = {
  knownSumWon: string; complete: boolean; detailRows: number; unresolvedRows: number;
  control?: { entry: Entry; differenceWon?: string; matches?: boolean };
};
export type Report = {
  schemaVersion: '1.0'; valid: boolean;
  sources: { before: Omit<Table, 'rows'>; after: Omit<Table, 'rows'> };
  settings: { before: Selection; after: Selection };
  basisComparable: boolean;
  issues: Issue[]; changes: Change[];
  summary: { before: SideSummary; after: SideSummary; netDeltaWon?: string; counts: Record<Change['status'], number> };
};
