import { confirmDialog } from '../lib/confirm-dialog';
import { seatingCsv } from '../lib/seating-export';
// Seating planner. Loads everything once, updates the screen immediately, and saves in the
// background (rolling back if the server refuses). No libraries, so it stays light and fast.
type Table = { id: string; name: string; capacity: number; position: number };
type Row = { id: string; guest_id: string | null; name: string | null; table_id: string | null };
type Guest = { id: string; name: string; position: number; attending: boolean | null; invitationId: string; household: string };
type Person = { key: string; kind: 'guest' | 'extra'; id: string; name: string; household: string; invitationId: string; attending: boolean; tableId: string | null };

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const status = $('#seating-status');
let tables: Table[] = [];
let people = new Map<string, Person>();
const selected = new Set<string>();
// Which table field is being edited inline (survives re-renders).
let editing: { id: string; field: 'name' | 'capacity' } | null = null;
let menuFor: string | null = null;
let busy = 0;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
};
const tell = (error: unknown) => { status.textContent = error instanceof Error ? error.message : 'Something went wrong. Please try again.'; };
async function api(data?: unknown) {
  const response = await fetch('/api/admin-seating', data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : undefined);
  if (response.status === 401) { location.assign('/login'); throw new Error('Please sign in again.'); }
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}

// ---- data ----
function build(data: { tables: Table[]; people: Row[]; guests: Guest[] }) {
  tables = data.tables;
  const rowsByGuest = new Map(data.people.filter(r => r.guest_id).map(r => [r.guest_id!, r]));
  const next = new Map<string, Person>();
  for (const g of data.guests) {
    const row = rowsByGuest.get(g.id);
    // Only confirmed guests are planned — but keep anyone already seated, so a later "no" is visible.
    if (g.attending !== true && !row?.table_id) continue;
    next.set(`g:${g.id}`, { key: `g:${g.id}`, kind: 'guest', id: g.id, name: g.name, household: g.household, invitationId: g.invitationId, attending: g.attending === true, tableId: row?.table_id ?? null });
  }
  for (const r of data.people.filter(r => r.name)) {
    next.set(`p:${r.id}`, { key: `p:${r.id}`, kind: 'extra', id: r.id, name: r.name!, household: '', invitationId: '', attending: true, tableId: r.table_id });
  }
  people = next;
  for (const key of [...selected]) if (!people.has(key) || people.get(key)!.tableId) selected.delete(key);
}
async function load() {
  status.textContent = 'Loading your seating plan…';
  try {
    build(await api());
    $('#seating-summary').hidden = false; $('#seating-layout').hidden = false;
    render(); status.textContent = '';
  } catch (error) { tell(error); }
}
const seatedAt = (tableId: string) => [...people.values()].filter(p => p.tableId === tableId);
const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);

// ---- rendering ----
function chip(person: Person, where: 'pool' | 'table') {
  const item = el('div', 'seat-chip'); item.draggable = true; item.dataset.key = person.key;
  if (selected.has(person.key)) item.classList.add('is-selected');
  if (person.kind === 'extra') item.classList.add('is-extra');
  if (!person.attending) item.classList.add('is-declined');
  const pick = el('button', 'seat-chip-name'); pick.type = 'button';
  pick.setAttribute('aria-pressed', String(selected.has(person.key)));
  pick.append(el('span', '', person.name));
  if (!person.attending) pick.append(el('small', '', 'not attending'));
  else if (person.kind === 'extra') pick.append(el('small', '', 'added'));
  // Tap to select (works for seated people too, to move them to another table).
  pick.addEventListener('click', () => toggle(person.key));
  item.append(pick);
  const x = el('button', 'seat-chip-x', '×'); x.type = 'button';
  if (where === 'table') { x.setAttribute('aria-label', `Move ${person.name} back to not seated`); x.addEventListener('click', () => void seat([person.key], null)); item.append(x); }
  else if (person.kind === 'extra') { x.setAttribute('aria-label', `Delete ${person.name}`); x.addEventListener('click', () => void removeExtra(person)); item.append(x); }
  item.addEventListener('dragstart', event => {
    const keys = selected.has(person.key) ? [...selected] : [person.key];
    event.dataTransfer?.setData('text/plain', keys.join(',')); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    item.classList.add('is-dragging');
  });
  item.addEventListener('dragend', () => item.classList.remove('is-dragging'));
  return item;
}

