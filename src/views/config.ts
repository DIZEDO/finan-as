import { fixedInstallmentFor, monthlyOccurrences } from '../billing';
import { dayMonth, esc, money, moneyPlain, parseMoney, todayIso } from '../format';
import { cardName } from '../selectors';
import { OTHER_CATEGORY, commit, exportBackup, generateRecurring, parseBackup, replaceState, state, uid } from '../store';
import type { Card, FixedBill, Person, Recurring } from '../types';
import { confirmSheet, openSheet, toast } from '../ui';

export function renderConfig(root: HTMLElement) {
  const cards = state.cards.map((c) => `<button class="item" data-card="${c.id}">
      <div><div class="t">${esc(c.name)}</div>
      <div class="s">${c.limit ? `limite ${money(c.limit)}` : 'limite não definido'} · fecha dia ${c.closingDay} · vence dia ${c.dueDay}</div></div>
      <span class="chev">›</span></button>`).join('');

  const cats = state.categories.map((c) =>
    `<button class="chip" data-cat="${c.id}">${esc(c.name)}</button>`).join('');

  const recurring = state.recurring.filter((r) => r.active).map((r) => `<button class="item" data-rec="${r.id}">
      <div><div class="t">${esc(r.name)}</div>
      <div class="s">${esc(cardName(state, r.cardId))} · ${esc(state.people[r.person])} · todo dia ${r.day}</div></div>
      <div class="r num t">${money(r.amount)}</div></button>`).join('');

  const month = todayIso().slice(0, 7);
  const fixed = state.fixedBills.filter((b) => b.active).map((b) => {
    const n = fixedInstallmentFor(b, month);
    const parc = b.totalInstallments ? (n ? ` · parcela ${n}/${b.totalInstallments}` : ' · encerrada') : ' · sem fim';
    return `<button class="item" data-fixed="${b.id}">
      <div><div class="t">${esc(b.name)}</div>
      <div class="s">${esc(state.people[b.person])} · vence dia ${b.dueDay}${parc}</div></div>
      <div class="r num t">${money(b.amount)}</div></button>`;
  }).join('');

  root.innerHTML = `
    <h1>Configurações</h1>

    <h2>Cartões</h2>
    <div class="list">${cards}<button class="item link" data-card-new>+ Adicionar cartão</button></div>

    <h2>Categorias</h2>
    <div class="chips">${cats}<button class="chip add" data-cat-new>+ nova</button></div>

    <h2>Pessoas</h2>
    <div class="list">
      <button class="item" data-person="eu"><span>${esc(state.people.eu)}</span><span class="chev">✎</span></button>
      <button class="item" data-person="mae"><span>${esc(state.people.mae)}</span><span class="chev">✎</span></button>
    </div>

    <h2>Cobranças fixas no cartão</h2>
    <p class="small muted" style="margin-top:-2px">Internet, celular... lançadas sozinhas todo mês no dia da cobrança.</p>
    <div class="list">${recurring}<button class="item link" data-rec-new>+ Adicionar cobrança</button></div>

    <h2>Contas fixas fora do cartão</h2>
    <p class="small muted" style="margin-top:-2px">Empréstimos e contas pagas com dinheiro da conta. Não mexem no limite.</p>
    <div class="list">${fixed}<button class="item link" data-fixed-new>+ Adicionar conta</button></div>

    <h2>Backup</h2>
    <div class="card">
      <div class="small muted">Seus dados ficam só neste celular. Salve uma cópia de vez em quando (ex.: no iCloud Drive pelo app Arquivos).</div>
      <div class="small" style="margin-top:6px">Último backup: <b>${state.lastBackup ? dayMonth(state.lastBackup) + '/' + state.lastBackup.slice(0, 4) : 'nunca'}</b></div>
      <button class="btn slim" data-export>Salvar backup</button>
      <button class="btn secondary slim" data-import>Restaurar de um arquivo</button>
      <input type="file" accept="application/json,.json" data-file hidden />
    </div>

    <h2>Instalar no iPhone</h2>
    <div class="card small muted">No Safari, toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>. O app abre em tela cheia e funciona sem internet.</div>
  `;

  const on = (sel: string, fn: (el: HTMLElement) => void) =>
    root.querySelectorAll<HTMLElement>(sel).forEach((el) => el.addEventListener('click', () => fn(el)));
  on('[data-card]', (el) => editCard(state.cards.find((c) => c.id === el.dataset.card)));
  on('[data-card-new]', () => editCard());
  on('[data-cat]', (el) => editCategory(el.dataset.cat!));
  on('[data-cat-new]', () => editCategory());
  on('[data-person]', (el) => editPerson(el.dataset.person as Person));
  on('[data-rec]', (el) => editRecurring(state.recurring.find((r) => r.id === el.dataset.rec)));
  on('[data-rec-new]', () => editRecurring());
  on('[data-fixed]', (el) => editFixed(state.fixedBills.find((b) => b.id === el.dataset.fixed)));
  on('[data-fixed-new]', () => editFixed());
  on('[data-export]', () => saveBackup());
  const file = root.querySelector<HTMLInputElement>('[data-file]')!;
  on('[data-import]', () => file.click());
  file.addEventListener('change', () => file.files?.[0] && restoreBackup(file.files[0]));
}

