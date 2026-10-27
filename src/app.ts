// Estado da tela (aba, mês e filtros) — não é salvo, só vale enquanto o app está aberto.
import { todayIso } from './format';
import type { CardFilter, PersonFilter } from './selectors';
import type { YM } from './types';

export type Tab = 'gasto' | 'resumo' | 'registros' | 'config';

export const view: { tab: Tab; month: YM; card: CardFilter; person: PersonFilter } = {
  tab: 'gasto',
  month: todayIso().slice(0, 7),
  card: 'all',
  person: 'all',
};

let renderFn: () => void = () => {};
export function setRender(fn: () => void) {
  renderFn = fn;
}
export function rerender() {
  renderFn();
}
