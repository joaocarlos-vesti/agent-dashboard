// Reconstrói o resumo diário de uso (tabela daily_usage) a partir dos registros locais do Claude Code (~/.claude/projects).
// Só números saem daqui: nenhum texto de conversa, caminho ou comando. Os únicos rótulos são sessão, tipo do agente e modelo.
// Uso: node scripts/backfill-uso-diario.mjs [--login <github>] [--tz America/Sao_Paulo] [--from AAAA-MM-DD] [--before AAAA-MM-DD (exclusivo, padrão 2026-11-12)] [--root <pasta>] [--out <arquivo.sql>] [--dry-run]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOGIN = 'joaocarlos-vesti';
const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
// Primeiro dia com eventos no banco: o histórico local só cobre os dias anteriores, para não repetir o que o resumo por eventos já conta.
const DEFAULT_BEFORE_DAY = '2026-11-12';
const UNKNOWN_MODEL = 'desconhecido';
const MAX_ROWS_PER_INSERT = 400;
// Silêncio maior que isto encerra o trabalho: o dev saiu e voltou depois, e esse intervalo não é tempo trabalhando.
const IDLE_LIMIT_MS = 30 * 60 * 1000;
const SAFE_LABEL = /^[A-Za-z0-9:_.-]{1,40}$/;
const SAFE_MODEL = /^[A-Za-z0-9:_.\-/[\]]{1,80}$/;

const dayFormatters = new Map();
export function dayInZone(milliseconds, timeZone) {
  if (!dayFormatters.has(timeZone)) {
    dayFormatters.set(timeZone, new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  }
  return dayFormatters.get(timeZone).format(new Date(milliseconds));
}

const listFiles = (directory, found = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) listFiles(fullPath, found);
    else found.push(fullPath);
  }
  return found;
};

const readJsonLines = (file) => {
  const parsed = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // linha truncada: ignora
    }
  }
  return parsed;
};

// Conversa principal: <projeto>/<sessão>.jsonl. Agente: <projeto>/<sessão>/subagents/[workflows/<execução>/]agent-<id>.jsonl.
function describeTranscript(root, file) {
  const parts = path.relative(root, file).split(path.sep);
  if (parts.length < 2 || path.basename(file) === 'journal.jsonl') return null;
  const isAgent = parts.includes('subagents');
  return {
    file,
    isAgent,
    sessionId: isAgent ? parts[1] : parts[1].replace(/\.jsonl$/, ''),
    agentId: isAgent ? path.basename(file, '.jsonl').replace(/^agent-/, '') : null,
    inWorkflow: isAgent && parts.includes('workflows'),
  };
}

