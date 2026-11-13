import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBackfillSql, collectDailyUsage, dayInZone } from './backfill-uso-diario.mjs';

const NOW = Date.parse('2026-11-14T15:00:00Z');
const SECRET = 'SEGREDO-DE-NEGOCIO';

const usage = (input, output, cacheCreation = 0, cacheRead = 0) => ({
  input_tokens: input, output_tokens: output, cache_creation_input_tokens: cacheCreation, cache_read_input_tokens: cacheRead,
});
const assistant = (id, model, tokens, timestamp, content = [{ type: 'text', text: SECRET }]) => ({
  type: 'assistant', timestamp, cwd: `/home/${SECRET}`, message: { id, model, usage: tokens, content },
});
const humanRequest = (timestamp) => ({ type: 'user', timestamp, origin: { kind: 'human' }, message: { role: 'user', content: SECRET } });
const toolResult = (timestamp) => ({ type: 'user', timestamp, origin: { kind: 'human' }, message: { role: 'user', content: [{ type: 'tool_result', content: SECRET }] } });

function transcriptsRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-uso-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : Array.isArray(content) ? content.map((line) => JSON.stringify(line)).join('\n') : JSON.stringify(content));
  }
  return root;
}
const collect = (files, options = {}) => collectDailyUsage({ root: transcriptsRoot(files), timeZone: 'America/Sao_Paulo', now: NOW, ...options });
const rowOf = (rows, agentLabel, model) => rows.find((row) => row.agentLabel === agentLabel && (!model || row.model === model));

test('a mesma resposta em outro arquivo ou repetida no streaming conta uma vez, com a maior contagem', () => {
  const { rows, stats } = collect({
    'proj/sessao-1.jsonl': [
      assistant('msg_1', 'claude-opus-5-5', usage(2, 10), '2026-11-10T13:00:00Z'),
      assistant('msg_1', 'claude-opus-5-5', usage(2, 100, 1000, 5000), '2026-11-10T13:00:02Z'),
    ],
    'proj/sessao-2.jsonl': [assistant('msg_1', 'claude-opus-5-5', usage(2, 100, 1000, 5000), '2026-11-10T13:00:02Z')],
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ sessionId: 'sessao-1', inputTokens: 2, outputTokens: 100, cacheCreationTokens: 1000, cacheReadTokens: 5000, calls: 1 });
  expect(stats.repeatedResponses).toBe(2);
});

