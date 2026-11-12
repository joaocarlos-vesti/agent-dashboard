import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { buildBoard } from './board.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const root = document.getElementById('root');
const HISTORY_HOURS = 24;
const STATUS_LABEL = { running: 'rodando', done: 'concluído', idle: 'aguardando a pessoa', stale: 'sem sinal', ended: 'encerrada' };
let loadedEvents = [];

const escapeHtml = (text) => String(text ?? '').replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
const badge = (status) => `<span class="badge ${status}">${STATUS_LABEL[status]}</span>`;
const minutesAgo = (iso) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return minutes < 1 ? 'agora' : minutes < 60 ? `há ${minutes} min` : `há ${Math.round(minutes / 60)} h`;
};
const projectName = (cwd) => cwd?.split('/').filter(Boolean).at(-1) ?? 'sessão';

const agentHtml = (agent, index) => `
  <div class="row"><span class="grow">${escapeHtml(agent.task ?? `${agent.type} ${index + 1}`)}</span>${badge(agent.status)}</div>
  <div class="muted grow">${escapeHtml(agent.status === 'done' ? `→ ${agent.result ?? ''}` : agent.lastAction ?? 'iniciando…')}</div>`;

const workflowHtml = (workflow) => `
  <div class="row"><b class="grow">⚙ ${escapeHtml(workflow.name)}</b>${badge(workflow.status)}</div>
  <div class="tree">${workflow.agents.map(agentHtml).join('') || '<div class="muted">aguardando agentes…</div>'}</div>`;

const sessionHtml = (session) => `
  <div class="session">
    <div class="row"><span class="grow">${escapeHtml(projectName(session.cwd))}</span>${badge(session.status)}</div>
    <div class="muted">última atividade ${minutesAgo(session.lastAt)}</div>
    ${session.workflows.length || session.agents.length
      ? `<div class="tree">${session.workflows.map(workflowHtml).join('')}${session.agents.map(agentHtml).join('')}</div>` : ''}
  </div>`;

function render() {
  const board = buildBoard(loadedEvents);
  root.innerHTML = board.length
    ? `<main>${board.map((person) => `<section class="card"><h2>${escapeHtml(person.login)}</h2>${person.sessions.map(sessionHtml).join('')}</section>`).join('')}</main>`
    : `<div class="notice">Nenhum agente ativo nas últimas ${HISTORY_HOURS} horas.</div>`;
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

async function showKey() {
  const { data: ingestKey, error } = await supabase.rpc('create_my_key');
  if (error) return alert('Não foi possível gerar a chave.');
  root.innerHTML = `<div class="notice">
    <p><b>Sua chave pessoal</b> (gerar outra invalida esta):</p><pre>${ingestKey}</pre>
    <p>1. Salve o arquivo <code>~/.agent-dashboard/config</code> com:</p>
    <pre>SUPABASE_URL=${SUPABASE_URL}\nSUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}\nINGEST_KEY=${ingestKey}</pre>
    <p>2. Copie <code>hook/send.sh</code> do repositório para <code>~/.agent-dashboard/send.sh</code> (precisa de <code>jq</code> e <code>curl</code>).</p>
    <p>3. Junte o conteúdo de <code>hook/settings-hooks.json</code> ao seu <code>~/.claude/settings.json</code> e abra uma sessão nova do Claude Code.</p>
    <button id="back">Voltar ao painel</button></div>`;
  document.getElementById('back').onclick = render;
}

async function start() {
  const { data: { session } } = await supabase.auth.getSession();
  const actions = document.getElementById('actions');
  if (!session) {
    root.innerHTML = '<div class="notice">Entre com a sua conta do GitHub para ver o painel.</div>';
    actions.innerHTML = '<button id="login">Entrar com GitHub</button>';
    document.getElementById('login').onclick = () =>
      supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.href } });
    return;
  }
  document.getElementById('who').textContent = session.user.user_metadata.user_name;
  actions.innerHTML = '<button id="key">Minha chave</button> <button id="logout">Sair</button>';
  document.getElementById('logout').onclick = async () => { await supabase.auth.signOut(); location.reload(); };
  document.getElementById('key').onclick = showKey;

  const { data: isMember } = await supabase.rpc('is_member');
  if (!isMember) {
    root.innerHTML = '<div class="notice">Seu usuário ainda não tem acesso. Peça para alguém do time incluir você.</div>';
    return;
  }
  listenLive();
  setInterval(render, 30000);
}

start();