// De um .meta.json só o tipo do agente e o id da chamada que o criou; a descrição (texto da tarefa) nunca é lida.
function readAgentMeta(transcriptFile) {
  try {
    const meta = JSON.parse(fs.readFileSync(transcriptFile.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return {
      agentType: typeof meta.agentType === 'string' ? meta.agentType : null,
      toolUseId: typeof meta.toolUseId === 'string' ? meta.toolUseId : null,
    };
  } catch {
    return { agentType: null, toolUseId: null };
  }
}

const isHumanRequest = (line) => {
  if (line.type !== 'user' || line.origin?.kind !== 'human' || line.isMeta) return false;
  const content = line.message?.content;
  return !(Array.isArray(content) && content[0]?.type === 'tool_result');
};

// Instante do último registro que ainda faz parte do mesmo trabalho que começou em startAt (registros em ordem crescente).
const lastActiveAt = (sortedTimes, startAt) => {
  let last = startAt;
  for (const at of sortedTimes) {
    if (at - last > IDLE_LIMIT_MS) break;
    last = at;
  }
  return last;
};

const newTotals = () => ({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 });
const keyOf = (...parts) => parts.join('\u0000');
const getOrCreate = (map, key, create) => {
  if (!map.has(key)) map.set(key, create());
  return map.get(key);
};

/**
 * Lê os registros locais e devolve as linhas de daily_usage (só números) dos dias fechados, no fuso informado.
 * @example collectDailyUsage({ root, timeZone: 'America/Sao_Paulo', now: Date.now() }).rows[0].agentLabel // "principal"
 */
export function collectDailyUsage({ root, timeZone = DEFAULT_TIME_ZONE, from = null, before = DEFAULT_BEFORE_DAY, now = Date.now() }) {
  const today = dayInZone(now, timeZone);
  const inRange = (day) => day < today && (!before || day < before) && (!from || day >= from);

  const transcripts = listFiles(root)
    .filter((file) => file.endsWith('.jsonl'))
    .map((file) => describeTranscript(root, file))
    .filter(Boolean)
    .sort((a, b) => Number(a.isAgent) - Number(b.isAgent));

  const responses = new Map();
  const agents = new Map();
  const requestsBySession = new Map();
  const activityBySession = new Map();
  const agentTypeByToolUse = new Map();
  let repeatedResponses = 0;

  for (const transcript of transcripts) {
    const agentKey = transcript.isAgent ? keyOf(transcript.sessionId, transcript.agentId) : null;
    for (const line of readJsonLines(transcript.file)) {
      if (line.type !== 'assistant' && line.type !== 'user') continue;
      const at = Date.parse(line.timestamp);
      if (!Number.isFinite(at)) continue;

      getOrCreate(activityBySession, transcript.sessionId, () => []).push(at);
      if (transcript.isAgent) {
        const agent = getOrCreate(agents, agentKey, () => ({ transcript, firstAt: at, lastAt: at, activity: [] }));
        agent.firstAt = Math.min(agent.firstAt, at);
        agent.lastAt = Math.max(agent.lastAt, at);
        agent.activity.push(at);
      } else if (isHumanRequest(line)) {
        getOrCreate(requestsBySession, transcript.sessionId, () => []).push(at);
      }

      if (line.type !== 'assistant') continue;
      const message = line.message;
      const content = Array.isArray(message?.content) ? message.content : [];
      for (const block of content) {
        const subagentType = block?.input?.subagent_type;
        if (block?.type === 'tool_use' && (block.name === 'Agent' || block.name === 'Task') && typeof block.id === 'string' && typeof subagentType === 'string') {
          agentTypeByToolUse.set(block.id, subagentType);
        }
      }
      if (!message?.id || !message.usage || !message.model || message.model === '<synthetic>') continue;

      const usage = {
        inputTokens: message.usage.input_tokens || 0,
        outputTokens: message.usage.output_tokens || 0,
        cacheCreationTokens: message.usage.cache_creation_input_tokens || 0,
        cacheReadTokens: message.usage.cache_read_input_tokens || 0,
      };
      const known = responses.get(message.id);
      if (!known) {
        responses.set(message.id, { sessionId: transcript.sessionId, agentKey, model: message.model, usage, firstAt: at, lastAt: at });
        continue;
      }
      // A mesma resposta aparece em várias linhas (streaming) e em arquivos de sessões retomadas: vale uma vez, com a maior contagem de cada campo.
      repeatedResponses++;
      for (const field of Object.keys(usage)) known.usage[field] = Math.max(known.usage[field], usage[field]);
      known.firstAt = Math.min(known.firstAt, at);
      known.lastAt = Math.max(known.lastAt, at);
    }
  }

  // Rótulo do agente: tipo (só se for um nome simples) ou "workflow-subagent #n" na ordem de início dentro da sessão.
  const labelByAgent = new Map();
  const workflowOrderBySession = new Map();
  const agentsByStart = [...agents.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt || (a[0] < b[0] ? -1 : 1));
  for (const [agentKey, agent] of agentsByStart) {
    const meta = readAgentMeta(agent.transcript.file);
    const agentType = meta.agentType ?? agentTypeByToolUse.get(meta.toolUseId) ?? null;
    if (agent.transcript.inWorkflow || agentType === 'workflow-subagent') {
      const order = (workflowOrderBySession.get(agent.transcript.sessionId) ?? 0) + 1;
      workflowOrderBySession.set(agent.transcript.sessionId, order);
      labelByAgent.set(agentKey, `workflow-subagent #${order}`);
    } else if (agentType === null) {
      labelByAgent.set(agentKey, UNKNOWN_MODEL);
    } else {
      labelByAgent.set(agentKey, SAFE_LABEL.test(agentType) ? agentType : 'agente-personalizado');
    }
  }
  const labelOf = (response) => (response.agentKey ? labelByAgent.get(response.agentKey) ?? UNKNOWN_MODEL : 'principal');

  const tokenRows = new Map();
  for (const response of responses.values()) {
    const day = dayInZone(response.firstAt, timeZone);
    if (!inRange(day)) continue;
    const label = labelOf(response);
    const model = SAFE_MODEL.test(response.model) ? response.model : UNKNOWN_MODEL;
    const row = getOrCreate(tokenRows, keyOf(day, response.sessionId, label, model), () => ({
      day, sessionId: response.sessionId, agentLabel: label, model, ...newTotals(), calls: 0, durationMs: 0,
    }));
    for (const field of Object.keys(response.usage)) row[field] += response.usage[field];
    row.calls++;
  }

  // Tempo trabalhando: na conversa, do pedido do dev até o último registro da sessão antes do próximo pedido; no agente, do primeiro ao último registro dele.
  // Nos dois casos o trabalho acaba num silêncio maior que IDLE_LIMIT_MS.
  const durations = new Map();
  const addDuration = (lastAt, sessionId, label, milliseconds) => {
    const day = dayInZone(lastAt, timeZone);
    if (!inRange(day)) return;
    const entry = getOrCreate(durations, keyOf(day, sessionId, label), () => ({ day, sessionId, agentLabel: label, durationMs: 0 }));
    entry.durationMs += milliseconds;
  };
  for (const [sessionId, requestTimes] of requestsBySession) {
    requestTimes.sort((a, b) => a - b);
    const activity = (activityBySession.get(sessionId) ?? []).sort((a, b) => a - b);
    requestTimes.forEach((requestAt, index) => {
      const nextRequestAt = requestTimes[index + 1] ?? Infinity;
      const lastAt = lastActiveAt(activity.filter((at) => at > requestAt && at < nextRequestAt), requestAt);
      if (lastAt > requestAt) addDuration(lastAt, sessionId, 'principal', lastAt - requestAt);
    });
  }
  for (const [agentKey, agent] of agents) {
    const lastAt = lastActiveAt(agent.activity.sort((a, b) => a - b), agent.firstAt);
    addDuration(lastAt, agent.transcript.sessionId, labelByAgent.get(agentKey) ?? UNKNOWN_MODEL, lastAt - agent.firstAt);
  }

  // A duração fica na linha do modelo com mais tokens de saída do dia/sessão/agente (sem tokens, em 'desconhecido').
  for (const duration of durations.values()) {
    const candidates = [...tokenRows.values()].filter((row) => row.day === duration.day && row.sessionId === duration.sessionId && row.agentLabel === duration.agentLabel);
    const host = candidates.sort((a, b) => b.outputTokens - a.outputTokens || (a.model < b.model ? -1 : 1))[0]
      ?? getOrCreate(tokenRows, keyOf(duration.day, duration.sessionId, duration.agentLabel, UNKNOWN_MODEL), () => ({
        day: duration.day, sessionId: duration.sessionId, agentLabel: duration.agentLabel, model: UNKNOWN_MODEL, ...newTotals(), calls: 0, durationMs: 0,
      }));
    host.durationMs += duration.durationMs;
  }

  // Os registros locais não dizem quando o Claude esperou uma permissão: espera nula e todo o tempo em working_ms.
  const rows = [...tokenRows.values()]
    .map((row) => ({ ...row, workingMs: row.durationMs, waitingPermissionMs: null }))
    .sort((a, b) => (a.day + a.sessionId + a.agentLabel + a.model < b.day + b.sessionId + b.agentLabel + b.model ? -1 : 1));
  return { rows, stats: { transcripts: transcripts.length, responses: responses.size, repeatedResponses } };
}

const sqlText = (text) => `'${String(text).replaceAll("'", "''")}'`;

/**
 * Gera o SQL de upsert (source = 'local') das linhas.
 * @example buildBackfillSql({ login: 'dev', rows }).includes("on conflict") // true
 */
export function buildBackfillSql({ login, rows }) {
  const lines = [
    '-- Histórico de uso reconstruído dos registros locais do Claude Code (source = \'local\'). Só números e rótulos (sessão, tipo do agente, modelo).',
    '-- waiting_permission_ms fica nulo: os registros locais não mostram quando houve espera por permissão (working_ms inclui essa espera).',
    '-- Rodar depois da migration 007. Pode rodar de novo: o upsert troca as linhas locais. Só traz dias anteriores ao primeiro dia com eventos no banco.',
    'begin;',
  ];
  if (rows.length === 0) {
    lines.push('commit;');
    return `${lines.join('\n')}\n`;
  }
  for (let start = 0; start < rows.length; start += MAX_ROWS_PER_INSERT) {
    const values = rows.slice(start, start + MAX_ROWS_PER_INSERT).map((row) => (
      `  (${[sqlText(login), sqlText(row.day), sqlText(row.sessionId), sqlText(row.agentLabel), sqlText(row.model),
        row.inputTokens, row.outputTokens, row.cacheCreationTokens, row.cacheReadTokens, row.calls, row.durationMs, row.workingMs,
        row.waitingPermissionMs === null ? 'null' : row.waitingPermissionMs, "'local'"].join(', ')})`
    ));
    lines.push(
      'insert into daily_usage (login, day, session_id, agent_label, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, calls, duration_ms, working_ms, waiting_permission_ms, source) values',
      `${values.join(',\n')}`,
      'on conflict (login, day, session_id, agent_label, model) do update set',
      '  input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, cache_creation_tokens = excluded.cache_creation_tokens,',
      '  cache_read_tokens = excluded.cache_read_tokens, calls = excluded.calls, duration_ms = excluded.duration_ms, working_ms = excluded.working_ms,',
      "  waiting_permission_ms = excluded.waiting_permission_ms, source = 'local', updated_at = now();",
    );
  }
  lines.push('commit;');
  return `${lines.join('\n')}\n`;
}

const totalOf = (row) => row.inputTokens + row.outputTokens + row.cacheCreationTokens + row.cacheReadTokens;

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function runCli(args) {
  const login = readOption(args, '--login', DEFAULT_LOGIN);
  const timeZone = readOption(args, '--tz', DEFAULT_TIME_ZONE);
  const root = readOption(args, '--root', path.join(os.homedir(), '.claude', 'projects'));
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const output = readOption(args, '--out', path.join(scriptDirectory, 'saida', 'backfill-uso-diario.sql'));
  const { rows, stats } = collectDailyUsage({ root, timeZone, from: readOption(args, '--from', null), before: readOption(args, '--before', DEFAULT_BEFORE_DAY) });

  const totalsByDay = new Map();
  for (const row of rows) {
    const day = getOrCreate(totalsByDay, row.day, () => ({ tokens: 0, calls: 0, durationMs: 0, rows: 0 }));
    day.tokens += totalOf(row);
    day.calls += row.calls;
    day.durationMs += row.durationMs;
    day.rows++;
  }
  console.log(`arquivos: ${stats.transcripts} · respostas únicas: ${stats.responses} · repetidas descartadas: ${stats.repeatedResponses} · linhas: ${rows.length} · login: ${login} · fuso: ${timeZone}`);
  for (const [day, totals] of [...totalsByDay].sort()) {
    console.log(`${day}  tokens=${totals.tokens}  respostas=${totals.calls}  tempo=${Math.round(totals.durationMs / 60000)}min  linhas=${totals.rows}`);
  }
  if (args.includes('--dry-run')) return;

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const sql = buildBackfillSql({ login, rows });
  fs.writeFileSync(output, sql);
  console.log(`SQL: ${output} (${Buffer.byteLength(sql)} bytes, ${rows.length} linhas, ${totalsByDay.size} dias)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli(process.argv.slice(2));