const val = (el: HTMLElement, name: string) => el.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value.trim();
const dayOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31;

function moneyField(name: string, label: string, cents: number) {
  return `<label class="field"><span>${label}</span><input class="input" name="${name}" inputmode="decimal" placeholder="0,00" value="${cents ? moneyPlain(cents) : ''}" /></label>`;
}
function dayField(name: string, label: string, day: number | '') {
  return `<label class="field"><span>${label}</span><input class="input" name="${name}" type="number" inputmode="numeric" min="1" max="31" value="${day}" /></label>`;
}
function textField(name: string, label: string, value: string, placeholder = '') {
  return `<label class="field"><span>${label}</span><input class="input" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" /></label>`;
}
function select(name: string, label: string, options: { value: string; label: string }[], selected: string) {
  return `<label class="field"><span>${label}</span><select class="input" name="${name}">${options
    .map((o) => `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
}
const personOptions = () => [{ value: 'eu', label: state.people.eu }, { value: 'mae', label: state.people.mae }];

function editCard(card?: Card) {
  openSheet(card ? 'Editar cartão' : 'Novo cartão', `
    ${textField('name', 'Nome', card?.name ?? '', 'Ex.: Nubank')}
    ${moneyField('limit', 'Limite total (R$)', card?.limit ?? 0)}
    <div class="row2">${dayField('closing', 'Fecha dia', card?.closingDay ?? '')}${dayField('due', 'Vence dia', card?.dueDay ?? '')}</div>
    <button class="btn" data-save>Salvar</button>
    ${card ? '<button class="btn danger slim" data-del>Remover cartão</button>' : ''}`, (el, close) => {
    el.querySelector('[data-save]')!.addEventListener('click', () => {
      const name = val(el, 'name');
      const closingDay = Number(val(el, 'closing')), dueDay = Number(val(el, 'due'));
      if (!name) return toast('Digite o nome');
      if (!dayOk(closingDay) || !dayOk(dueDay)) return toast('Dias devem ser de 1 a 31');
      if (closingDay === dueDay) return toast('Fechamento e vencimento não podem ser no mesmo dia');
      const next: Card = { id: card?.id ?? uid(), name, limit: parseMoney(val(el, 'limit')), closingDay, dueDay };
      commit((s) => { s.cards = card ? s.cards.map((c) => (c.id === card.id ? next : c)) : [...s.cards, next]; });
      close();
      toast('Cartão salvo');
    });
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      const count = state.purchases.filter((p) => p.cardId === card!.id).length;
      const ok = await confirmSheet(`Remover ${card!.name}?`,
        count ? `Os ${count} gastos e as cobranças fixas deste cartão também serão apagados.` : 'Esta ação não pode ser desfeita.', 'Remover');
      if (!ok) return;
      commit((s) => {
        s.cards = s.cards.filter((c) => c.id !== card!.id);
        s.purchases = s.purchases.filter((p) => p.cardId !== card!.id);
        s.recurring = s.recurring.filter((r) => r.cardId !== card!.id);
      });
      toast('Cartão removido');
    });
  });
}

