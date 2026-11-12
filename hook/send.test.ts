import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SEND_SCRIPT = new URL('./send.sh', import.meta.url).pathname;

type HookInput = Record<string, unknown>;
interface TokenUsage { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }
interface TokenColumns { input_tokens: number; output_tokens: number; cache_creation_tokens: number; cache_read_tokens: number }

function sendThroughHook(hookInput: HookInput) {
  const home = mkdtempSync(join(tmpdir(), 'painel-hook-'));
  mkdirSync(join(home, '.agent-dashboard'));
  writeFileSync(join(home, '.agent-dashboard', 'config'), 'INGEST_KEY=00000000-0000-0000-0000-000000000000\n');
  const dryFile = join(home, 'dry.jsonl');
  execFileSync('bash', [SEND_SCRIPT], { input: JSON.stringify(hookInput), env: { ...process.env, HOME: home, DASHBOARD_DRY_FILE: dryFile } });
  const sent: { p_event: Record<string, unknown> & Partial<TokenColumns> } = JSON.parse(readFileSync(dryFile, 'utf8'));
  return sent.p_event;
}

const assistantLine = (messageId: string, usage: TokenUsage) => JSON.stringify({ type: 'assistant', message: { id: messageId, usage } });
const usage = (input: number, output: number, cacheCreation: number, cacheRead: number): TokenUsage => ({
  input_tokens: input, output_tokens: output, cache_creation_input_tokens: cacheCreation, cache_read_input_tokens: cacheRead,
});

function writeTranscript(lines: string[]) {
  const path = join(mkdtempSync(join(tmpdir(), 'painel-transcript-')), 'transcript.jsonl');
  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
}

const transcriptWithRepeatedMessage = () => writeTranscript([
  JSON.stringify({ type: 'user', message: { role: 'user', content: 'faça "usage" funcionar' } }),
  assistantLine('msg_1', usage(2, 100, 1000, 5000)),
  assistantLine('msg_1', usage(2, 100, 1000, 5000)),
  assistantLine('msg_1', usage(2, 100, 1000, 5000)),
  assistantLine('msg_2', usage(3, 50, 200, 6000)),
]);
const tokensIn = ({ input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens }: Partial<TokenColumns>) => ({
  input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
});
const EXPECTED_TOKENS = { input_tokens: 5, output_tokens: 150, cache_creation_tokens: 1200, cache_read_tokens: 11000 };

test('SubagentStop soma o uso do agente contando cada resposta uma vez', () => {
  const event = sendThroughHook({
    hook_event_name: 'SubagentStop', session_id: 's1', agent_id: 'a1', agent_type: 'general-purpose',
    agent_transcript_path: transcriptWithRepeatedMessage(), last_assistant_message: 'APROVADO',
  });
  assert.deepEqual(tokensIn(event), EXPECTED_TOKENS);
});

test('Stop soma o uso da conversa principal contando cada resposta uma vez', () => {
  const event = sendThroughHook({ hook_event_name: 'Stop', session_id: 's1', transcript_path: transcriptWithRepeatedMessage() });
  assert.deepEqual(tokensIn(event), EXPECTED_TOKENS);
});

test('Notification envia o tipo e a mensagem no resumo', () => {
  const event = sendThroughHook({
    hook_event_name: 'Notification', session_id: 's1', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash',
  });
  assert.equal(event.summary, 'permission_prompt: Claude needs your permission to use Bash');
});

test('PostToolUse de ferramenta comum é enviado sem resumo', () => {
  const event = sendThroughHook({ hook_event_name: 'PostToolUse', session_id: 's1', agent_id: 'a1', tool_name: 'Read' });
  assert.deepEqual([event.event, event.tool, event.agent_id, event.summary], ['PostToolUse', 'Read', 'a1', null]);
});

test('evento sem transcript não leva tokens', () => {
  const event = sendThroughHook({ hook_event_name: 'Stop', session_id: 's1', transcript_path: '/nao/existe.jsonl' });
  assert.equal('input_tokens' in event, false);
});

function makeGitRepo(branch: string, { detached = false } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'painel-repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });
  git('init', '-b', branch);
  if (detached) {
    git('commit', '--allow-empty', '-m', 'x');
    git('checkout', '--detach');
  }
  return repo;
}
const sessionStart = (cwd: string, source = 'startup') => sendThroughHook({ hook_event_name: 'SessionStart', session_id: 's1', cwd, source });

test('SessionStart envia a branch', () => {
  assert.equal(sessionStart(makeGitRepo('feat/x')).branch, 'feat/x');
});

test('SessionStart fora de repositório git envia branch nula, sem erro', () => {
  assert.equal(sessionStart(mkdtempSync(join(tmpdir(), 'painel-semgit-'))).branch, null);
});

test('SessionStart com HEAD solto envia branch nula', () => {
  assert.equal(sessionStart(makeGitRepo('main', { detached: true })).branch, null);
});

test('SessionStart de pasta que não existe envia branch nula', () => {
  assert.equal(sessionStart('/nao/existe/mesmo').branch, null);
});

test('só o SessionStart leva a branch', () => {
  const event = sendThroughHook({ hook_event_name: 'Stop', session_id: 's1', cwd: makeGitRepo('feat/x') });
  assert.equal('branch' in event, false);
});

test('SessionStart grava a origem no resumo', () => {
  const repo = makeGitRepo('feat/x');
  assert.deepEqual(['startup', 'resume', 'clear', 'compact'].map((source) => sessionStart(repo, source).summary), ['startup', 'resume', 'clear', 'compact']);
});

test('SessionStart sem origem fica sem resumo', () => {
  const event = sendThroughHook({ hook_event_name: 'SessionStart', session_id: 's1', cwd: makeGitRepo('feat/x') });
  assert.equal(event.summary, null);
});

const subagentResult = (lastMessage: string) => sendThroughHook({
  hook_event_name: 'SubagentStop', session_id: 's1', agent_id: 'a1', agent_type: 'logic-reviewer', last_assistant_message: lastMessage,
}).summary as string;
const longReview = (verdict: string) => `${'Revisei os arquivos da fase e conferi cada regra da matriz com os casos de borda. '.repeat(4)}\n${verdict}: o motivo está no fim`;

test('REPROVADO depois do corte de 160 caracteres não se perde', () => {
  const summary = subagentResult(longReview('VEREDITO: REPROVADO'));
  assert.match(summary, /REPROVADO/);
  assert.ok(summary.length <= 160);
});

test('APROVADO longo continua cortado no começo', () => {
  const message = longReview('VEREDITO: APROVADO');
  assert.equal(subagentResult(message), message.replace(/\s+/g, ' ').slice(0, 160));
});

test('"nenhum REPROVADO" depois do corte não vira reprovação', () => {
  const summary = subagentResult(longReview('VEREDITO: APROVADO, nenhum REPROVADO'));
  assert.doesNotMatch(summary, /REPROVADO/);
});

test('resultado curto com REPROVADO vai como veio', () => {
  assert.equal(subagentResult('VEREDITO: REPROVADO por falta de teste'), 'VEREDITO: REPROVADO por falta de teste');
});

test('REPROVADO dentro dos 160 primeiros caracteres mantém o começo do texto', () => {
  const message = `Achei um problema grave. VEREDITO: REPROVADO. ${'Detalhes sobre o problema encontrado na revisão. '.repeat(6)}`;
  assert.equal(subagentResult(message), message.replace(/\s+/g, ' ').slice(0, 160));
});
