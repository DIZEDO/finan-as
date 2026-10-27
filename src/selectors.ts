// Cálculos derivados do estado (faturas, totais por categoria, previstos).
import { addMonths, fixedInstallmentFor, installmentsOf, invoiceMonth, monthlyOccurrences, type Installment } from './billing';
import type { Card, Cents, FixedBill, Person, State, YM } from './types';

export type PersonFilter = Person | 'all';
export type CardFilter = string | 'all';

export function allInstallments(s: State): Installment[] {
  const cards = new Map(s.cards.map((c) => [c.id, c]));
  const out: Installment[] = [];
  for (const p of s.purchases) {
    const card = cards.get(p.cardId);
    if (card) out.push(...installmentsOf(p, card));
  }
  return out;
}

/** Cobranças recorrentes que ainda vão acontecer (depois de hoje) e caem na fatura `month`. */
export function projectedRecurring(s: State, month: YM, today: string): Installment[] {
  const out: Installment[] = [];
  for (const r of s.recurring) {
    if (!r.active) continue;
    const card = s.cards.find((c) => c.id === r.cardId);
    if (!card) continue;
    const start = r.startDate > today ? r.startDate : nextIso(today);
    // A fatura `month` só recebe compras de até ~2 meses antes do vencimento.
    const end = `${addMonths(month, 1)}-01`;
    for (const d of monthlyOccurrences(r.day, start, end)) {
      if (invoiceMonth(card, d) !== month) continue;
      out.push({
        purchaseId: `prev-${r.id}-${d}`, cardId: r.cardId, person: r.person, categoryId: r.categoryId,
        date: `${d}T00:00`, amount: r.amount, month, index: 1, count: 1, recurringId: r.id,
      });
    }
  }
  return out;
}

function nextIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function matches(it: Installment, card: CardFilter, person: PersonFilter): boolean {
  return (card === 'all' || it.cardId === card) && (person === 'all' || it.person === person);
}

export const sum = (xs: { amount: Cents }[]) => xs.reduce((a, x) => a + x.amount, 0);

export interface Slice { categoryId: string; amount: Cents }

export function byCategory(items: Installment[]): Slice[] {
  const m = new Map<string, Cents>();
  for (const it of items) m.set(it.categoryId, (m.get(it.categoryId) ?? 0) + it.amount);
  return [...m].map(([categoryId, amount]) => ({ categoryId, amount }));
}

export function fixedBillsFor(s: State, month: YM, person: PersonFilter): { bill: FixedBill; n: number }[] {
  const out: { bill: FixedBill; n: number }[] = [];
  for (const bill of s.fixedBills) {
    if (!bill.active || (person !== 'all' && bill.person !== person)) continue;
    const n = fixedInstallmentFor(bill, month);
    if (n !== null) out.push({ bill, n });
  }
  return out;
}

export function cardName(s: State, id: string): string {
  return s.cards.find((c: Card) => c.id === id)?.name ?? 'Cartão removido';
}

export function categoryName(s: State, id: string): string {
  return s.categories.find((c) => c.id === id)?.name ?? 'Outros';
}
