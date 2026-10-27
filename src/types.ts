/** 'YYYY-MM' — identifica uma fatura pelo mês do seu vencimento. */
export type YM = string;
/** Valores sempre em centavos (inteiros). */
export type Cents = number;
export type Person = 'eu' | 'mae';

export interface Card {
  id: string;
  name: string;
  limit: Cents;
  closingDay: number;
  dueDay: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Purchase {
  id: string;
  /** Valor total da compra. */
  amount: Cents;
  cardId: string;
  person: Person;
  categoryId: string;
  /** Data/hora local da compra: 'YYYY-MM-DDTHH:mm'. */
  date: string;
  installments: number;
  /** Para compras antigas: primeira parcela ainda em aberto (1 = compra nova). */
  firstInstallment: number;
  recurringId?: string;
}

/** Cobrança fixa no cartão (internet, celular...): vira um gasto 1x todo mês. */
export interface Recurring {
  id: string;
  name: string;
  person: Person;
  cardId: string;
  categoryId: string;
  amount: Cents;
  day: number;
  /** 'YYYY-MM-DD': cobranças são geradas a partir desta data. */
  startDate: string;
  /** Última data já gerada ('YYYY-MM-DD'), ou '' se nenhuma. */
  generatedUntil: string;
  active: boolean;
}

/** Conta fixa paga fora do cartão (empréstimo...). */
export interface FixedBill {
  id: string;
  name: string;
  person: Person;
  amount: Cents;
  dueDay: number;
  /** null = sem fim. */
  totalInstallments: number | null;
  /** Número da parcela que vence em `refMonth`. */
  refInstallment: number;
  refMonth: YM;
  active: boolean;
}

export interface State {
  version: 1;
  cards: Card[];
  categories: Category[];
  people: Record<Person, string>;
  purchases: Purchase[];
  recurring: Recurring[];
  fixedBills: FixedBill[];
  /** `${cardId}|${YM}` → data do pagamento 'YYYY-MM-DD'. */
  invoicePayments: Record<string, string>;
  /** `${fixedBillId}|${YM}` → data do pagamento 'YYYY-MM-DD'. */
  fixedPayments: Record<string, string>;
  lastBackup: string | null;
}
