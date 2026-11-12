import { describe, expect, test } from 'vitest';
import { connectReducer, connectView, initialConnectState, type ConnectAction, type ConnectState } from './connect-flow';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const KEY = '11111111-2222-3333-4444-555555555555';
const context = { now: NOW, origin: 'https://painel.example', networkHost: 'abc.supabase.co' };
const run = (actions: ConnectAction[], from: ConnectState = initialConnectState): ConnectState => actions.reduce(connectReducer, from);
const connected = run([{ type: 'statusLoaded', status: { hasKey: true, lastEventAt: '2026-11-12T11:57:00Z' } }]);
const neverConnected = run([{ type: 'statusLoaded', status: { hasKey: false, lastEventAt: null } }]);

describe('estado da tela Conectar (T58)', () => {
  test('ao abrir, só consulta: nada é gerado e nenhuma ação é oferecida', () => {
    const view = connectView(initialConnectState, context);
    expect(initialConnectState.step.kind).toBe('idle');
    expect(view.headline).toBe('Consultando a conexão…');
    expect(view.action).toBeNull();
    expect(view.install).toBeNull();
  });

  test('falha na consulta mostra a mensagem e permite tentar de novo', () => {
    const view = connectView(run([{ type: 'statusFailed', message: 'sem rede' }]), context);
    expect(view.error).toBe('Não foi possível consultar a conexão: sem rede.');
    expect(view.canRetryStatus).toBe(true);
  });

  test('tentar de novo volta a consultar, só se a consulta tinha falhado', () => {
    const failed = run([{ type: 'statusFailed', message: 'sem rede' }]);
    expect(run([{ type: 'retryStatus' }], failed).status.kind).toBe('loading');
    expect(run([{ type: 'retryStatus' }], connected)).toBe(connected);
  });

  test('conectado mostra o último evento e oferece gerar nova conexão', () => {
    const view = connectView(connected, context);
    expect(view.headline).toBe('Conectado · último evento há 3 min');
    expect(view.action).toEqual({ label: 'Gerar nova conexão', disabled: false });
    expect(view.install).toBeNull();
  });

  test('sem chave nenhuma, diz que ainda não conectou', () => {
    const view = connectView(neverConnected, context);
    expect(view.headline).toBe('Ainda não conectado');
    expect(view.action?.label).toBe('Gerar conexão');
  });

  test('chave gerada mas nenhum evento: ainda não conectado, com a explicação', () => {
    const view = connectView(run([{ type: 'statusLoaded', status: { hasKey: true, lastEventAt: null } }]), context);
    expect(view.headline).toBe('Ainda não conectado');
    expect(view.hint).toBe('Já existe uma conexão gerada, mas nenhum evento chegou ainda. Rode o comando no computador e abra uma sessão nova do Claude Code.');
  });

  test('com conexão existente, pedir uma nova só pede a confirmação (não gera)', () => {
    const state = run([{ type: 'requestNew' }], connected);
    expect(state.step.kind).toBe('confirming');
    expect(connectView(state, context).confirmation?.text).toBe('Isso desliga o Claude Code já conectado, no terminal e na nuvem. Depois você roda o comando de novo em cada lugar.');
  });

  test('sem conexão existente, não há o que desligar: gera direto', () => {
    expect(run([{ type: 'requestNew' }], neverConnected).step.kind).toBe('generating');
  });

  test('só a confirmação inicia a geração; cancelar volta ao começo', () => {
    expect(run([{ type: 'confirm' }], connected).step.kind).toBe('idle');
    expect(run([{ type: 'requestNew' }, { type: 'confirm' }], connected).step.kind).toBe('generating');
    expect(run([{ type: 'requestNew' }, { type: 'cancel' }], connected).step.kind).toBe('idle');
  });

  test('durante a geração o botão fica desligado e um segundo pedido não gera de novo', () => {
    const generating = run([{ type: 'requestNew' }, { type: 'confirm' }], connected);
    expect(connectView(generating, context).action).toEqual({ label: 'Gerando…', disabled: true });
    expect(run([{ type: 'requestNew' }, { type: 'confirm' }], generating)).toBe(generating);
  });

  test('chave gerada mostra o comando e a variável da nuvem; copiar vira "Copiado!"', () => {
    const generated = run([{ type: 'requestNew' }, { type: 'confirm' }, { type: 'generated', key: KEY }], connected);
    const view = connectView(generated, context);
    expect(view.install).toEqual({
      command: `curl -fsSL https://painel.example/install.sh | bash -s -- ${KEY}`,
      cloudVariable: `INGEST_KEY=${KEY}`,
      networkHost: 'abc.supabase.co',
      copyLabel: 'Copiar comando',
    });
    expect(connectView(run([{ type: 'copied' }], generated), context).install?.copyLabel).toBe('Copiado!');
  });

  test('falha ao gerar mostra o erro e deixa tentar de novo, sem chave', () => {
    const failed = run([{ type: 'requestNew' }, { type: 'confirm' }, { type: 'generateFailed' }], connected);
    const view = connectView(failed, context);
    expect(view.error).toBe('Não foi possível gerar a conexão. Confira a internet e tente de novo.');
    expect(view.action).toEqual({ label: 'Gerar nova conexão', disabled: false });
    expect(view.install).toBeNull();
  });

  test('"gerado" fora da geração é ignorado (resposta atrasada não troca a tela)', () => {
    expect(run([{ type: 'generated', key: KEY }], connected)).toBe(connected);
  });
});
