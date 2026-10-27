// Formulário de gasto: usado na aba Gasto e na edição de um registro.
import { addMonths, invoiceMonth, splitAmount } from './billing';
import { esc, money, monthLabel, moneyPlain, nowLocal } from './format';
import { state, uid } from './store';
import type { Person, Purchase } from './types';
import { bindChips, chips, toast } from './ui';

export interface Draft {
  cents: number;
  cardId: string | null;
  person: Person;
  categoryId: string | null;
  n: number;
  customN: boolean;
  /** null = usar o momento do salvamento. */
  date: string | null;
  old: boolean;
  first: number;
}

const PARCELAS = [1, 2, 3, 4, 5, 6, 10, 12];

export function newDraft(prev?: Draft): Draft {
  return {
    cents: 0, cardId: prev?.cardId ?? state.cards[0]?.id ?? null, person: prev?.person ?? 'eu',
    categoryId: null, n: 1, customN: false, date: null, old: false, first: 1,
  };
}

export function draftFrom(p: Purchase): Draft {
  return {
    cents: p.amount, cardId: p.cardId, person: p.person, categoryId: p.categoryId, n: p.installments,
    customN: !PARCELAS.includes(p.installments), date: p.date, old: p.firstInstallment > 1, first: p.firstInstallment,
  };
}

export function toPurchase(d: Draft, id = uid(), recurringId?: string): Purchase {
  return {
    id, amount: d.cents, cardId: d.cardId!, person: d.person, categoryId: d.categoryId!,
    date: d.date ?? nowLocal(), installments: d.n, firstInstallment: d.old ? Math.min(d.first, d.n) : 1,
    ...(recurringId ? { recurringId } : {}),
  };
}

function hint(d: Draft): string {
  if (!d.cents) return '';
  const card = state.cards.find((c) => c.id === d.cardId);
  const parts = splitAmount(d.cents, d.n);
  let txt = d.n > 1 ? `${d.n}x de ${money(parts[d.n - 1])}` : '';
  if (card) {
    const first = invoiceMonth(card, d.date ?? nowLocal());
    const k = d.old ? Math.min(d.first, d.n) : 1;
    const label = monthLabel(addMonths(first, k - 1)).toLowerCase();
    txt += `${txt ? ' · ' : ''}${d.old ? `parcela ${k} cai em` : 'fatura de'} ${label}`;
  }
  return txt;
}

export function renderForm(d: Draft, saveLabel: string): string {
  if (!state.cards.length) {
    return `<div class="empty">Cadastre um cartão em <b>Config.</b> para começar.</div>`;
  }
  const cardOpts = state.cards.map((c) => ({ value: c.id, label: c.name }));
  const personOpts = [{ value: 'eu', label: state.people.eu }, { value: 'mae', label: state.people.mae }];
  const catOpts = state.categories.map((c) => ({ value: c.id, label: c.name }));
  const parcelOpts = PARCELAS.map((n) => ({ value: String(n), label: `${n}x` }));
  const customOn = d.customN || !PARCELAS.includes(d.n);

  return `
    <label class="amount">
      <span>R$</span>
      <input data-amount inputmode="numeric" autocomplete="off" placeholder="0,00" value="${d.cents ? moneyPlain(d.cents) : ''}" aria-label="Valor" />
    </label>
    <div class="hint" data-hint>${esc(hint(d))}</div>

    <div class="label">Cartão</div>
    <div class="chips scroll">${chips('card', cardOpts, d.cardId)}</div>

    <div class="label">De quem</div>
    <div class="chips">${chips('person', personOpts, d.person)}</div>

    <div class="label">Categoria</div>
    <div class="chips">${chips('category', catOpts, d.categoryId)}</div>

    <div class="label">Parcelas</div>
    <div class="chips scroll">${chips('n', parcelOpts, customOn ? null : String(d.n),
      `<button class="chip${customOn ? ' on' : ''}" data-chip="n" data-val="custom">${customOn ? `${d.n}x ✎` : 'Outro'}</button>`)}</div>
    ${customOn ? `<label class="field"><span>Número de parcelas</span>
      <input class="input" data-custom-n type="number" inputmode="numeric" min="1" max="48" value="${d.n}" /></label>` : ''}

    ${d.n > 1 ? `<button class="link" data-old>${d.old ? '✓ Compra antiga parcelada' : 'Compra antiga? Informar parcela atual'}</button>` : ''}
    ${d.n > 1 && d.old ? `<label class="field"><span>Parcela que vai ser paga agora (as anteriores já foram pagas)</span>
      <select class="input" data-first>${Array.from({ length: d.n }, (_, i) => i + 1)
        .map((i) => `<option value="${i}"${i === d.first ? ' selected' : ''}>Parcela ${i} de ${d.n}</option>`).join('')}</select></label>
      <p class="small muted">Use a <b>data original</b> da compra abaixo e confira o mês indicado acima do cartão.</p>` : ''}

    <label class="field"><span>Data e hora${d.date ? '' : ' (agora)'}</span>
      <input class="input" data-date type="datetime-local" value="${d.date ?? nowLocal()}" /></label>

    <button class="btn" data-save>${esc(saveLabel)}</button>`;
}

/** Liga os eventos. `rerender` redesenha o formulário; `onSave` recebe o rascunho validado. */
export function bindForm(root: HTMLElement, d: Draft, rerender: () => void, onSave: (d: Draft) => void) {
  const amount = root.querySelector<HTMLInputElement>('[data-amount]');
  const hintEl = root.querySelector<HTMLElement>('[data-hint]');
  amount?.addEventListener('input', () => {
    // Digitação "de caixa": 8750 → 87,50
    const digits = amount.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
    d.cents = Number(digits || 0);
    amount.value = d.cents ? moneyPlain(d.cents) : '';
    if (hintEl) hintEl.textContent = hint(d);
  });

  bindChips(root, (group, val) => {
    if (group === 'card') d.cardId = val;
    else if (group === 'person') d.person = val as Person;
    else if (group === 'category') d.categoryId = val;
    else if (group === 'n') {
      if (val === 'custom') { d.customN = true; if (PARCELAS.includes(d.n)) d.n = 2; }
      else { d.customN = false; d.n = Number(val); }
      d.first = Math.min(d.first, d.n);
      if (d.n === 1) d.old = false;
    }
    rerender();
  });

  root.querySelector<HTMLInputElement>('[data-custom-n]')?.addEventListener('change', (e) => {
    const n = Math.round(Number((e.target as HTMLInputElement).value));
    d.n = Math.min(Math.max(n || 1, 1), 48);
    d.first = Math.min(d.first, d.n);
    rerender();
  });
  root.querySelector('[data-old]')?.addEventListener('click', () => {
    d.old = !d.old;
    if (d.old && d.first < 2) d.first = 2;
    rerender();
  });
  root.querySelector<HTMLSelectElement>('[data-first]')?.addEventListener('change', (e) => {
    d.first = Number((e.target as HTMLSelectElement).value);
    rerender();
  });
  root.querySelector<HTMLInputElement>('[data-date]')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    d.date = v ? v.slice(0, 16) : null;
    if (hintEl) hintEl.textContent = hint(d);
  });

  root.querySelector('[data-save]')?.addEventListener('click', () => {
    if (!d.cents) return toast('Digite o valor');
    if (!d.cardId) return toast('Escolha o cartão');
    if (!d.categoryId) return toast('Escolha a categoria');
    onSave(d);
  });
}
