import { ymParts } from './billing';
import type { Cents, YM } from './types';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (c: Cents) => brl.format(c / 100);
export const moneyPlain = (c: Cents) => plain.format(c / 100);

/** Interpreta '1.234,56' ou '1234.56' como centavos. */
export function parseMoney(text: string): Cents {
  const t = text.trim().replace(/[R$\s]/g, '');
  if (!t) return 0;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const v = Math.round(Number(normalized) * 100);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function monthLabel(k: YM): string {
  const [y, m] = ymParts(k);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthShort(k: YM): string {
  const [y, m] = ymParts(k);
  return `${SHORT[m - 1]}/${String(y).slice(2)}`;
}

/** 'YYYY-MM-DD' → '13/11' */
export function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function dayHeading(iso: string, today: string): string {
  const d = iso.slice(0, 10);
  if (d === today) return 'Hoje';
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (dt.toDateString() === yest.toDateString()) return 'Ontem';
  return `${WEEK[dt.getDay()]}, ${day} ${SHORT[m - 1]}`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

const p2 = (n: number) => String(n).padStart(2, '0');

export function nowLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function todayIso(): string {
  return nowLocal().slice(0, 10);
}