function renderPool() {
  const list = $('#pool-list');
  const query = $<HTMLInputElement>('#pool-search').value.trim().toLowerCase();
  const pool = [...people.values()].filter(p => !p.tableId);
  $('#pool-count').textContent = String(pool.length);
  const shown = query ? pool.filter(p => `${p.name} ${p.household}`.toLowerCase().includes(query)) : pool;
  const frag = document.createDocumentFragment();
  // Group guests by invitation, so a couple can be seated together in one tap.
  const groups = new Map<string, Person[]>();
  for (const p of shown.filter(p => p.kind === 'guest')) { const list = groups.get(p.invitationId) ?? []; list.push(p); groups.set(p.invitationId, list); }
  for (const members of [...groups.values()].sort((a, b) => a[0].household.localeCompare(b[0].household))) {
    const group = el('div', 'pool-group');
    if (members.length > 1) {
      const head = el('button', 'pool-group-head'); head.type = 'button';
      head.append(el('span', '', members[0].household), el('small', '', `Select all ${members.length}`));
      head.addEventListener('click', () => { const all = members.every(m => selected.has(m.key)); for (const m of members) all ? selected.delete(m.key) : selected.add(m.key); render(); });
      group.append(head);
    }
    for (const m of members) group.append(chip(m, 'pool'));
    frag.append(group);
  }
  const extras = shown.filter(p => p.kind === 'extra').sort(byName);
  if (extras.length) { const group = el('div', 'pool-group'); group.append(el('p', 'pool-group-label', 'Added names')); for (const p of extras) group.append(chip(p, 'pool')); frag.append(group); }
  if (!shown.length) frag.append(el('p', 'pool-empty', query ? 'No one matches your search.' : 'Everyone who confirmed is seated.'));
  list.replaceChildren(frag);
}

function renderTables() {
  const grid = $('#table-grid'); const frag = document.createDocumentFragment();
  for (const table of tables) {
    const seated = seatedAt(table.id).sort(byName);
    const card = el('article', 'seat-table'); card.dataset.drop = table.id;
    const free = table.capacity - seated.length;
    if (free <= 0) card.classList.add('is-full');
    if (selected.size && selected.size <= free) card.classList.add('can-seat');
    const head = el('header', 'seat-table-head');
    // Name: click to rename in place.
    let title: HTMLElement;
    if (editing?.id === table.id && editing.field === 'name') title = inlineInput(table, 'name');
    else {
      title = el('button', 'seat-table-name', table.name); (title as HTMLButtonElement).type = 'button';
      title.title = 'Click to rename'; title.setAttribute('aria-label', `Rename ${table.name}`);
      title.addEventListener('click', event => { event.stopPropagation(); startEdit(table.id, 'name'); });
    }
    // Seats: click the number to change it in place.
    const count = el('span', 'seat-table-count'); count.append(`${seated.length}/`);
    if (editing?.id === table.id && editing.field === 'capacity') count.append(inlineInput(table, 'capacity'));
    else {
      const seats = el('button', 'seat-table-seats', String(table.capacity)); seats.type = 'button';
      seats.title = 'Click to change the number of seats'; seats.setAttribute('aria-label', `Change seats for ${table.name}, now ${table.capacity}`);
      seats.addEventListener('click', event => { event.stopPropagation(); startEdit(table.id, 'capacity'); });
      count.append(seats);
    }
    head.append(title, count, tableMenu(table, seated.length));
    const bar = el('div', 'seat-table-bar'); const fill = el('span'); fill.style.width = `${Math.min(100, (seated.length / table.capacity) * 100)}%`; bar.append(fill);
    const list = el('div', 'seat-table-people');
    for (const p of seated) list.append(chip(p, 'table'));
    if (!seated.length) list.append(el('p', 'seat-table-empty', 'Drop or tap to seat guests here'));
    card.append(head, bar, list);
    card.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('.seat-chip, button, input, .seat-table-menu')) return;
      if (selected.size) void seat([...selected], table.id);
    });
    frag.append(card);
  }
  grid.replaceChildren(frag);
  $('#tables-empty').hidden = tables.length > 0;
}

function render() {
  renderPool(); renderTables();
  const all = [...people.values()];
  $('#seated-count').textContent = String(all.filter(p => p.tableId).length);
  $('#people-count').textContent = String(all.length);
  $('#table-count').textContent = String(tables.length);
  $('#seat-count').textContent = String(tables.reduce((sum, t) => sum + t.capacity, 0));
  $('#selection-hint').hidden = selected.size === 0;
  $('#selection-count').textContent = String(selected.size);
}
function toggle(key: string) { selected.has(key) ? selected.delete(key) : selected.add(key); render(); }

