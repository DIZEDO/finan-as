import { describe, expect, it } from 'vitest';
import {
  addMonths,
  availableLimit,
  closingDate,
  dueDate,
  fixedInstallmentFor,
  installmentsOf,
  invoiceMonth,
  invoiceStatus,
  monthlyOccurrences,
  splitAmount,
} from './billing';
import type { Card, FixedBill, Purchase } from './types';

const nubank: Card = { id: 'nu', name: 'Nubank', limit: 300000, closingDay: 5, dueDay: 13 };
const bradesco: Card = { id: 'br', name: 'Bradesco', limit: 200000, closingDay: 29, dueDay: 10 };

function purchase(over: Partial<Purchase>): Purchase {
  return {
    id: 'p1', amount: 10000, cardId: 'nu', person: 'eu', categoryId: 'c',
    date: '2026-10-27T12:00', installments: 1, firstInstallment: 1, ...over,
  };
}

describe('meses', () => {
  it('soma meses atravessando o ano', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

describe('invoiceMonth', () => {
  it('Nubank (fecha 05, vence 13): antes do fechamento cai no vencimento do mesmo mês', () => {
    expect(invoiceMonth(nubank, '2026-10-04')).toBe('2026-10');
  });
  it('Nubank: no dia do fechamento ou depois vai para a próxima fatura', () => {
    expect(invoiceMonth(nubank, '2026-10-05')).toBe('2026-11');
    expect(invoiceMonth(nubank, '2026-10-27')).toBe('2026-11');
  });
  it('Bradesco (fecha 29, vence 10): vencimento é no mês seguinte ao fechamento', () => {
    expect(invoiceMonth(bradesco, '2026-10-27')).toBe('2026-11');
    expect(invoiceMonth(bradesco, '2026-10-29')).toBe('2026-12');
    expect(invoiceMonth(bradesco, '2026-12-30')).toBe('2027-02');
  });
  it('fevereiro sem dia 29: fechamento vira dia 28', () => {
    expect(invoiceMonth(bradesco, '2027-02-27')).toBe('2027-03');
    expect(invoiceMonth(bradesco, '2027-02-28')).toBe('2027-04');
  });
});

describe('datas da fatura', () => {
  it('calcula vencimento e fechamento', () => {
    expect(dueDate(nubank, '2026-11')).toBe('2026-11-13');
    expect(closingDate(nubank, '2026-11')).toBe('2026-11-05');
    expect(dueDate(bradesco, '2026-11')).toBe('2026-11-10');
    expect(closingDate(bradesco, '2026-11')).toBe('2026-10-29');
    expect(closingDate(bradesco, '2027-03')).toBe('2027-02-28');
  });
});

describe('parcelas', () => {
  it('divide e joga os centavos na primeira', () => {
    expect(splitAmount(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitAmount(10000, 3).reduce((a, b) => a + b)).toBe(10000);
  });
  it('3x distribui em três faturas seguidas', () => {
    const its = installmentsOf(purchase({ installments: 3 }), nubank);
    expect(its.map((i) => i.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(its.map((i) => i.index)).toEqual([1, 2, 3]);
  });
  it('compra antiga: gera só as parcelas a partir da atual', () => {
    const its = installmentsOf(
      purchase({ date: '2026-07-20T10:00', installments: 6, firstInstallment: 4, amount: 60000 }),
      nubank,
    );
    expect(its.map((i) => [i.index, i.month])).toEqual([
      [4, '2026-11'], [5, '2026-12'], [6, '2027-01'],
    ]);
  });
});

describe('limite e status', () => {
  it('parcelas futuras ocupam limite até a fatura ser paga', () => {
    const its = installmentsOf(purchase({ installments: 3, amount: 30000 }), nubank);
    expect(availableLimit(nubank, its, {})).toBe(270000);
    expect(availableLimit(nubank, its, { 'nu|2026-11': '2026-11-10' })).toBe(280000);
  });
  it('status em aberto, atrasada e paga', () => {
    expect(invoiceStatus(nubank, '2026-11', undefined, '2026-11-13')).toBe('aberta');
    expect(invoiceStatus(nubank, '2026-11', undefined, '2026-11-14')).toBe('atrasada');
    expect(invoiceStatus(nubank, '2026-11', '2026-11-20', '2026-11-30')).toBe('paga');
  });
});

describe('recorrentes e contas fixas', () => {
  it('ocorrências mensais respeitam o intervalo e o fim do mês', () => {
    expect(monthlyOccurrences(31, '2027-01-15', '2027-03-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(monthlyOccurrences(10, '2026-10-27', '2026-11-09')).toEqual([]);
  });
  it('conta fixa parcelada aparece só dentro do prazo', () => {
    const bill: FixedBill = {
      id: 'f', name: 'Empréstimo', person: 'eu', amount: 35000, dueDay: 15,
      totalInstallments: 12, refInstallment: 4, refMonth: '2026-11', active: true,
    };
    expect(fixedInstallmentFor(bill, '2026-11')).toBe(4);
    expect(fixedInstallmentFor(bill, '2027-07')).toBe(12);
    expect(fixedInstallmentFor(bill, '2027-08')).toBeNull();
    expect(fixedInstallmentFor(bill, '2026-07')).toBeNull();
  });
});