function editCategory(id?: string) {
  const cat = state.categories.find((c) => c.id === id);
  const locked = id === OTHER_CATEGORY;
  openSheet(cat ? 'Categoria' : 'Nova categoria', `
    ${textField('name', 'Nome', cat?.name ?? '', 'Ex.: Farmácia')}
    <button class="btn" data-save>Salvar</button>
    ${cat && !locked ? '<button class="btn danger slim" data-del>Apagar categoria</button>' : ''}
    ${locked ? '<p class="small muted">“Outros” recebe os gastos de categorias apagadas e não pode ser removida.</p>' : ''}`, (el, close) => {
    el.querySelector('[data-save]')!.addEventListener('click', () => {
      const name = val(el, 'name');
      if (!name) return toast('Digite o nome');
      commit((s) => {
        if (cat) s.categories = s.categories.map((c) => (c.id === cat.id ? { ...c, name } : c));
        else s.categories.splice(Math.max(0, s.categories.findIndex((c) => c.id === OTHER_CATEGORY)), 0, { id: uid(), name });
      });
      close();
    });
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (!(await confirmSheet(`Apagar ${cat!.name}?`, 'Os gastos desta categoria passam para “Outros”.', 'Apagar'))) return;
      commit((s) => {
        s.categories = s.categories.filter((c) => c.id !== cat!.id);
        if (!s.categories.some((c) => c.id === OTHER_CATEGORY)) s.categories.push({ id: OTHER_CATEGORY, name: 'Outros' });
        s.purchases.forEach((p) => { if (p.categoryId === cat!.id) p.categoryId = OTHER_CATEGORY; });
        s.recurring.forEach((r) => { if (r.categoryId === cat!.id) r.categoryId = OTHER_CATEGORY; });
      });
    });
  });
}

function editPerson(p: Person) {
  openSheet('Nome', `${textField('name', 'Como aparece no app', state.people[p])}<button class="btn" data-save>Salvar</button>`, (el, close) => {
    el.querySelector('[data-save]')!.addEventListener('click', () => {
      const name = val(el, 'name');
      if (!name) return toast('Digite o nome');
      commit((s) => { s.people[p] = name; });
      close();
    });
  });
}

function editRecurring(rec?: Recurring) {
  if (!state.cards.length) return toast('Cadastre um cartão primeiro');
  const cards = state.cards.map((c) => ({ value: c.id, label: c.name }));
  const cats = state.categories.map((c) => ({ value: c.id, label: c.name }));
  openSheet(rec ? 'Cobrança fixa no cartão' : 'Nova cobrança no cartão', `
    ${textField('name', 'Nome', rec?.name ?? '', 'Ex.: Internet')}
    ${moneyField('amount', 'Valor mensal (R$)', rec?.amount ?? 0)}
    <div class="row2">${select('card', 'Cartão', cards, rec?.cardId ?? cards[0].value)}${select('person', 'De quem', personOptions(), rec?.person ?? 'eu')}</div>
    <div class="row2">${select('cat', 'Categoria', cats, rec?.categoryId ?? OTHER_CATEGORY)}${dayField('day', 'Dia da cobrança', rec?.day ?? '')}</div>
    <p class="small muted" data-next></p>
    ${rec ? '<p class="small muted">Mudar o valor vale para as próximas cobranças. Para corrigir um mês, edite o lançamento em Registros.</p>' : ''}
    <button class="btn" data-save>Salvar</button>
    ${rec ? '<button class="btn danger slim" data-del>Encerrar cobrança</button>' : ''}`, (el, close) => {
    const nextEl = el.querySelector<HTMLElement>('[data-next]')!;
    const showNext = () => {
      const day = Number(val(el, 'day'));
      if (!dayOk(day) || rec) { nextEl.textContent = ''; return; }
      const today = todayIso();
      const [first] = monthlyOccurrences(day, today, `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`);
      nextEl.textContent = first ? `Primeira cobrança lançada em ${dayMonth(first)}${first === today ? ' (hoje)' : ''}.` : '';
    };
    el.querySelector('[name="day"]')!.addEventListener('input', showNext);
    el.querySelector('[data-save]')!.addEventListener('click', () => {
      const name = val(el, 'name'), amount = parseMoney(val(el, 'amount')), day = Number(val(el, 'day'));
      if (!name) return toast('Digite o nome');
      if (!amount) return toast('Digite o valor');
      if (!dayOk(day)) return toast('Dia deve ser de 1 a 31');
      const today = todayIso();
      const fields = { name, amount, day, cardId: val(el, 'card'), person: val(el, 'person') as Person, categoryId: val(el, 'cat') };
      commit((s) => {
        if (rec) Object.assign(s.recurring.find((r) => r.id === rec.id)!, fields);
        else s.recurring.push({ id: uid(), ...fields, startDate: today, generatedUntil: '', active: true });
        generateRecurring(s, today);
      });
      close();
      toast('Cobrança salva');
    });
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (!(await confirmSheet(`Encerrar ${rec!.name}?`, 'Não será mais lançada nos próximos meses. Os lançamentos já feitos continuam em Registros.', 'Encerrar'))) return;
      commit((s) => { s.recurring.find((r) => r.id === rec!.id)!.active = false; });
    });
  });
}