// ---- actions ----
async function seat(keys: string[], tableId: string | null) {
  const moving = keys.map(k => people.get(k)).filter((p): p is Person => !!p && p.tableId !== tableId);
  if (!moving.length) return;
  if (tableId) {
    const table = tables.find(t => t.id === tableId)!;
    const free = table.capacity - seatedAt(tableId).length;
    if (moving.length > free) { status.textContent = `${table.name} has ${free} free seat${free === 1 ? '' : 's'} — you selected ${moving.length}.`; return; }
  }
  const before = moving.map(p => [p, p.tableId] as const);
  for (const p of moving) { p.tableId = tableId; selected.delete(p.key); }
  render();
  busy++;
  try {
    await api({ action: 'seat', tableId, people: moving.filter(p => p.kind === 'extra').map(p => p.id), guests: moving.filter(p => p.kind === 'guest').map(p => p.id) });
    const table = tables.find(t => t.id === tableId);
    status.textContent = tableId ? `Seated ${moving.length === 1 ? moving[0].name : `${moving.length} people`} at ${table?.name}.` : `${moving.length === 1 ? moving[0].name : `${moving.length} people`} moved back to not seated.`;
  } catch (error) {
    for (const [p, old] of before) p.tableId = old;
    render(); tell(error);
  } finally { busy--; }
}

async function removeExtra(person: Person) {
  if (!await confirmDialog({ tone: 'danger', title: 'Delete this name?', message: `${person.name} will be removed from the seating plan.`, confirmLabel: 'Delete', cancelLabel: 'Keep' })) return;
  people.delete(person.key); selected.delete(person.key); render();
  try { await api({ action: 'remove-name', id: person.id }); status.textContent = `${person.name} removed.`; }
  catch (error) { people.set(person.key, person); render(); tell(error); }
}

$<HTMLFormElement>('#add-name-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $<HTMLInputElement>('#add-name'); const name = input.value.trim(); if (!name) return;
  const button = $<HTMLButtonElement>('#add-name-form button'); button.disabled = true;
  try {
    const { person } = await api({ action: 'add-name', name });
    people.set(`p:${person.id}`, { key: `p:${person.id}`, kind: 'extra', id: person.id, name: person.name, household: '', invitationId: '', attending: true, tableId: null });
    input.value = ''; render(); input.focus(); status.textContent = `${person.name} added to not seated.`;
  } catch (error) { tell(error); } finally { button.disabled = false; }
});

$<HTMLFormElement>('#add-table-form').addEventListener('submit', async event => {
  event.preventDefault();
  const nameInput = $<HTMLInputElement>('#table-name'); const seatsInput = $<HTMLInputElement>('#table-seats');
  const name = nameInput.value.trim() || `Table ${tables.length + 1}`;
  const button = $<HTMLButtonElement>('#add-table-form button'); button.disabled = true;
  try {
    const { table } = await api({ action: 'add-table', name, capacity: Number(seatsInput.value || 8) });
    tables.push(table); nameInput.value = ''; render(); status.textContent = `${table.name} added with ${table.capacity} seats.`;
  } catch (error) { tell(error); } finally { button.disabled = false; }
});

