// @vitest-environment happy-dom
// Teste de ponta a ponta: registra gastos pela tela e confere Resumo, Registros e Config.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const text = () => document.body.textContent!.replace(/\s+/g, ' ');
const tick = () => new Promise((r) => setTimeout(r, 20));

function chip(group: string, label: string) {
  const el = $$(`[data-chip="${group}"]`).find((b) => b.textContent!.trim() === label);
  if (!el) throw new Error(`chip ${group}/${label} não encontrado`);
  el.click();
}
function tab(label: string) {
  $$('[data-tab]').find((b) => b.textContent!.includes(label))!.click();
}
function typeAmount(digits: string) {
  const input = $<HTMLInputElement>('[data-amount]');
  input.value = digits;
  input.dispatchEvent(new Event('input'));
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 27, 14, 30));
  document.body.innerHTML = '<div id="app"></div>';
  await import('./main');
  await tick();
});

describe('fluxo completo', () => {
  it('registra um gasto parcelado só com valor + toques', () => {
    expect(text()).toContain('Novo gasto');
    typeAmount('8750');
    expect($<HTMLInputElement>('[data-amount]').value).toBe('87,50');
    chip('card', 'Nubank');
    chip('category', 'Mercado');
    chip('n', '3x');
    expect($('[data-hint]').textContent).toContain('3x de');
    expect($('[data-hint]').textContent).toContain('novembro 2026');
    $('[data-save]').click();
    expect($('.toast').textContent).toContain('87,50');
    expect($<HTMLInputElement>('[data-amount]').value).toBe('');
  });

  it('registra um gasto da mãe', () => {
    typeAmount('10000');
    chip('card', 'Bradesco');
    chip('person', 'Mãe');
    chip('category', 'Saúde');
    $('[data-save]').click();
    expect($('.toast').textContent).toContain('Mãe');
  });

  it('não salva sem categoria', () => {
    typeAmount('500');
    $('[data-save]').click();
    expect($('.toast').textContent).toBe('Escolha a categoria');
  });

  it('Resumo mostra a fatura de novembro, com filtros', () => {
    tab('Resumo');
    expect(text()).toContain('Outubro 2026');
    $('[data-month="1"]').click();
    expect(text()).toContain('Novembro 2026');
    // 87,50 em 3x → primeira parcela 29,18; + 100,00 da mãe
    expect($('.hero').textContent).toContain('129,18');
    chip('fperson', 'Mãe');
    expect($('.hero').textContent).toContain('100,00');
    chip('fperson', 'Todos (eu + mãe)');
    chip('fcard', 'Nubank');
    expect($('.hero').textContent).toContain('29,18');
    expect(text()).toContain('Marcar fatura como paga');
    expect(text()).toContain('Próximos meses');
  });

  it('marca e desfaz fatura paga', () => {
    $('[data-pay]').click();
    expect(text()).toContain('Paga em 27/10');
    $('[data-pay]').click();
    expect(text()).toContain('Marcar fatura como paga');
  });

  it('Registros usa o mesmo mês e filtros e permite apagar', async () => {
    chip('fcard', 'Todos');
    tab('Registros');
    expect(text()).toContain('Novembro 2026');
    expect(text()).toContain('parcela 1/3');
    expect(text()).toContain('Saúde');
    $$('[data-open]').find((b) => b.textContent!.includes('Saúde'))!.click();
    $('[data-del]').click();
    $('[data-ok]').click();
    await tick();
    expect(text()).not.toContain('Saúde · Bradesco');
    expect($$('[data-open]').length).toBe(1);
  });

  it('Config cria cobrança fixa no cartão e conta fixa', async () => {
    tab('Config');
    expect(text()).toContain('Nubank Empresa');
    $('[data-rec-new]').click();
    const sheet = $('.sheet');
    const set = (name: string, v: string) => { sheet.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = v; };
    set('name', 'Internet'); set('amount', '99,90'); set('day', '27');
    sheet.querySelector<HTMLElement>('[data-save]')!.click();
    expect(text()).toContain('Internet');

    $('[data-fixed-new]').click();
    const s2 = $('.sheet');
    const set2 = (name: string, v: string) => { s2.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = v; };
    set2('name', 'Empréstimo'); set2('amount', '350'); set2('due', '15'); set2('current', '4'); set2('total', '12');
    s2.querySelector<HTMLElement>('[data-save]')!.click();
    expect(text()).toContain('parcela 4/12');

    tab('Resumo');
    $('[data-month="-1"]').click();
    expect(text()).toContain('Outubro 2026');
    expect(text()).toContain('Contas fixas (fora do cartão)');
    expect(text()).toContain('Empréstimo');
  });
});
