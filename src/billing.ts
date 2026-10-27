// Regras de fatura, parcelas e limite. Funções puras — testadas em billing.test.ts.
import type { Card, Cents, FixedBill, Purchase, Person, YM } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function ym(year: number, month: number): YM {
  const total = year * 12 + (month - 1);
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function ymParts(k: YM): [number, number] {
  const [y, m] = k.split('-').map(Number);
  return [y, m];
}

export function addMonths(k: YM, n: number): YM {
  const [y, m] = ymParts(k);
  return ym(y, m + n);
}

/** Quantos meses de `a` até `b` (b − a). */
export function monthsBetween(a: YM, b: YM): number {
  const [ya, ma] = ymParts(a);
  const [yb, mb] = ymParts(b);
  return (yb - ya) * 12 + (mb - ma);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Dia que não existe no mês (ex.: 30 em fevereiro) vira o último dia. */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

type Cycle = Pick<Card, 'closingDay' | 'dueDay'>;

/** Mês do fechamento de uma fatura identificada pelo mês de vencimento. */
function closingMonthOf(card: Cycle, invoice: YM): YM {
  return card.dueDay > card.closingDay ? invoice : addMonths(invoice, -1);
}

/**
 * Em qual fatura (mês de vencimento) cai uma compra.
 * Compra antes do dia de fechamento entra na fatura que fecha naquele mês;
 * no dia do fechamento ou depois, entra na seguinte.
 */
export function invoiceMonth(card: Cycle, date: string): YM {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const closesThisMonth = d < clampDay(y, m, card.closingDay);
  const closing = closesThisMonth ? ym(y, m) : ym(y, m + 1);
  return card.dueDay > card.closingDay ? closing : addMonths(closing, 1);
}

export function dueDate(card: Cycle, invoice: YM): string {
  const [y, m] = ymParts(invoice);
  return isoDate(y, m, clampDay(y, m, card.dueDay));
}

export function closingDate(card: Cycle, invoice: YM): string {
  const [y, m] = ymParts(closingMonthOf(card, invoice));
  return isoDate(y, m, clampDay(y, m, card.closingDay));
}

/** Divide em parcelas; os centavos que sobram vão na primeira. */
export function splitAmount(total: Cents, n: number): Cents[] {
  const base = Math.floor(total / n);
  const parts = Array<Cents>(n).fill(base);
  parts[0] += total - base * n;
  return parts;
}

export interface Installment {
  purchaseId: string;
  cardId: string;
  person: Person;
  categoryId: string;
  date: string;
  amount: Cents;
  month: YM;
  index: number;
  count: number;
  recurringId?: string;
}

export function installmentsOf(p: Purchase, card: Cycle): Installment[] {
  const first = invoiceMonth(card, p.date);
  const parts = splitAmount(p.amount, p.installments);
  const out: Installment[] = [];
  for (let i = Math.max(1, p.firstInstallment); i <= p.installments; i++) {
    out.push({
      purchaseId: p.id,
      cardId: p.cardId,
      person: p.person,
      categoryId: p.categoryId,
      date: p.date,
      amount: parts[i - 1],
      month: addMonths(first, i - 1),
      index: i,
      count: p.installments,
      recurringId: p.recurringId,
    });
  }
  return out;
}

export type InvoiceStatus = 'paga' | 'aberta' | 'atrasada';

export function invoiceStatus(card: Cycle, invoice: YM, paidAt: string | undefined, today: string): InvoiceStatus {
  if (paidAt) return 'paga';
  return today > dueDate(card, invoice) ? 'atrasada' : 'aberta';
}

/** Limite total menos todas as parcelas de faturas ainda não pagas. */
export function availableLimit(
  card: Card,
  installments: Installment[],
  payments: Record<string, string>,
): Cents {
  let used = 0;
  for (const it of installments) {
    if (it.cardId === card.id && !payments[`${card.id}|${it.month}`]) used += it.amount;
  }
  return card.limit - used;
}

/** Datas ('YYYY-MM-DD') em que uma cobrança mensal no dia `day` ocorre entre `from` e `to` (inclusive). */
export function monthlyOccurrences(day: number, from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let k = from.slice(0, 7);
  const last = to.slice(0, 7);
  while (k <= last) {
    const [y, m] = ymParts(k);
    const d = isoDate(y, m, clampDay(y, m, day));
    if (d >= from && d <= to) out.push(d);
    k = addMonths(k, 1);
  }
  return out;
}

/** Número da parcela de uma conta fixa num mês, ou null se não houver cobrança nesse mês. */
export function fixedInstallmentFor(bill: FixedBill, month: YM): number | null {
  const n = bill.refInstallment + monthsBetween(bill.refMonth, month);
  if (n < 1) return null;
  if (bill.totalInstallments !== null && n > bill.totalInstallments) return null;
  return n;
}

export function fixedStatus(bill: FixedBill, month: YM, paidAt: string | undefined, today: string): InvoiceStatus {
  if (paidAt) return 'paga';
  const [y, m] = ymParts(month);
  return today > isoDate(y, m, clampDay(y, m, bill.dueDay)) ? 'atrasada' : 'aberta';
}