function editFixed(bill?: FixedBill) {
  const month = todayIso().slice(0, 7);
  const current = bill ? fixedInstallmentFor(bill, month) ?? bill.refInstallment : 1;
  const hasEnd = bill ? bill.totalInstallments !== null : true;
  openSheet(bill ? 'Conta fixa' : 'Nova conta fixa', `
    ${textField('name', 'Nome', bill?.name ?? '', 'Ex.: Empréstimo')}
    ${moneyField('amount', 'Valor mensal (R$)', bill?.amount ?? 0)}
    <div class="row2">${select('person', 'De quem', personOptions(), bill?.person ?? 'eu')}${dayField('due', 'Vence dia', bill?.dueDay ?? '')}</div>
    ${select('kind', 'Duração', [{ value: 'end', label: 'Tem número de parcelas' }, { value: 'forever', label: 'Sem fim' }], hasEnd ? 'end' : 'forever')}
    <div class="row2" data-parc ${hasEnd ? '' : 'hidden'}>
      ${dayFieldN('current', 'Parcela deste mês', current)}${dayFieldN('total', 'Total de parcelas', bill?.totalInstallments ?? '')}
    </div>
    <button class="btn" data-save>Salvar</button>
    ${bill ? '<button class="btn danger slim" data-del>Apagar conta</button>' : ''}`, (el, close) => {
    const kind = el.querySelector<HTMLSelectElement>('[name="kind"]')!;
    kind.addEventListener('change', () => { el.querySelector<HTMLElement>('[data-parc]')!.hidden = kind.value !== 'end'; });
    el.querySelector('[data-save]')!.addEventListener('click', () => {
      const name = val(el, 'name'), amount = parseMoney(val(el, 'amount')), dueDay = Number(val(el, 'due'));
      if (!name) return toast('Digite o nome');
      if (!amount) return toast('Digite o valor');
      if (!dayOk(dueDay)) return toast('Dia deve ser de 1 a 31');
      let total: number | null = null, cur = 1;
      if (kind.value === 'end') {
        total = Number(val(el, 'total')); cur = Number(val(el, 'current'));
        if (!(total >= 1) || !(cur >= 1) || cur > total) return toast('Confira a parcela atual e o total');
      }
      const next: FixedBill = {
        id: bill?.id ?? uid(), name, amount, dueDay, person: val(el, 'person') as Person,
        totalInstallments: total, refInstallment: cur, refMonth: month, active: true,
      };
      commit((s) => { s.fixedBills = bill ? s.fixedBills.map((b) => (b.id === bill.id ? next : b)) : [...s.fixedBills, next]; });
      close();
      toast('Conta salva');
    });
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (!(await confirmSheet(`Apagar ${bill!.name}?`, 'Some de todos os meses.', 'Apagar'))) return;
      commit((s) => { s.fixedBills = s.fixedBills.filter((b) => b.id !== bill!.id); });
    });
  });
}

function dayFieldN(name: string, label: string, value: number | '') {
  return `<label class="field"><span>${label}</span><input class="input" name="${name}" type="number" inputmode="numeric" min="1" value="${value}" /></label>`;
}

async function saveBackup() {
  const today = todayIso();
  const file = new File([exportBackup()], `financas-backup-${today}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup Finanças' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    commit((s) => { s.lastBackup = today; });
    toast('Backup salvo');
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast('Não foi possível salvar o backup');
  }
}

async function restoreBackup(file: File) {
  try {
    const next = parseBackup(await file.text());
    const ok = await confirmSheet('Restaurar backup?',
      `Os dados atuais serão substituídos pelos do arquivo (${next.purchases.length} gastos).`, 'Restaurar');
    if (!ok) return;
    replaceState(next);
    toast('Backup restaurado');
  } catch (e) {
    toast((e as Error).message || 'Arquivo inválido');
  }
}
