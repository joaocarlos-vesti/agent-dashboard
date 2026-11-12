#!/usr/bin/env bash
# Envia um evento do Claude Code ao painel. Nunca bloqueia nem derruba a sessão.
# Na máquina do dev a configuração vem do arquivo; na nuvem, das variáveis de ambiente.
source "$HOME/.agent-dashboard/config" 2>/dev/null
[ -z "$INGEST_KEY" ] && exit 0
input=$(cat)

dashboard_event=$(printf '%s' "$input" | jq -c '
  def short: tostring | gsub("\\s+"; " ") | .[0:160];
  def run_id_in(text): (text // "") | (capture("(?<id>wf_[A-Za-z0-9-]+)")? // {}) | .id;
  .hook_event_name as $name
  | if $name == "PostToolUse" and .tool_name != "Workflow" then empty else
    {
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
        elif $name == "SubagentStop" or $name == "Stop" then .last_assistant_message
        elif $name == "SessionEnd" then .reason
        else null end) | (if . == null then null else short end)
    } end' 2>/dev/null) || exit 0
[ -z "$dashboard_event" ] && exit 0

transcript=$(printf '%s' "$input" | jq -r '.agent_transcript_path // empty')
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  agent_task=$(head -1 "$transcript" | jq -r '.message.content | if type == "string" then . else (map(.text? // "") | join(" ")) end' 2>/dev/null | tr -s '[:space:]' ' ' | cut -c1-160)
  dashboard_event=$(jq -c --arg task "$agent_task" '. + {task: $task}' <<<"$dashboard_event")
fi

payload=$(jq -cn --arg key "$INGEST_KEY" --argjson event "$dashboard_event" '{p_key: $key, p_event: $event}')
if [ -n "$DASHBOARD_DRY_FILE" ]; then echo "$payload" >> "$DASHBOARD_DRY_FILE"; exit 0; fi
curl -s -m 2 -o /dev/null -X POST "$SUPABASE_URL/rest/v1/rpc/ingest" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d "$payload" >/dev/null 2>&1 &
disown
exit 0
