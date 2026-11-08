import { csvCell } from './validation';

// Builds the seating-plan CSV laid out like the planner on screen:
// one column per table (name, then "2/8 seated", then the people), plus "Not yet seated".
export type ExportTable = { name: string; capacity: number; people: { name: string; note?: string }[] };

export function seatingCsv(tables: ExportTable[], unseated: { name: string; note?: string }[]) {
  const columns = tables.map(t => ({ title: t.name, summary: `${t.people.length}/${t.capacity} seated`, people: t.people }));
  if (unseated.length) columns.push({ title: 'Not yet seated', summary: `${unseated.length} ${unseated.length === 1 ? 'person' : 'people'}`, people: unseated });
  const label = (p: { name: string; note?: string }) => (p.note ? `${p.name} (${p.note})` : p.name);
  const depth = Math.max(0, ...columns.map(c => c.people.length));
  const rows: string[][] = [columns.map(c => c.title), columns.map(c => c.summary)];
  for (let i = 0; i < depth; i++) rows.push(columns.map(c => (c.people[i] ? label(c.people[i]) : '')));
  // BOM so Excel opens accented names correctly.
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
