// Estado do app guardado no próprio aparelho (IndexedDB). Nada sai do celular.
import { monthlyOccurrences } from './billing';
import type { State } from './types';

const DB_NAME = 'financas';
const STORE = 'kv';
const KEY = 'state';

export const OTHER_CATEGORY = 'outros';

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function defaultState(): State {
  return {
    version: 1,
    cards: [
      { id: uid(), name: 'Nubank', limit: 0, closingDay: 5, dueDay: 13 },
      { id: uid(), name: 'Nubank Empresa', limit: 0, closingDay: 5, dueDay: 12 },
      { id: uid(), name: 'Bradesco', limit: 0, closingDay: 29, dueDay: 10 },
      { id: uid(), name: 'Mercado Pago', limit: 0, closingDay: 8, dueDay: 13 },
    ],
    categories: [
      { id: uid(), name: 'Mercado' },
      { id: uid(), name: 'Lanche' },
      { id: uid(), name: 'Gasolina' },
      { id: uid(), name: 'Saúde' },
      { id: OTHER_CATEGORY, name: 'Outros' },
    ],
    people: { eu: 'Eu', mae: 'Mãe' },
    purchases: [],
    recurring: [],
    fixedBills: [],
    invoicePayments: {},
    fixedPayments: {},
    lastBackup: null,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let db: IDBDatabase | null = null;

async function read(): Promise<State | null> {
  db ??= await openDb();
  return new Promise((resolve, reject) => {
    const req = db!.transaction(STORE).objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as State) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function write(s: State): Promise<void> {
  db ??= await openDb();
  return new Promise((resolve, reject) => {
    const tx = db!.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(s, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export let state: State = defaultState();
const listeners = new Set<() => void>();

export function subscribe(fn: () => void) {
  listeners.add(fn);
}

export async function initStore(today: string): Promise<void> {
  const saved = await read();
  state = saved ?? defaultState();
  generateRecurring(state, today);
  await write(state);
  // Pede ao iOS para não apagar os dados automaticamente.
  navigator.storage?.persist?.().catch(() => {});
}

/** Aplica uma alteração, salva no aparelho e redesenha a tela. */
export function commit(change: (s: State) => void): void {
  change(state);
  write(state).catch((e) => alert('Não foi possível salvar: ' + e));
  listeners.forEach((fn) => fn());
}

/** Cria os lançamentos das cobranças fixas no cartão cujos dias já chegaram. */
export function generateRecurring(s: State, today: string): void {
  for (const r of s.recurring) {
    if (!r.active) continue;
    const from = r.generatedUntil ? nextDay(r.generatedUntil) : r.startDate;
    for (const d of monthlyOccurrences(r.day, from, today)) {
      s.purchases.push({
        id: uid(), amount: r.amount, cardId: r.cardId, person: r.person, categoryId: r.categoryId,
        date: `${d}T00:00`, installments: 1, firstInstallment: 1, recurringId: r.id,
      });
    }
    if (from <= today) r.generatedUntil = today;
  }
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function exportBackup(): string {
  return JSON.stringify(state, null, 1);
}

export function parseBackup(text: string): State {
  const data = JSON.parse(text) as State;
  const ok = data && data.version === 1 && Array.isArray(data.cards) && Array.isArray(data.purchases)
    && Array.isArray(data.categories);
  if (!ok) throw new Error('Arquivo não parece um backup deste app.');
  return { ...defaultState(), ...data };
}

export function replaceState(next: State): void {
  commit((s) => {
    Object.keys(s).forEach((k) => delete (s as unknown as Record<string, unknown>)[k]);
    Object.assign(s, next);
  });
}
