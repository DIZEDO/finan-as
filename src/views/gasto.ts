import { money } from '../format';
import { bindForm, newDraft, renderForm, toPurchase, type Draft } from '../purchaseForm';
import { cardName } from '../selectors';
import { commit, state } from '../store';
import { toast } from '../ui';

let draft: Draft | null = null;

export function renderGasto(root: HTMLElement) {
  draft ??= newDraft();
  if (draft.cardId && !state.cards.some((c) => c.id === draft!.cardId)) draft.cardId = state.cards[0]?.id ?? null;
  const d = draft;
  root.innerHTML = `<h1>Novo gasto</h1><div data-form>${renderForm(d, 'Salvar')}</div>`;
  const form = root.querySelector<HTMLElement>('[data-form]')!;
  const paint = () => {
    form.innerHTML = renderForm(d, 'Salvar');
    bindForm(form, d, paint, save);
  };
  const save = (dd: Draft) => {
    const p = toPurchase(dd);
    draft = newDraft(dd);
    commit((s) => s.purchases.push(p));
    toast(`Salvo · ${cardName(state, p.cardId)} · ${state.people[p.person]} · ${money(p.amount)}`);
  };
  bindForm(form, d, paint, save);
}

/** Ao abrir a aba Gasto, coloca o cursor no valor. */
export function focusAmount(root: HTMLElement) {
  root.querySelector<HTMLInputElement>('[data-amount]')?.focus();
}
