import { view, rerender } from '../app';
import { addMonths, availableLimit, closingDate, dueDate, fixedStatus, invoiceStatus, type InvoiceStatus } from '../billing';
import { dayMonth, esc, money, monthShort, todayIso } from '../format';
import { allInstallments, byCategory, fixedBillsFor, matches, projectedRecurring, sum } from '../selectors';
import { commit, state } from '../store';
import type { Card, YM } from '../types';
import { bindChips, bindDonuts, chips, donut, monthNav } from '../ui';

const STATUS_LABEL: Record<InvoiceStatus, string> = { paga: '✓ paga', aberta: '● em aberto', atrasada: '! atrasada' };

export function tag(status: InvoiceStatus, extra = ''): string {
  return `<span class="tag ${status}">${STATUS_LABEL[status]}${extra}</span>`;
}

export function filters(): string {
  const cardOpts = [{ value: 'all', label: 'Todos' }, ...state.cards.map((c) => ({ value: c.id, label: c.name }))];
  const personOpts = [
    { value: 'all', label: `Todos (${state.people.eu.toLowerCase()} + ${state.people.mae.toLowerCase()})` },
    { value: 'eu', label: state.people.eu },
    { value: 'mae', label: state.people.mae },
  ];
  return `<div class="label" style="margin-top:4px">Cartão</div>
    <div class="chips scroll">${chips('fcard', cardOpts, view.card)}</div>
    <div class="label">Pessoa</div>
    <div class="chips scroll">${chips('fperson', personOpts, view.person)}</div>`;
}

/** Liga a navegação de mês e os filtros (compartilhados entre Resumo e Registros). */
export function bindNav(root: HTMLElement, extra?: (group: string, val: string) => void) {
  root.querySelectorAll<HTMLButtonElement>('[data-month]').forEach((b) =>
    b.addEventListener('click', () => { view.month = addMonths(view.month, Number(b.dataset.month)); rerender(); }));
  bindChips(root, (group, val) => {
    if (group === 'fcard') view.card = val;
    else if (group === 'fperson') view.person = val as typeof view.person;
    else return extra?.(group, val);
    rerender();
  });
}

export function renderResumo(root: HTMLElement) {
  const today = todayIso();
  const month = view.month;
  if (view.card !== 'all' && !state.cards.some((c) => c.id === view.card)) view.card = 'all';

  const all = allInstallments(state);
  const monthItems = [...all.filter((i) => i.month === month), ...projectedRecurring(state, month, today)];

  const backupDue = state.purchases.length > 0 &&
    (!state.lastBackup || (Date.now() - new Date(state.lastBackup).getTime()) / 86400000 > 30);

  let body: string;
  if (view.card === 'all') body = allCards(monthItems, month, today);
  else body = oneCard(state.cards.find((c) => c.id === view.card)!, monthItems, all, month, today);

  root.innerHTML = `
    ${backupDue ? `<button class="banner" data-goto-backup>💾 Faz mais de 30 dias sem backup. Toque para salvar uma cópia dos seus dados.</button>` : ''}
    ${monthNav(month)}
    ${filters()}
    ${body}`;

  bindNav(root);
  bindDonuts(root);
  root.querySelector('[data-goto-backup]')?.addEventListener('click', () => { view.tab = 'config'; rerender(); });
  root.querySelectorAll<HTMLElement>('[data-pick-card]').forEach((b) =>
    b.addEventListener('click', () => { view.card = b.dataset.pickCard!; rerender(); }));
  root.querySelectorAll<HTMLElement>('[data-pay]').forEach((b) =>
    b.addEventListener('click', () => togglePaid('invoicePayments', b.dataset.pay!)));
  root.querySelectorAll<HTMLElement>('[data-pay-fixed]').forEach((b) =>
    b.addEventListener('click', () => togglePaid('fixedPayments', b.dataset.payFixed!)));
}

function togglePaid(field: 'invoicePayments' | 'fixedPayments', key: string) {
  commit((s) => {
    if (s[field][key]) delete s[field][key];
    else s[field][key] = todayIso();
  });
}

function projectedNote(items: { purchaseId: string; amount: number }[]): string {
  const prev = sum(items.filter((i) => i.purchaseId.startsWith('prev-')));
  return prev ? `<div class="small muted" style="margin-top:6px">Inclui ${money(prev)} previsto de cobranças fixas.</div>` : '';
}