test('resposta sintética e linha sem uso não entram', () => {
  const { rows } = collect({
    'proj/s.jsonl': [
      assistant('msg_a', '<synthetic>', usage(5, 5), '2026-11-10T13:00:00Z'),
      { type: 'assistant', timestamp: '2026-11-10T13:00:01Z', message: { id: 'msg_b', model: 'claude-opus-5-5', content: [] } },
      assistant('msg_c', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:00:02Z'),
    ],
  });
  expect(rows.map((row) => row.calls)).toEqual([1]);
  expect(rows[0].inputTokens).toBe(1);
});

test('o dia é o do fuso: 02:00 UTC ainda é o dia anterior em São Paulo', () => {
  expect(dayInZone(Date.parse('2026-11-10T02:00:00Z'), 'America/Sao_Paulo')).toBe('2026-11-09');
  const { rows } = collect({ 'proj/s.jsonl': [assistant('msg_1', 'claude-opus-5-5', usage(1, 1), '2026-11-10T02:00:00Z')] });
  expect(rows[0].day).toBe('2026-11-09');
  const utc = collect({ 'proj/s.jsonl': [assistant('msg_1', 'claude-opus-5-5', usage(1, 1), '2026-11-10T02:00:00Z')] }, { timeZone: 'UTC' });
  expect(utc.rows[0].day).toBe('2026-11-10');
});

test('só entram dias anteriores ao corte (padrão 12/11, exclusivo), fechados e dentro do intervalo pedido', () => {
  const lines = [
    assistant('msg_1', 'claude-opus-5-5', usage(1, 0), '2026-11-14T13:00:00Z'),
    assistant('msg_2', 'claude-opus-5-5', usage(1, 0), '2026-11-13T13:00:00Z'),
    assistant('msg_3', 'claude-opus-5-5', usage(1, 0), '2026-11-11T13:00:00Z'),
  ];
  expect(collect({ 'proj/s.jsonl': lines }).rows.map((row) => row.day)).toEqual(['2026-11-11']);
  expect(collect({ 'proj/s.jsonl': lines }, { before: '2026-11-14' }).rows.map((row) => row.day)).toEqual(['2026-11-11', '2026-11-13']);
  expect(collect({ 'proj/s.jsonl': lines }, { before: '2026-11-14', from: '2026-11-12' }).rows.map((row) => row.day)).toEqual(['2026-11-13']);
  expect(collect({ 'proj/s.jsonl': lines }, { before: '2026-11-11' }).rows).toEqual([]);
  expect(collect({ 'proj/s.jsonl': lines }, { before: '2026-12-01' }).rows.map((row) => row.day)).not.toContain('2026-11-14');
});

test('o rótulo do agente vem só do tipo; workflow vira tipo e número de ordem; nome estranho vira genérico', () => {
  const agentLine = (id) => [assistant(id, 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:00:00Z')];
  const { rows } = collect({
    'proj/s.jsonl': [assistant('msg_main', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:00:00Z')],
    'proj/s/subagents/agent-a1.jsonl': agentLine('msg_a1'),
    'proj/s/subagents/agent-a1.meta.json': { agentType: 'revisor', description: SECRET },
    'proj/s/subagents/agent-a2.jsonl': agentLine('msg_a2'),
    'proj/s/subagents/agent-a2.meta.json': { agentType: `${SECRET} com espaço e texto longo`, description: SECRET },
    'proj/s/subagents/workflows/wf_1/agent-w1.jsonl': agentLine('msg_w1'),
    'proj/s/subagents/workflows/wf_1/agent-w1.meta.json': { agentType: 'workflow-subagent', description: SECRET },
    'proj/s/subagents/workflows/wf_1/agent-w2.jsonl': [assistant('msg_w2', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:05:00Z')],
    'proj/s/subagents/workflows/wf_1/agent-w2.meta.json': { agentType: 'workflow-subagent' },
    'proj/s/subagents/workflows/wf_1/journal.jsonl': [{ type: 'assistant', message: { id: 'msg_j', model: 'claude-opus-5-5', usage: usage(999, 999) }, timestamp: '2026-11-10T13:00:00Z' }],
  });
  expect(rows.map((row) => row.agentLabel).sort()).toEqual(['agente-personalizado', 'principal', 'revisor', 'workflow-subagent #1', 'workflow-subagent #2']);
});

test('sem meta, o tipo do agente vem da chamada que o criou', () => {
  const { rows } = collect({
    'proj/s.jsonl': [assistant('msg_main', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:00:00Z', [{ type: 'tool_use', id: 'toolu_1', name: 'Agent', input: { subagent_type: 'explorador', prompt: SECRET } }])],
    'proj/s/subagents/agent-a1.jsonl': [assistant('msg_a1', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:00:00Z')],
    'proj/s/subagents/agent-a1.meta.json': { toolUseId: 'toolu_1' },
  });
  expect(rows.map((row) => row.agentLabel).sort()).toEqual(['explorador', 'principal']);
});

test('calls são respostas distintas e a duração do pedido vai até a última resposta antes do próximo pedido', () => {
  const { rows } = collect({
    'proj/s.jsonl': [
      humanRequest('2026-11-10T13:00:00Z'),
      assistant('msg_1', 'claude-opus-5-5', usage(1, 10), '2026-11-10T13:00:10Z'),
      toolResult('2026-11-10T13:00:20Z'),
      assistant('msg_2', 'claude-opus-5-5', usage(1, 30), '2026-11-10T13:00:40Z'),
      assistant('msg_3', 'claude-haiku-5', usage(1, 5), '2026-11-10T13:00:50Z'),
      humanRequest('2026-11-10T13:10:00Z'),
      assistant('msg_4', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:10:05Z'),
    ],
  });
  expect(rows.reduce((sum, row) => sum + row.calls, 0)).toBe(4);
  // Pedido 1: 50 s; pedido 2: 5 s. Toda a duração fica no modelo com mais saída do dia (opus).
  expect(rowOf(rows, 'principal', 'claude-opus-5-5')).toMatchObject({ calls: 3, durationMs: 55000 });
  expect(rowOf(rows, 'principal', 'claude-haiku-5')).toMatchObject({ calls: 1, durationMs: 0 });
});

test('a duração do agente vai do primeiro ao último registro dele; a espera por permissão fica nula e o trabalho inclui tudo', () => {
  const { rows } = collect({
    'proj/s.jsonl': [humanRequest('2026-11-10T13:00:00Z'), assistant('msg_1', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:00:05Z')],
    'proj/s/subagents/agent-a1.jsonl': [
      assistant('msg_a1', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:01:00Z'),
      { type: 'user', timestamp: '2026-11-10T13:01:30Z', message: { content: [{ type: 'tool_result', content: SECRET }] } },
      assistant('msg_a2', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:01:40Z'),
    ],
    'proj/s/subagents/agent-a1.meta.json': { agentType: 'revisor' },
  });
  expect(rowOf(rows, 'revisor')).toMatchObject({ calls: 2, durationMs: 40000, workingMs: 40000, waitingPermissionMs: null });
  // A conversa segue trabalhando enquanto o agente roda: o pedido das 13:00:00 vai até o último registro do agente (13:01:40).
  expect(rowOf(rows, 'principal')).toMatchObject({ durationMs: 100000, workingMs: 100000, waitingPermissionMs: null });
});

test('silêncio longo encerra o trabalho: a resposta horas depois, sem novo pedido, não soma ao tempo', () => {
  const { rows } = collect({
    'proj/s.jsonl': [
      humanRequest('2026-11-10T13:00:00Z'),
      assistant('msg_1', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:00:20Z'),
      assistant('msg_2', 'claude-opus-5-5', usage(1, 1), '2026-11-10T20:00:00Z'),
    ],
  });
  expect(rowOf(rows, 'principal')).toMatchObject({ calls: 2, durationMs: 20000 });
});

test('nenhum texto, caminho ou comando sai: só as chaves numéricas e os rótulos permitidos', () => {
  const { rows } = collect({
    'proj/s.jsonl': [
      humanRequest('2026-11-10T13:00:00Z'),
      assistant('msg_1', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:00:05Z', [
        { type: 'text', text: SECRET },
        { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: `rm -rf /home/${SECRET}`, description: SECRET } },
      ]),
    ],
    'proj/s/subagents/agent-a1.jsonl': [assistant('msg_a1', 'claude-opus-5-5', usage(1, 1), '2026-11-10T13:01:00Z')],
    'proj/s/subagents/agent-a1.meta.json': { agentType: 'revisor', description: SECRET, toolUseId: 'toolu_x' },
  });
  const sql = buildBackfillSql({ login: 'dev', rows });
  expect(sql).not.toContain(SECRET);
  expect(sql).not.toContain('/home');
  expect(sql).not.toContain('rm -rf');
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual([
      'agentLabel', 'cacheCreationTokens', 'cacheReadTokens', 'calls', 'day', 'durationMs', 'inputTokens', 'model', 'outputTokens', 'sessionId', 'waitingPermissionMs', 'workingMs',
    ]);
  }
});

test('o SQL é um upsert local, sem apagar linhas por eventos, e deixa a espera nula', () => {
  const { rows } = collect({
    'proj/s.jsonl': [
      assistant('msg_1', 'claude-opus-5-5', usage(1, 2, 3, 4), '2026-11-10T13:00:00Z'),
      assistant('msg_2', 'claude-opus-5-5', usage(1, 2, 3, 4), '2026-11-11T13:00:00Z'),
    ],
  });
  const sql = buildBackfillSql({ login: "o'dev", rows });
  expect(sql.startsWith('-- ')).toBe(true);
  expect(sql).not.toContain('delete');
  expect(sql).toContain("('o''dev', '2026-11-10', 's', 'principal', 'claude-opus-5-5', 1, 2, 3, 4, 1, 0, 0, null, 'local')");
  expect(sql).toContain('on conflict (login, day, session_id, agent_label, model) do update set');
  expect(sql.trimEnd().endsWith('commit;')).toBe(true);
});

test('muitas linhas viram vários inserts e nenhuma linha sem dados gera SQL vazio mas válido', () => {
  const lines = Array.from({ length: 450 }, (_, index) => assistant(`msg_${index}`, `modelo-${index}`, usage(1, 1), '2026-11-10T13:00:00Z'));
  const { rows } = collect({ 'proj/s.jsonl': lines });
  expect(buildBackfillSql({ login: 'dev', rows }).match(/^insert into daily_usage/gm)).toHaveLength(2);
  expect(buildBackfillSql({ login: 'dev', rows: [] })).toMatch(/begin;\ncommit;\n$/);
});
