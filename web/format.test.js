import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTokens, pageTitle } from './format.js';

test('números abaixo de mil aparecem inteiros', () => {
  assert.deepEqual([formatTokens(0), formatTokens(999)], ['0', '999']);
});

test('milhares usam "mil" com no máximo 3 algarismos significativos', () => {
  assert.deepEqual([formatTokens(1000), formatTokens(1234), formatTokens(12400), formatTokens(124000)], ['1 mil', '1,23 mil', '12,4 mil', '124 mil']);
});

test('milhões e bilhões usam "mi" e "bi"', () => {
  assert.deepEqual([formatTokens(1200000), formatTokens(1500000000)], ['1,2 mi', '1,5 bi']);
});

test('arredondamento que chega a mil passa para a unidade seguinte', () => {
  assert.equal(formatTokens(999999), '1 mi');
});

test('contagem desconhecida aparece como traço', () => {
  assert.deepEqual([formatTokens(null), formatTokens(undefined)], ['—', '—']);
});

test('título da aba mostra quantas sessões aguardam o usuário', () => {
  assert.deepEqual([pageTitle(0), pageTitle(3)], ['Painel de agentes', '(3) Painel de agentes']);
});