function allCards(monthItems: ReturnType<typeof allInstallments>, month: YM, today: string): string {
  const mine = monthItems.filter((i) => matches(i, 'all', view.person));
  const cardsTotal = sum(mine);
  const fixed = fixedBillsFor(state, month, view.person);
  const fixedTotal = fixed.reduce((a, f) => a + f.bill.amount, 0);

  const rows = state.cards.map((c) => {
    const invoice = monthItems.filter((i) => i.cardId === c.id);
    const part = sum(invoice.filter((i) => matches(i, c.id, view.person)));
    const st = invoice.length ? tag(invoiceStatus(c, month, state.invoicePayments[`${c.id}|${month}`], today)) : '';
    return `<button class="item" data-pick-card="${c.id}">
      <div><div class="t">${esc(c.name)}</div><div class="s">vence ${dayMonth(dueDate(c, month))}</div></div>
      <div class="r"><div class="num t">${money(part)}</div>${st}</div></button>`;
  }).join('');

  return `
    <h2>Total do mês</h2>
    <div class="hero num">${money(cardsTotal + fixedTotal)}</div>
    ${fixed.length ? `<div class="split"><span>Cartões ${money(cardsTotal)}</span><span>Contas fixas ${money(fixedTotal)}</span></div>` : ''}
    ${projectedNote(mine)}
    <h2>Faturas</h2>
    <div class="list">${rows}</div>
    <h2>Por categoria · todos os cartões</h2>
    <div class="card">${donut(byCategory(mine))}</div>
    ${fixedSection(fixed, month, today)}`;
}

function fixedSection(fixed: ReturnType<typeof fixedBillsFor>, month: YM, today: string): string {
  if (!fixed.length) return '';
  const rows = fixed.map(({ bill, n }) => {
    const key = `${bill.id}|${month}`;
    const paid = state.fixedPayments[key];
    const st = fixedStatus(bill, month, paid, today);
    const parc = bill.totalInstallments ? ` · ${n}/${bill.totalInstallments}` : '';
    return `<div class="item">
      <div><div class="t">${esc(bill.name)}</div>
        <div class="s">${esc(state.people[bill.person])} · vence dia ${bill.dueDay}${parc}</div></div>
      <div class="r"><div class="num t">${money(bill.amount)}</div>
        <button class="tag ${st}" data-pay-fixed="${key}">${paid ? `✓ paga ${dayMonth(paid)}` : st === 'atrasada' ? '! marcar paga' : 'marcar paga'}</button></div>
    </div>`;
  }).join('');
  return `<h2>Contas fixas (fora do cartão)</h2><div class="list">${rows}</div>`;
}

function oneCard(card: Card, monthItems: ReturnType<typeof allInstallments>, all: ReturnType<typeof allInstallments>, month: YM, today: string): string {
  const invoice = monthItems.filter((i) => i.cardId === card.id);
  const invoiceTotal = sum(invoice);
  const shown = invoice.filter((i) => matches(i, card.id, view.person));
  const key = `${card.id}|${month}`;
  const paidAt = state.invoicePayments[key];
  const status = invoiceStatus(card, month, paidAt, today);

  const eu = sum(invoice.filter((i) => i.person === 'eu'));
  const mae = sum(invoice.filter((i) => i.person === 'mae'));
  const who = view.person === 'all' ? '' : ` · parte de ${state.people[view.person]}`;

  const free = availableLimit(card, all, state.invoicePayments);
  const usedPct = card.limit > 0 ? Math.min(100, Math.max(0, ((card.limit - free) / card.limit) * 100)) : 0;
  const limitHtml = card.limit > 0
    ? `<div class="bar${free < 0 ? ' over' : ''}"><i style="width:${usedPct}%"></i></div>
       <div class="small muted">Limite livre <b class="num" style="color:var(--ink)">${money(free)}</b> de ${money(card.limit)}</div>`
    : `<div class="small muted" style="margin-top:8px">Defina o limite deste cartão em Config. para ver o limite livre.</div>`;

  // Próximos meses: o que já está comprometido (parcelas + cobranças fixas previstas).
  const next: string[] = [];
  for (let k = 1; k <= 12 && next.length < 6; k++) {
    const m = addMonths(month, k);
    const items = [...all.filter((i) => i.month === m), ...projectedRecurring(state, m, today)]
      .filter((i) => matches(i, card.id, view.person));
    const v = sum(items);
    if (v) next.push(`<div class="item"><span>${monthShort(m)}</span><b class="num">${money(v)}</b></div>`);
  }

  return `
    <div class="card" style="margin-top:14px">
      <div class="item" style="padding:0 0 6px">
        <div class="t">${esc(card.name)}${esc(who)}</div>${invoice.length || paidAt ? tag(status) : ''}
      </div>
      <div class="hero num">${money(view.person === 'all' ? invoiceTotal : sum(shown))}</div>
      ${view.person === 'all'
        ? `<div class="split"><span>${esc(state.people.eu)} ${money(eu)}</span><span>${esc(state.people.mae)} ${money(mae)}</span></div>`
        : `<div class="split"><span>Fatura inteira: ${money(invoiceTotal)}</span></div>`}
      <div class="small muted" style="margin-top:6px">Fecha ${dayMonth(closingDate(card, month))} · vence ${dayMonth(dueDate(card, month))}</div>
      ${projectedNote(shown)}
      ${limitHtml}
      ${paidAt
        ? `<button class="btn ok slim" data-pay="${key}">✓ Paga em ${dayMonth(paidAt)} · desfazer</button>`
        : `<button class="btn slim" data-pay="${key}">Marcar fatura como paga</button>`}
    </div>
    <h2>Por categoria · ${esc(card.name)}${esc(who)}</h2>
    <div class="card">${donut(byCategory(shown))}</div>
    ${next.length ? `<h2>Próximos meses</h2><div class="list">${next.join('')}</div>` : ''}`;
}
