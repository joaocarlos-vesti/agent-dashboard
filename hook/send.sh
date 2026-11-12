#!/usr/bin/env bash
# Envia um evento do Claude Code ao painel. Nunca bloqueia nem derruba a sessão.
# Na máquina do dev a configuração vem do arquivo; na nuvem, das variáveis de ambiente.
source "$HOME/.agent-dashboard/config" 2>/dev/null
[ -z "$INGEST_KEY" ] && exit 0
: "${SUPABASE_URL:=https://iidbfjopzvtipkgfyefv.supabase.co}"
: "${SUPABASE_ANON_KEY:=sb_publishable_z4cmacV0zlYmrtrcGl4Ypw_CQk2cKz6}"
input=$(cat)

# Soma o uso das respostas do assistente; a mesma resposta aparece em várias linhas com o mesmo message.id.
sum_transcript_tokens() {
  grep -F '"usage"' "$1" | jq -sc '
    map(select(.type == "assistant" and .message.usage != null))
    | unique_by(.message.id // .uuid)
    | map(.message.usage)
    | {input_tokens: (map(.input_tokens // 0) | add // 0),
       output_tokens: (map(.output_tokens // 0) | add // 0),
       cache_creation_tokens: (map(.cache_creation_input_tokens // 0) | add // 0),
       cache_read_tokens: (map(.cache_read_input_tokens // 0) | add // 0)}' 2>/dev/null
}

dashboard_event=$(printf '%s' "$input" | jq -c '
  def short: tostring | gsub("\\s+"; " ") | .[0:160];
  # Reprovação só no fim de uma resposta longa não pode se perder no corte: vale o último "VEREDITO: ..." do texto
  # e, se for REPROVADO, o trecho começa nele. Citação solta de REPROVADO não conta.
  def result_excerpt:
    gsub("\\s+"; " ") as $flat
    | ([$flat | match("VEREDITO:\\s*\\**\\s*(REPROVADO|APROVADO)"; "g")] | last) as $verdict
    | if $verdict != null and $verdict.captures[0].string == "REPROVADO" and $verdict.offset >= 160 then $flat[$verdict.offset:] else $flat end;
  def run_id_in(text): (text // "") | (capture("(?<id>wf_[A-Za-z0-9-]+)")? // {}) | .id;
  .hook_event_name as $name
  | {
      session_id, cwd, event: $name, agent_id, agent_type, tool: .tool_name,
      workflow_name: (.tool_response.workflowName? // null),
      workflow_run_id: (
        if $name == "PostToolUse" then .tool_response.runId?
        elif $name == "SubagentStop" then run_id_in(.agent_transcript_path)
        elif $name == "UserPromptSubmit" and ((.prompt // "") | contains("<task-notification>")) then run_id_in(.prompt)
        else null end),
      summary: (
        if $name == "PreToolUse" then (.tool_input | .description // .command // .file_path // .pattern // .url // .query // null)
        elif $name == "UserPromptSubmit" then .prompt
        elif $name == "SubagentStop" then (.last_assistant_message | if . == null then null else tostring | result_excerpt end)
        elif $name == "Stop" then .last_assistant_message
        elif $name == "SessionStart" then .source
        elif $name == "PermissionRequest" then ("permission_prompt: " + (.tool_name // "") + " " + ((.tool_input | .description // .command // .file_path // .pattern // .url // .query // "") | tostring))
        elif $name == "SessionEnd" then .reason
        elif $name == "Notification" then ((.notification_type // "notification") + ": " + (.message // ""))
        else null end) | (if . == null then null else short end)
    }' 2>/dev/null) || exit 0
[ -z "$dashboard_event" ] && exit 0

# Branch só no início da sessão; fora de repositório git ou com HEAD solto, vai nula.
if [ "$(jq -r '.event' <<<"$dashboard_event")" = "SessionStart" ]; then
  session_cwd=$(jq -r '.cwd // empty' <<<"$dashboard_event")
  session_branch=""
  [ -n "$session_cwd" ] && session_branch=$(git -C "$session_cwd" branch --show-current 2>/dev/null)
  dashboard_event=$(jq -c --arg branch "$session_branch" '. + {branch: (if $branch == "" then null else $branch end)}' <<<"$dashboard_event")
fi

transcript=$(printf '%s' "$input" | jq -r '.agent_transcript_path // empty')
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  agent_task=$(head -1 "$transcript" | jq -r '.message.content | if type == "string" then . else (map(.text? // "") | join(" ")) end' 2>/dev/null | tr -s '[:space:]' ' ' | cut -c1-160)
  dashboard_event=$(jq -c --arg task "$agent_task" '. + {task: $task}' <<<"$dashboard_event")
fi

event_name=$(jq -r '.event' <<<"$dashboard_event")
tokens_transcript=""
[ "$event_name" = "SubagentStop" ] && tokens_transcript="$transcript"
[ "$event_name" = "Stop" ] && tokens_transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
if [ -n "$tokens_transcript" ] && [ -f "$tokens_transcript" ]; then
  transcript_tokens=$(sum_transcript_tokens "$tokens_transcript")
  [ -n "$transcript_tokens" ] && dashboard_event=$(jq -c --argjson tokens "$transcript_tokens" '. + $tokens' <<<"$dashboard_event")
fi

payload=$(jq -cn --arg key "$INGEST_KEY" --argjson event "$dashboard_event" '{p_key: $key, p_event: $event}')
if [ -n "$DASHBOARD_DRY_FILE" ]; then echo "$payload" >> "$DASHBOARD_DRY_FILE"; exit 0; fi
curl -s -m 2 -o /dev/null -X POST "$SUPABASE_URL/rest/v1/rpc/ingest" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d "$payload" >/dev/null 2>&1 &
disown
exit 0
