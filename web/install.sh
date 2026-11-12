#!/usr/bin/env bash
# Conecta o Claude Code desta máquina ao painel de agentes. Pode rodar de novo sem duplicar nada.
set -euo pipefail
SITE="https://painel-agentes-nine.vercel.app"
DASHBOARD_KEY="${1:-}"
[[ "$DASHBOARD_KEY" =~ ^[0-9a-f-]{36}$ ]] || { echo "Chave inválida. Copie o comando de novo no painel."; exit 1; }
for tool in jq curl; do
  command -v "$tool" >/dev/null || { echo "Falta instalar o $tool (ex.: sudo apt install $tool)."; exit 1; }
done

DIR="$HOME/.agent-dashboard"
SETTINGS="$HOME/.claude/settings.json"
mkdir -p "$DIR" "$HOME/.claude"
curl -fsSL "$SITE/send.sh" -o "$DIR/send.sh"
chmod +x "$DIR/send.sh"
printf 'INGEST_KEY=%s\n' "$DASHBOARD_KEY" > "$DIR/config"
chmod 600 "$DIR/config"

[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$SETTINGS.bak-painel"
HOOK='{"matcher":"*","hooks":[{"type":"command","command":"$HOME/.agent-dashboard/send.sh","timeout":5}]}'
jq --argjson hook "$HOOK" '
  .hooks = (.hooks // {})
  | reduce ("SessionStart","UserPromptSubmit","PreToolUse","PostToolUse","SubagentStart","SubagentStop","Stop","SessionEnd","Notification") as $event (.;
      if any(.hooks[$event][]?.hooks[]?; (.command // "") | contains(".agent-dashboard/send.sh")) then .
      else .hooks[$event] += [$hook] end)' "$SETTINGS.bak-painel" > "$SETTINGS"

echo "Pronto! Abra uma sessão nova do Claude Code e ela vai aparecer no painel."