// ---- inline table editing ----
function startEdit(id: string, field: 'name' | 'capacity') { editing = { id, field }; menuFor = null; renderTables(); }
function inlineInput(table: Table, field: 'name' | 'capacity') {
  const input = el('input', field === 'name' ? 'seat-table-name-input' : 'seat-table-seats-input');
  if (field === 'name') { input.maxLength = 60; input.value = table.name; input.setAttribute('aria-label', 'Table name'); }
  else { input.type = 'number'; input.min = '1'; input.max = '40'; input.inputMode = 'numeric'; input.value = String(table.capacity); input.setAttribute('aria-label', 'Number of seats'); }
  let done = false;
  const finish = (save: boolean) => { if (done) return; done = true; editing = null; if (save) void saveTable(table, field, input.value); else renderTables(); };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', event => event.stopPropagation());
  queueMicrotask(() => { input.focus(); input.select(); });
  return input;
}
async function saveTable(table: Table, field: 'name' | 'capacity', raw: string) {
  const name = field === 'name' ? raw.trim() : table.name;
  const capacity = field === 'capacity' ? Number(raw) : table.capacity;
  if (field === 'name' && (!name || name === table.name)) { renderTables(); return; }
  if (field === 'capacity') {
    const seated = seatedAt(table.id).length;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 40) { status.textContent = 'Seats per table must be between 1 and 40.'; renderTables(); return; }
    if (capacity === table.capacity) { renderTables(); return; }
    if (capacity < seated) { status.textContent = `${seated} people are already seated at ${table.name}. Move some first, or keep at least ${seated} seats.`; renderTables(); return; }
  }
  const before = { name: table.name, capacity: table.capacity };
  table.name = name; table.capacity = capacity; render();
  try { await api({ action: 'update-table', id: table.id, name, capacity }); status.textContent = `${name} saved.`; }
  catch (error) { table.name = before.name; table.capacity = before.capacity; render(); tell(error); }
}
// ⋯ menu: rename, change seats, delete.
function tableMenu(table: Table, seatedCount: number) {
  const wrap = el('div', 'seat-table-menu');
  const toggle = el('button', 'seat-table-menu-toggle', '⋯'); toggle.type = 'button';
  toggle.setAttribute('aria-label', `More options for ${table.name}`); toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', String(menuFor === table.id));
  toggle.addEventListener('click', event => { event.stopPropagation(); menuFor = menuFor === table.id ? null : table.id; renderTables(); });
  wrap.append(toggle);
  if (menuFor === table.id) {
    const menu = el('div', 'seat-table-menu-list'); menu.setAttribute('role', 'menu');
    const item = (label: string, action: () => void, danger = false) => {
      const button = el('button', danger ? 'is-danger' : '', label); button.type = 'button'; button.setAttribute('role', 'menuitem');
      button.addEventListener('click', event => { event.stopPropagation(); action(); }); menu.append(button);
    };
    item('Rename', () => startEdit(table.id, 'name'));
    item('Change seats', () => startEdit(table.id, 'capacity'));
    item('Delete table', () => { menuFor = null; renderTables(); void deleteTable(table, seatedCount); }, true);
    wrap.append(menu);
    queueMicrotask(() => menu.querySelector<HTMLButtonElement>('button')?.focus());
  }
  return wrap;
}
async function deleteTable(table: Table, seated: number) {
  if (!await confirmDialog({ tone: 'danger', title: `Delete ${table.name}?`, message: seated ? `The ${seated} ${seated === 1 ? 'person' : 'people'} seated here go back to “Not yet seated”.` : 'This table is empty.', confirmLabel: 'Delete table', cancelLabel: 'Keep table' })) return;
  try {
    await api({ action: 'remove-table', id: table.id });
    tables = tables.filter(t => t.id !== table.id);
    for (const p of people.values()) if (p.tableId === table.id) p.tableId = null;
    render(); status.textContent = `${table.name} deleted.`;
  } catch (error) { tell(error); }
}
// Close the ⋯ menu when clicking elsewhere.
document.addEventListener('click', () => { if (menuFor) { menuFor = null; renderTables(); } });

// Drag and drop (computers): drop on a table to seat, on the list to unseat.
document.addEventListener('dragover', event => {
  const zone = (event.target as HTMLElement).closest<HTMLElement>('[data-drop]'); if (!zone) return;
  event.preventDefault(); zone.classList.add('is-drop');
});
document.addEventListener('dragleave', event => { (event.target as HTMLElement).closest<HTMLElement>('[data-drop]')?.classList.remove('is-drop'); });
document.addEventListener('drop', event => {
  const zone = (event.target as HTMLElement).closest<HTMLElement>('[data-drop]'); if (!zone) return;
  event.preventDefault(); document.querySelectorAll('.is-drop').forEach(z => z.classList.remove('is-drop'));
  const keys = (event.dataTransfer?.getData('text/plain') ?? '').split(',').filter(Boolean);
  void seat(keys, zone.dataset.drop === 'pool' ? null : zone.dataset.drop!);
});

$('#pool-search').addEventListener('input', renderPool);
$('#clear-selection').addEventListener('click', () => { selected.clear(); render(); });
$('#seating-refresh').addEventListener('click', () => { if (!busy) void load(); });
$('#seating-export').addEventListener('click', () => {
  // Same layout as the planner: one column per table, then "Not yet seated".
  const note = (p: Person) => p.kind === 'extra' ? 'added' : p.attending ? undefined : 'not attending';
  const csv = seatingCsv(
    tables.map(t => ({ name: t.name, capacity: t.capacity, people: seatedAt(t.id).sort(byName).map(p => ({ name: p.name, note: note(p) })) })),
    [...people.values()].filter(p => !p.tableId).sort(byName).map(p => ({ name: p.name, note: note(p) })),
  );
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = el('a'); a.href = url; a.download = 'seating-plan.csv'; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (menuFor) { menuFor = null; renderTables(); return; }
  if (selected.size) { selected.clear(); render(); }
});
void load();
