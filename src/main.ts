import './styles.css';
import { rerender, setRender, view, type Tab } from './app';
import { todayIso } from './format';
import { commit, generateRecurring, initStore, state, subscribe } from './store';
import { ICONS } from './ui';
import { renderConfig } from './views/config';
import { focusAmount, renderGasto } from './views/gasto';
import { renderRegistros } from './views/registros';
import { renderResumo } from './views/resumo';

const app = document.getElementById('app')!;
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'gasto', label: 'Gasto', icon: ICONS.add },
  { id: 'resumo', label: 'Resumo', icon: ICONS.chart },
  { id: 'registros', label: 'Registros', icon: ICONS.list },
  { id: 'config', label: 'Config.', icon: ICONS.gear },
];

const tabbar = document.createElement('div');
tabbar.className = 'tabbar';
document.body.append(tabbar);

function render() {
  if (view.tab === 'gasto') renderGasto(app);
  else if (view.tab === 'resumo') renderResumo(app);
  else if (view.tab === 'registros') renderRegistros(app);
  else renderConfig(app);

  tabbar.innerHTML = `<nav>${TABS.map((t) =>
    `<button class="${t.id === view.tab ? 'on' : ''}" data-tab="${t.id}" aria-label="${t.label}">${t.icon}<span>${t.label}</span></button>`).join('')}</nav>`;
  tabbar.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      const tab = b.dataset.tab as Tab;
      if (tab === view.tab) return;
      view.tab = tab;
      rerender();
      window.scrollTo(0, 0);
      if (tab === 'gasto') focusAmount(app);
    }));
}

/** Se o app ficou aberto em segundo plano, lança as cobranças fixas que chegaram. */
function catchUpRecurring() {
  const before = state.purchases.length;
  const probe = structuredClone(state);
  generateRecurring(probe, todayIso());
  if (probe.purchases.length !== before) commit((s) => generateRecurring(s, todayIso()));
}

async function start() {
  setRender(render);
  subscribe(render);
  try {
    await initStore(todayIso());
  } catch {
    app.innerHTML = '<div class="empty">Não foi possível abrir o armazenamento do aparelho. Se estiver em navegação privada, abra numa aba normal.</div>';
    return;
  }
  render();
  focusAmount(app);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) catchUpRecurring(); });

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

start();
