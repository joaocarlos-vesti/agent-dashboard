import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { buildBoard, allSessionsOf } from './board.js';
import { formatTokens, formatRelativeTime, folderName, tabIndicator } from './format.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const root = document.getElementById('root');
const HISTORY_HOURS = 24;
const STATUS_LABEL = { running: 'rodando', done: 'concluído', waiting: 'aguardando você', your_turn: 'sua vez', stale: 'sem sinal', ended: 'encerrada' };
let loadedEvents = [];

const escapeHtml = (text) => String(text ?? '').replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
const badge = (status) => `<span class="badge ${status}">${STATUS_LABEL[status]}</span>`;
const minutesAgo = (iso) => formatRelativeTime(iso, Date.now());
const WAITING_REASON_LABEL = { permission_prompt: 'esperando permissão', idle_prompt: 'ocioso', elicitation_dialog: 'tem uma pergunta para você', agent_needs_input: 'um agente precisa de você' };
const projectName = (cwd) => folderName(cwd) ?? 'sessão';

const agentDetail = (agent) => {
  if (agent.status === 'done') return `→ ${agent.result ?? ''}`;
  const lastAction = agent.lastAction ?? 'iniciando…';
  return agent.silentSince ? `${lastAction} · sem nova ação há ${agent.silentSince} min` : lastAction;
};
const agentTokensHtml = (agent) => (agent.tokens ? `<div class="muted">${formatTokens(agent.tokens.primary)} tokens</div>` : '');

const agentHtml = (agent) => `
  <div class="row"><span class="grow">${escapeHtml(agent.task ?? agent.label)}</span>${badge(agent.status)}</div>
  <div class="muted grow">${escapeHtml(agentDetail(agent))}</div>${agentTokensHtml(agent)}`;

const workflowHtml = (workflow) => `
  <div class="row"><b class="grow">⚙ ${escapeHtml(workflow.name)}</b>${badge(workflow.status)}</div>
  <div class="tree">${workflow.agents.map(agentHtml).join('') || '<div class="muted">aguardando agentes…</div>'}</div>`;

const sessionHtml = (session) => `
  <div class="session">
    <div class="row"><span class="grow">${escapeHtml(projectName(session.cwd))}</span>${badge(session.status)}</div>
    <div class="muted">última atividade ${minutesAgo(session.lastAt)}${session.waitingReason ? ` · ${WAITING_REASON_LABEL[session.waitingReason] ?? ''}` : ''}</div>
    <div class="muted">${formatTokens(session.tokens.total.primary)} tokens (entrada + saída)</div>
    ${session.workflows.length || session.agents.length
      ? `<div class="tree">${session.workflows.map(workflowHtml).join('')}${session.agents.map(agentHtml).join('')}</div>` : ''}
  </div>`;

function render() {
  const board = buildBoard(loadedEvents);
  document.title = tabIndicator(allSessionsOf(board)).title;
  root.innerHTML = board.length
    ? `<main>${board.map((person) => `<section class="card"><h2>${escapeHtml(person.login)}</h2>${allSessionsOf([person]).map(sessionHtml).join('')}</section>`).join('')}</main>`
    : `<div class="notice">Nenhum agente ativo nas últimas ${HISTORY_HOURS} horas.
        <p class="muted">Ainda não conectou? Clique em <b>Conectar meu Claude Code</b> no topo.</p></div>`;
}

async function loadHistory() {
  const since = new Date(Date.now() - HISTORY_HOURS * 3600000).toISOString();
  const { data: recentEvents, error } = await supabase.from('events').select('*').gte('created_at', since).order('id').limit(5000);
  if (error) throw error;
  loadedEvents = recentEvents;
  render();
}

function listenLive() {
  supabase.channel('events')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, ({ new: insertedEvent }) => {
      loadedEvents.push(insertedEvent);
      render();
    })
    .subscribe((status) => {
      document.getElementById('offline').style.display = status === 'SUBSCRIBED' ? 'none' : 'block';
      if (status === 'SUBSCRIBED') loadHistory();
    });
}

async function showConnect() {
  const { data: dashboardKey, error } = await supabase.rpc('create_my_key');
  if (error) {
    root.innerHTML = '<div class="notice">Não foi possível gerar a conexão. Tente de novo em instantes.</div>';
    return;
  }
  const installCommand = `curl -fsSL ${location.origin}/install.sh | bash -s -- ${dashboardKey}`;
  root.innerHTML = `<div class="notice">
    <h2>Conectar meu Claude Code</h2>
    <p><b>No seu computador:</b> cole no terminal e aperte Enter.</p>
    <pre>${installCommand}</pre>
    <button id="copy">Copiar comando</button>
    <p class="muted">Depois, abra uma sessão nova do Claude Code. Ela aparece aqui sozinha.</p>
    <p><b>Na nuvem (claude.ai/code), opcional:</b> no ambiente da sessão, em <i>Variáveis de ambiente</i>, cole
    <code>INGEST_KEY=${dashboardKey}</code> e, em <i>Acesso à rede</i>, libere <code>${new URL(SUPABASE_URL).host}</code>.</p>
    <p class="muted">Gerar uma conexão nova desliga a anterior.</p>
    <button id="back">Voltar ao painel</button></div>`;
  document.getElementById('copy').onclick = async (clickEvent) => {
    await navigator.clipboard.writeText(installCommand);
    clickEvent.target.textContent = 'Copiado!';
  };
  document.getElementById('back').onclick = render;
}

async function start() {
  const { data: { session } } = await supabase.auth.getSession();
  const actions = document.getElementById('actions');
  if (!session) {
    root.innerHTML = '<div class="notice">Entre com a sua conta do GitHub para ver o painel.</div>';
    actions.innerHTML = '<button id="login">Entrar com GitHub</button>';
    document.getElementById('login').onclick = () =>
      supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.origin } });
    return;
  }
  document.getElementById('who').textContent = session.user.user_metadata.user_name;
  actions.innerHTML = '<button id="key">Conectar meu Claude Code</button> <button id="logout">Sair</button>';
  document.getElementById('logout').onclick = async () => { await supabase.auth.signOut(); location.reload(); };
  document.getElementById('key').onclick = showConnect;

  const { data: isMember } = await supabase.rpc('is_member');
  if (!isMember) {
    root.innerHTML = '<div class="notice">Seu usuário ainda não tem acesso. Peça para alguém do time incluir você.</div>';
    return;
  }
  listenLive();
  setInterval(render, 30000);
}

// O retorno do GitHub pode terminar depois do carregamento da página; recomeça quando o login conclui.
supabase.auth.onAuthStateChange((authEvent) => {
  if (authEvent === 'SIGNED_IN' && !document.getElementById('logout')) start();
});

start();
