import { view } from '../app';
import type { Installment } from '../billing';
import { dayHeading, esc, money, todayIso } from '../format';
import { bindForm, draftFrom, renderForm, toPurchase, type Draft } from '../purchaseForm';
import { allInstallments, cardName, categoryName, matches, projectedRecurring, sum } from '../selectors';
import { commit, state } from '../store';
import { confirmSheet, monthNav, openSheet, toast } from '../ui';
import { bindNav, filters } from './resumo';

export function renderRegistros(root: HTMLElement) {
  const today = todayIso();
  const month = view.month;
  const items = [
    ...allInstallments(state).filter((i) => i.month === month),
    ...projectedRecurring(state, month, today),
  ].filter((i) => matches(i, view.card, view.person));

  const projected = items.filter((i) => i.purchaseId.startsWith('prev-'));
  const carried = items.filter((i) => !projected.includes(i) && isCarried(i));
  const regular = items.filter((i) => !projected.includes(i) && !carried.includes(i))
    .sort((a, b) => b.date.localeCompare(a.date));

  const groups: string[] = [];
  let currentDay = '';
  let buf: string[] = [];
  const flush = () => { if (buf.length) groups.push(`<h2>${currentDay}</h2><div class="list">${buf.join('')}</div>`); buf = []; };
  for (const it of regular) {
    const h = dayHeading(it.date, today);
    if (h !== currentDay) { flush(); currentDay = h; }
    buf.push(row(it));
  }
  flush();
  if (carried.length) groups.push(`<h2>Parcelas de compras anteriores</h2><div class="list">${carried.map(row).join('')}</div>`);
  if (projected.length) groups.push(`<h2>Previstos (cobranças fixas)</h2><div class="list">${projected.map(row).join('')}</div>`);

  root.innerHTML = `
    <h1>Registros</h1>
    ${monthNav(month)}
    ${filters()}
    <div class="small muted" style="margin-top:14px">Lançamentos nas faturas deste mês · ${items.length} · <b class="num" style="color:var(--ink)">${money(sum(items))}</b></div>
    ${groups.join('') || '<div class="empty">Nada registrado neste mês.</div>'}`;

  bindNav(root);
  root.querySelectorAll<HTMLElement>('[data-open]').forEach((el) =>
    el.addEventListener('click', () => openDetail(el.dataset.open!)));
}

/** Parcela 2 em diante: a compra foi feita numa fatura anterior. */
function isCarried(i: Installment): boolean {
  return i.index > 1;
}

function row(it: Installment): string {
  const prev = it.purchaseId.startsWith('prev-');
  const rec = it.recurringId ? state.recurring.find((r) => r.id === it.recurringId) : undefined;
  const title = rec ? rec.name : categoryName(state, it.categoryId);
  const time = it.date.slice(11, 16);
  const when = prev ? `dia ${Number(it.date.slice(8, 10))}` : (isCarried(it) ? `compra de ${it.date.slice(8, 10)}/${it.date.slice(5, 7)}` : time === '00:00' ? '' : time);
  const sub = [cardName(state, it.cardId), state.people[it.person], when].filter(Boolean).join(' · ');
  const parc = it.count > 1 ? `parcela ${it.index}/${it.count}` : rec ? 'recorrente' : '1x';
  const attrs = prev ? '' : ` data-open="${it.purchaseId}"`;
  return `<button class="item"${attrs}>
    <div><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div>
    <div class="r"><div class="num t">${money(it.amount)}</div><div class="s">${prev ? '<span class="tag prev">previsto</span>' : parc}</div></div>
  </button>`;
}

function openDetail(id: string) {
  const p = state.purchases.find((x) => x.id === id);
  if (!p) return;
  const d = draftFrom(p);
  const info = `${cardName(state, p.cardId)} · ${state.people[p.person]} · ${categoryName(state, p.categoryId)}`;
  openSheet('Gasto', `
    <div class="hero num">${money(p.amount)}</div>
    <div class="muted">${esc(info)}</div>
    <div class="muted small" style="margin-top:4px">${p.date.slice(8, 10)}/${p.date.slice(5, 7)}/${p.date.slice(0, 4)} ${p.date.slice(11, 16)}
      · ${p.installments > 1 ? `${p.installments}x` : '1x'}${p.recurringId ? ' · cobrança fixa' : ''}</div>
    <p class="small muted">Editar ou apagar vale para a compra inteira (todas as parcelas).</p>
    <button class="btn" data-edit>Editar</button>
    <button class="btn danger slim" data-del>Apagar</button>`, (el, close) => {
    el.querySelector('[data-edit]')!.addEventListener('click', () => { close(); openEdit(id, d); });
    el.querySelector('[data-del]')!.addEventListener('click', async () => {
      close();
      if (await confirmSheet('Apagar gasto?', `${money(p.amount)} · ${info}`, 'Apagar')) {
        commit((s) => { s.purchases = s.purchases.filter((x) => x.id !== id); });
        toast('Gasto apagado');
      }
    });
  });
}

function openEdit(id: string, d: Draft) {
  const original = state.purchases.find((x) => x.id === id)!;
  openSheet('Editar gasto', `<div data-form></div>`, (el, close) => {
    const form = el.querySelector<HTMLElement>('[data-form]')!;
    const paint = () => { form.innerHTML = renderForm(d, 'Salvar alterações'); bindForm(form, d, paint, save); };
    const save = (dd: Draft) => {
      if (!dd.date) dd.date = original.date;
      const updated = toPurchase(dd, id, original.recurringId);
      commit((s) => { s.purchases = s.purchases.map((x) => (x.id === id ? updated : x)); });
      close();
      toast('Gasto atualizado');
    };
    paint();
  });
}
