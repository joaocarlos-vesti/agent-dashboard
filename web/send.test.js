import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SEND_SCRIPT = new URL('../hook/send.sh', import.meta.url).pathname;

function sendThroughHook(hookInput) {
  const home = mkdtempSync(join(tmpdir(), 'painel-hook-'));
  mkdirSync(join(home, '.agent-dashboard'));
  writeFileSync(join(home, '.agent-dashboard', 'config'), 'INGEST_KEY=00000000-0000-0000-0000-000000000000\n');
  const dryFile = join(home, 'dry.jsonl');
  execFileSync('bash', [SEND_SCRIPT], { input: JSON.stringify(hookInput), env: { ...process.env, HOME: home, DASHBOARD_DRY_FILE: dryFile } });
  return JSON.parse(readFileSync(dryFile, 'utf8')).p_event;
}

const assistantLine = (messageId, usage) => JSON.stringify({ type: 'assistant', message: { id: messageId, usage } });
const usage = (input, output, cacheCreation, cacheRead) => ({
  input_tokens: input, output_tokens: output, cache_creation_input_tokens: cacheCreation, cache_read_input_tokens: cacheRead,
});

function writeTranscript(lines) {
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
const tokensIn = ({ input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens }) => ({
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
