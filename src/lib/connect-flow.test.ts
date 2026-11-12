import { describe, expect, test } from 'vitest';
import { connectReducer, connectView, initialConnectState, type ConnectAction, type ConnectState } from './connect-flow';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const KEY = '11111111-2222-3333-4444-555555555555';
const context = { now: NOW, origin: 'https://painel.example', networkHost: 'abc.supabase.co', timeZone: 'UTC' };
const run = (actions: ConnectAction[], from: ConnectState = initialConnectState): ConnectState => actions.reduce(connectReducer, from);
const connected = run([{ type: 'statusLoaded', status: { hasKey: true, keyCreatedAt: '2026-11-12T10:00:00Z', lastEventAt: '2026-11-12T11:57:00Z' } }]);
const neverConnected = run([{ type: 'statusLoaded', status: { hasKey: false, keyCreatedAt: null, lastEventAt: null } }]);

const KEY_WITHOUT_EVENT_HINT = 'Conexão gerada às 10:00 — ainda não chegou nenhum evento. Rode no seu terminal o comando que apareceu ao gerar, ou gere uma nova conexão.';

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

  test('chave gerada mas nenhum evento: ainda não conectado, com a hora da chave', () => {
    const view = connectView(run([{ type: 'statusLoaded', status: { hasKey: true, keyCreatedAt: '2026-11-12T10:00:00Z', lastEventAt: null } }]), context);
    expect(view.headline).toBe('Ainda não conectado');
    expect(view.hint).toBe(KEY_WITHOUT_EVENT_HINT);
  });

  test('último evento anterior à chave atual (chave 10:00, evento 09:58) não é conexão', () => {
    const view = connectView(run([{ type: 'statusLoaded', status: { hasKey: true, keyCreatedAt: '2026-11-12T10:00:00Z', lastEventAt: '2026-11-12T09:58:00Z' } }]), context);
    expect(view.headline).toBe('Ainda não conectado');
    expect(view.hint).toBe(KEY_WITHOUT_EVENT_HINT);
    expect(view.action?.label).toBe('Gerar nova conexão');
  });

  test('chave de outro dia mostra o dia e a hora', () => {
    const view = connectView(run([{ type: 'statusLoaded', status: { hasKey: true, keyCreatedAt: '2026-11-11T10:00:00Z', lastEventAt: null } }]), context);
    expect(view.hint).toBe('Conexão gerada em 11/11 10:00 — ainda não chegou nenhum evento. Rode no seu terminal o comando que apareceu ao gerar, ou gere uma nova conexão.');
  });

  test('sem chave, evento antigo não vira "Conectado"', () => {
    const view = connectView(run([{ type: 'statusLoaded', status: { hasKey: false, keyCreatedAt: null, lastEventAt: '2026-11-12T11:57:00Z' } }]), context);
    expect(view.headline).toBe('Ainda não conectado');
    expect(view.action?.label).toBe('Gerar conexão');
  });

  test('evento depois da chave atual é conexão', () => {
    const view = connectView(run([{ type: 'statusLoaded', status: { hasKey: true, keyCreatedAt: '2026-11-12T10:00:00Z', lastEventAt: '2026-11-12T10:01:00Z' } }]), context);
    expect(view.headline).toBe('Conectado · último evento há 1 h');
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
