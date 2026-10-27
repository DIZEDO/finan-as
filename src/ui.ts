// Peças de interface reutilizadas pelas abas.
import { esc, money, monthLabel } from './format';
import { categoryName, type Slice } from './selectors';
import { OTHER_CATEGORY, state } from './store';
import type { YM } from './types';

export function chips(group: string, options: { value: string; label: string }[], selected: string | null, extra = ''): string {
  return options
    .map((o) => `<button class="chip${o.value === selected ? ' on' : ''}" data-chip="${group}" data-val="${esc(o.value)}">${esc(o.label)}</button>`)
    .join('') + extra;
}

/** Liga os botões de chip: clicar chama onPick(grupo, valor). */
export function bindChips(root: HTMLElement, onPick: (group: string, value: string) => void) {
  root.querySelectorAll<HTMLButtonElement>('[data-chip]').forEach((b) => {
    b.addEventListener('click', () => onPick(b.dataset.chip!, b.dataset.val!));
  });
}

export function monthNav(month: YM): string {
  return `<div class="month">
    <button data-month="-1" aria-label="Mês anterior">‹</button>
    <b>${monthLabel(month)}</b>
    <button data-month="1" aria-label="Próximo mês">›</button>
  </div>`;
}

let toastTimer = 0;
export function toast(text: string) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2200);
}

/** Abre uma folha inferior. `bind` recebe o elemento e a função para fechar. */
export function openSheet(title: string, body: string, bind: (el: HTMLElement, close: () => void) => void) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="grab"></div><h3>${esc(title)}</h3>${body}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  document.body.append(bg);
  bind(bg.querySelector('.sheet')!, close);
}

export function confirmSheet(title: string, message: string, okLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    openSheet(title, `<p class="muted">${esc(message)}</p>
      <button class="btn danger" data-ok>${esc(okLabel)}</button>
      <button class="btn secondary slim" data-cancel>Cancelar</button>`, (el, close) => {
      el.querySelector('[data-ok]')!.addEventListener('click', () => { close(); resolve(true); });
      el.querySelector('[data-cancel]')!.addEventListener('click', () => { close(); resolve(false); });
    });
  });
}

const SLOTS = 7;

/** Cor da categoria pela sua posição na lista (cor segue a categoria, não o ranking). */
function categoryColor(id: string): string {
  if (id === OTHER_CATEGORY) return 'var(--s-other)';
  const i = state.categories.filter((c) => c.id !== OTHER_CATEGORY).findIndex((c) => c.id === id);
  return i >= 0 && i < SLOTS ? `var(--s${i + 1})` : 'var(--s-other)';
}

/** Gráfico de rosca por categoria + legenda com valor e %. */
export function donut(slices: Slice[]): string {
  const total = slices.reduce((a, s) => a + s.amount, 0);
  if (total <= 0) return `<div class="empty">Nenhum gasto neste filtro.</div>`;

  // Categorias além das 7 primeiras cores entram em "Outros".
  const merged = new Map<string, number>();
  for (const s of slices) {
    const key = categoryColor(s.categoryId) === 'var(--s-other)' ? OTHER_CATEGORY : s.categoryId;
    merged.set(key, (merged.get(key) ?? 0) + s.amount);
  }
  const order = [...state.categories.map((c) => c.id)];
  const list = [...merged].map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount || order.indexOf(a.categoryId) - order.indexOf(b.categoryId));

  const r = 52, c = 2 * Math.PI * r, gap = list.length > 1 ? 2 : 0;
  let offset = 0;
  const segs = list.map((s, i) => {
    const len = (s.amount / total) * c;
    const seg = `<circle class="seg" data-i="${i}" cx="70" cy="70" r="${r}" fill="none" stroke="${categoryColor(s.categoryId)}"
      stroke-width="20" stroke-dasharray="${Math.max(len - gap, 0.01)} ${c}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)" />`;
    offset += len;
    return seg;
  }).join('');

  const legend = list.map((s, i) => {
    const pct = Math.round((s.amount / total) * 1000) / 10;
    return `<button data-i="${i}"><span class="dot" style="background:${categoryColor(s.categoryId)}"></span>
      <span class="nm">${esc(categoryName(state, s.categoryId))}</span>
      <span class="v">${money(s.amount)}<small>${pct.toLocaleString('pt-BR')}%</small></span></button>`;
  }).join('');

  const data = esc(JSON.stringify(list.map((s) => [categoryName(state, s.categoryId), money(s.amount)])));
  return `<div class="chart" data-donut='${data}' data-total="${esc(money(total))}">
    <svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Gastos por categoria">
      ${segs}
      <text x="70" y="66" font-size="11" class="dl" style="fill:var(--muted)">Total</text>
      <text x="70" y="84" font-size="14" font-weight="700" class="dv">${esc(money(total))}</text>
    </svg>
    <div class="legend">${legend}</div>
  </div>`;
}

/** Tocar numa fatia ou linha da legenda destaca a categoria e mostra o valor no centro. */
export function bindDonuts(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-donut]').forEach((chart) => {
    const data = JSON.parse(chart.dataset.donut!) as [string, string][];
    const svg = chart.querySelector('svg')!;
    const dl = svg.querySelector('.dl')!, dv = svg.querySelector('.dv')!;
    let current = -1;
    const pick = (i: number) => {
      current = current === i ? -1 : i;
      svg.classList.toggle('focus', current >= 0);
      chart.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('hl', Number((el as HTMLElement).dataset.i) === current));
      const label = current >= 0 ? data[current][0] : 'Total';
      dl.textContent = label.length > 14 ? label.slice(0, 13) + '…' : label;
      dv.textContent = current >= 0 ? data[current][1] : chart.dataset.total!;
    };
    chart.querySelectorAll<HTMLElement>('[data-i]').forEach((el) => el.addEventListener('click', () => pick(Number(el.dataset.i))));
  });
}

export const ICONS = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};
