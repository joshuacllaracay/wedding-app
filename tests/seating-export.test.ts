import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seatingCsv } from '../src/lib/seating-export';

const rows = (csv: string) => csv.replace(/^\uFEFF/, '').split('\r\n').map(r => r.split(',').map(c => c.replace(/^"|"$/g, '')));

test('seating CSV matches the planner: one column per table, then not yet seated', () => {
  const csv = seatingCsv([
    { name: 'Table 2', capacity: 8, people: [{ name: 'test1' }, { name: 'test1stperson' }] },
    { name: 'Table 3', capacity: 4, people: [{ name: 'test2ndperson' }] },
    { name: 'sponsor', capacity: 5, people: [{ name: 'test4' }] },
  ], [{ name: 'test3' }]);
  assert.deepEqual(rows(csv), [
    ['Table 2', 'Table 3', 'sponsor', 'Not yet seated'],
    ['2/8 seated', '1/4 seated', '1/5 seated', '1 person'],
    ['test1', 'test2ndperson', 'test4', 'test3'],
    ['test1stperson', '', '', ''],
  ]);
});

test('notes are shown next to names, and an all-seated plan has no "Not yet seated" column', () => {
  const csv = seatingCsv([{ name: 'Family', capacity: 4, people: [{ name: 'Lola Ana', note: 'added' }, { name: 'Joy', note: 'not attending' }] }], []);
  assert.deepEqual(rows(csv), [['Family'], ['2/4 seated'], ['Lola Ana (added)'], ['Joy (not attending)']]);
});
