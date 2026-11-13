// Resumo numérico de uso do Claude Code nos últimos 30 dias, sem nenhum texto de conversa.
// Uso: node scripts/uso-30-dias.mjs [AAAA-MM-DD fim] [saida.json]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.join(os.homedir(), '.claude', 'projects');
const FIM = process.argv[2] || '2026-11-13';
const SAIDA = process.argv[3] || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'docs', 'design', 'uso-30-dias.json');
const TZ = 'America/Sao_Paulo';
const DIAS = 30;
const OCIOSO_MS = 5 * 60 * 1000;

const fmtDia = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dia = (ms) => fmtDia.format(new Date(ms));
const diaFim = FIM;
const diaIni = dia(Date.parse(FIM + 'T12:00:00-03:00') - (DIAS - 1) * 86400000);
const noPeriodo = (ms) => { const d = dia(ms); return d >= diaIni && d <= diaFim; };

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const lerJsonl = (f) => {
  const linhas = [];
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!l) continue;
    try { linhas.push(JSON.parse(l)); } catch { /* linha truncada */ }
  }
  return linhas;
};
const zero = () => ({ entrada: 0, saida: 0, cacheLeitura: 0, cacheCriacao: 0 });
const somar = (a, b) => { a.entrada += b.entrada; a.saida += b.saida; a.cacheLeitura += b.cacheLeitura; a.cacheCriacao += b.cacheCriacao; return a; };
const total = (t) => t.entrada + t.saida + t.cacheLeitura + t.cacheCriacao;
// Custo relativo estimado em "tokens de entrada": saída 5x, leitura de cache 0,1x, criação de cache 1,25x.
const ponderado = (t) => Math.round(t.entrada + 5 * t.saida + 0.1 * t.cacheLeitura + 1.25 * t.cacheCriacao);
const mediana = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const porModelo = (mapa, modelo) => (mapa[modelo] ||= zero());

// ---------- descoberta dos arquivos ----------
const todos = walk(ROOT);
const jsonls = todos.filter((f) => f.endsWith('.jsonl') && !f.endsWith('journal.jsonl'));
const metas = todos.filter((f) => f.endsWith('.meta.json'));

const info = (f) => {
  const rel = path.relative(ROOT, f).split(path.sep);
  const pastaProjeto = rel[0];
  const ehSub = rel.includes('subagents');
  const sessao = ehSub ? rel[1] : rel[1].replace(/\.jsonl$/, '');
  const wf = ehSub && rel.includes('workflows') ? rel[rel.indexOf('workflows') + 1] : null;
  const agenteId = ehSub ? path.basename(f, '.jsonl').replace(/^agent-/, '') : null;
  return { pastaProjeto, ehSub, sessao, wf, agenteId };
};
const arquivos = jsonls.map((f) => ({ f, ...info(f) })).sort((a, b) => a.ehSub - b.ehSub); // principais primeiro

// ---------- passada única: mensagens, ferramentas, pedidos ----------
const msgs = new Map(); // message.id -> registro deduplicado
const toolUses = new Map(); // tool_use id -> {nome, ts, dono}
const toolDur = []; // {nome, ms, registrado}
const pedidos = []; // pedidos humanos nas sessões principais
const cwdPorSessao = {};
const agentesInfo = new Map(); // chave sessao/agenteId -> dados
const sessoesTs = new Map(); // sessao -> lista de timestamps (todas as linhas user/assistant no período)
const tipoPorToolUse = new Map(); // toolUseId do Agent -> subagent_type
let linhasLidas = 0;

for (const a of arquivos) {
  const linhas = lerJsonl(a.f);
  linhasLidas += linhas.length;
  const chaveAg = a.ehSub ? a.sessao + '/' + a.agenteId : null;
  for (const o of linhas) {
    if (o.type !== 'assistant' && o.type !== 'user') continue;
    const ts = Date.parse(o.timestamp);
    if (!Number.isFinite(ts) || !noPeriodo(ts)) continue;
    const chaveSessao = a.pastaProjeto + '|' + a.sessao;
    (sessoesTs.get(chaveSessao) || sessoesTs.set(chaveSessao, []).get(chaveSessao)).push(ts);
    if (o.cwd) { const c = (cwdPorSessao[chaveSessao] ||= {}); c[o.cwd] = (c[o.cwd] || 0) + 1; }

    const conteudo = o.message?.content;
    if (o.type === 'assistant') {
      const m = o.message;
      if (Array.isArray(conteudo)) {
        for (const b of conteudo) {
          if (b.type === 'tool_use' && b.id) {
            toolUses.set(b.id, { nome: b.name, ts });
            if (b.name === 'Agent' || b.name === 'Task') { const t = b.input?.subagent_type; if (typeof t === 'string') tipoPorToolUse.set(b.id, t); }
          }
        }
      }
      if (!m?.id || !m.model || m.model === '<synthetic>' || !m.usage) continue;
      const u = m.usage;
      const t = { entrada: u.input_tokens || 0, saida: u.output_tokens || 0, cacheLeitura: u.cache_read_input_tokens || 0, cacheCriacao: u.cache_creation_input_tokens || 0 };
      let r = msgs.get(m.id);
      if (!r) {
        r = { id: m.id, modelo: m.model, t, primeiro: ts, ultimo: ts, pastaProjeto: a.pastaProjeto, sessao: a.sessao, ehSub: a.ehSub, wf: a.wf, chaveAg, texto: null };
        msgs.set(m.id, r);
      } else {
        for (const k of Object.keys(t)) r.t[k] = Math.max(r.t[k], t[k]); // streaming repete a mesma resposta com contagem crescente
        r.ultimo = Math.max(r.ultimo, ts); r.primeiro = Math.min(r.primeiro, ts);
      }
      if (a.ehSub && Array.isArray(conteudo)) {
        const tx = conteudo.find((b) => b.type === 'text' && typeof b.text === 'string');
        if (tx && r.chaveAg === chaveAg) r.texto = tx.text; // só para o booleano de reprovação; nunca gravado
      }
      if (a.ehSub) {
        const ag = agentesInfo.get(chaveAg) || agentesInfo.set(chaveAg, { chaveAg, sessao: a.sessao, pastaProjeto: a.pastaProjeto, wf: a.wf, agenteId: a.agenteId, ini: ts, fim: ts, ultimoTexto: null, ultimoTextoTs: 0, ids: new Set(), arquivo: a.f }).get(chaveAg);
        ag.ini = Math.min(ag.ini, ts); ag.fim = Math.max(ag.fim, ts);
        if (r.chaveAg === chaveAg) ag.ids.add(m.id);
        // A resposta final do agente vai em texto ou na ferramenta SubagentHandback.
        const fin = Array.isArray(conteudo) && conteudo.map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : b.type === 'tool_use' && b.name === 'SubagentHandback' && typeof b.input?.message === 'string' ? b.input.message : null)).filter(Boolean).pop();
        if (fin && ts >= ag.ultimoTextoTs) { ag.ultimoTexto = fin; ag.ultimoTextoTs = ts; }
      }
    } else {
      // user
      if (a.ehSub) {
        const ag = agentesInfo.get(chaveAg) || agentesInfo.set(chaveAg, { chaveAg, sessao: a.sessao, pastaProjeto: a.pastaProjeto, wf: a.wf, agenteId: a.agenteId, ini: ts, fim: ts, ultimoTexto: null, ultimoTextoTs: 0, ids: new Set(), arquivo: a.f }).get(chaveAg);
        ag.ini = Math.min(ag.ini, ts); ag.fim = Math.max(ag.fim, ts);
      }
      if (Array.isArray(conteudo)) {
        for (const b of conteudo) {
          if (b.type !== 'tool_result' || !b.tool_use_id) continue;
          const tu = toolUses.get(b.tool_use_id);
          if (!tu) continue;
          const r = o.toolUseResult;
          let reg = null;
          if (r && typeof r === 'object' && !Array.isArray(r)) {
            if (Number.isFinite(r.durationMs)) reg = r.durationMs;
            else if (Number.isFinite(r.duration_ms)) reg = r.duration_ms;
            else if (Number.isFinite(r.totalDurationMs)) reg = r.totalDurationMs;
            else if (Number.isFinite(r.durationSeconds)) reg = r.durationSeconds * 1000;
          }
          const est = ts - tu.ts;
          if (reg == null && est < 0) continue;
          toolDur.push({ nome: tu.nome, ms: reg ?? est, registrado: reg != null });
          tu.visto = true;
        }
      }
      if (!a.ehSub && o.origin?.kind === 'human' && !o.isMeta) {
        const ehResultado = Array.isArray(conteudo) && conteudo[0]?.type === 'tool_result';
        if (!ehResultado) pedidos.push({ pastaProjeto: a.pastaProjeto, sessao: a.sessao, ts });
      }
    }
  }
}

// ---------- ferramentas: contagem de usos (inclui as sem resultado) ----------
const usosPorFerr = {};
for (const tu of toolUses.values()) usosPorFerr[tu.nome] = (usosPorFerr[tu.nome] || 0) + 1;

// ---------- projeto: último segmento da raiz do projeto ----------
const codifica = (p) => p.replace(/[^A-Za-z0-9]/g, '-');
const projetoDe = (pastaProjeto, chaveSessao) => {
  const cwds = Object.entries(cwdPorSessao[chaveSessao] || {}).sort((a, b) => b[1] - a[1]);
  for (const [cwd] of cwds) {
    const segs = cwd.split('/').filter(Boolean);
    for (let i = 1; i <= segs.length; i++) {
      if (codifica('/' + segs.slice(0, i).join('/')) === pastaProjeto) return segs[i - 1];
    }
  }
  if (cwds.length) return cwds[0][0].split('/').filter(Boolean).pop() || '/';
  return pastaProjeto.split('-').filter(Boolean).pop() || pastaProjeto;
};

// ---------- agregações ----------
const porDiaMapa = {};
const sessoes = new Map();
const sessao = (pasta, id) => {
  const k = pasta + '|' + id;
  let s = sessoes.get(k);
  if (!s) { s = { chave: k, pasta, id, tokens: {}, tokensSub: zero(), agentes: new Set(), nPedidos: 0 }; sessoes.set(k, s); }
  return s;
};
const agTokens = new Map();
const agModelos = new Map();
for (const r of msgs.values()) {
  const d = dia(r.primeiro);
  somar(porModelo((porDiaMapa[d] ||= {}), r.modelo), r.t);
  const s = sessao(r.pastaProjeto, r.sessao);
  somar(porModelo(s.tokens, r.modelo), r.t);
  if (r.ehSub) {
    somar(s.tokensSub, r.t);
    if (r.chaveAg) {
      somar(agTokens.get(r.chaveAg) || agTokens.set(r.chaveAg, zero()).get(r.chaveAg), r.t);
      const mm = agModelos.get(r.chaveAg) || agModelos.set(r.chaveAg, {}).get(r.chaveAg);
      mm[r.modelo] = (mm[r.modelo] || 0) + 1;
    }
  }
}
for (const p of pedidos) sessao(p.pastaProjeto, p.sessao).nPedidos++;
for (const ag of agentesInfo.values()) sessao(ag.pastaProjeto, ag.sessao).agentes.add(ag.chaveAg);

const porDia = Object.keys(porDiaMapa).sort().map((d) => ({ dia: d, tokensPorModelo: porDiaMapa[d] }));

const porSessao = [...sessoes.values()].map((s) => {
  const ts = (sessoesTs.get(s.chave) || []).sort((a, b) => a - b);
  let ativo = 0;
  for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g <= OCIOSO_MS) ativo += g; }
  return {
    sessao: s.id.slice(0, 8),
    projeto: projetoDe(s.pasta, s.chave),
    inicio: ts.length ? new Date(ts[0]).toISOString() : null,
    fim: ts.length ? new Date(ts[ts.length - 1]).toISOString() : null,
    duracaoMs: ts.length ? ts[ts.length - 1] - ts[0] : 0,
    duracaoAtivaEstimadaMs: ativo,
    tokensPorModelo: s.tokens,
    tokensSubagentes: s.tokensSub,
    nPedidos: s.nPedidos,
    nAgentes: s.agentes.size,
  };
}).sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));

// metadados dos agentes
const metaPorAgente = new Map();
for (const m of metas) {
  const i = info(m.replace(/\.meta\.json$/, '.jsonl'));
  try { metaPorAgente.set(i.sessao + '/' + i.agenteId, JSON.parse(fs.readFileSync(m, 'utf8'))); } catch { /* ignora */ }
}
const limpaTipo = (t) => (typeof t === 'string' && /^[A-Za-z0-9:_.-]{1,40}$/.test(t) ? t : 'agente-personalizado');
let nWorkflow = 0;
const porAgente = [...agentesInfo.values()].sort((a, b) => a.ini - b.ini).map((ag) => {
  const meta = metaPorAgente.get(ag.chaveAg);
  let tipo;
  if (ag.wf || meta?.agentType === 'workflow-subagent') tipo = `workflow-subagent #${++nWorkflow}`;
  else tipo = limpaTipo(meta?.agentType || tipoPorToolUse.get(meta?.toolUseId) || 'desconhecido');
  const mm = Object.entries(agModelos.get(ag.chaveAg) || {}).sort((a, b) => b[1] - a[1]);
  const t = agTokens.get(ag.chaveAg) || zero();
  const reprovado = typeof ag.ultimoTexto === 'string' && (ag.ultimoTexto.match(/\b(REPROVADO|APROVADO)\b/)?.[1] === 'REPROVADO');
  return {
    tipo,
    modelo: mm[0]?.[0] || null,
    sessao: ag.sessao.slice(0, 8),
    duracaoMs: ag.fim - ag.ini,
    nChamadas: ag.ids.size,
    tokens: t,
    custoRelativoEstimado: ponderado(t),
    reprovado,
  };
});

// pedidos: do pedido até a última resposta principal antes do próximo pedido
const msgsPorSessao = new Map();
for (const r of msgs.values()) { const k = r.pastaProjeto + '|' + r.sessao; (msgsPorSessao.get(k) || msgsPorSessao.set(k, []).get(k)).push(r); }
const pedPorSessao = new Map();
for (const p of pedidos) { const k = p.pastaProjeto + '|' + p.sessao; (pedPorSessao.get(k) || pedPorSessao.set(k, []).get(k)).push(p); }
const porPedido = [];
for (const [k, lista] of pedPorSessao) {
  lista.sort((a, b) => a.ts - b.ts);
  const ms = msgsPorSessao.get(k) || [];
  for (let i = 0; i < lista.length; i++) {
    const ini = lista[i].ts, lim = i + 1 < lista.length ? lista[i + 1].ts : Infinity;
    let ultimaResp = null; const tk = zero(), tkAg = zero();
    for (const r of ms) {
      if (r.primeiro < ini || r.primeiro >= lim) continue;
      if (r.ehSub) somar(tkAg, r.t);
      else { somar(tk, r.t); ultimaResp = Math.max(ultimaResp ?? 0, r.ultimo); }
    }
    porPedido.push({ sessao: lista[i].sessao.slice(0, 8), dia: dia(ini), tempoAteRespostaFinalMs: ultimaResp == null ? null : Math.max(0, ultimaResp - ini), tokens: tk, tokensSubagentes: tkAg });
  }
}
porPedido.sort((a, b) => a.dia.localeCompare(b.dia));

// ferramentas
const durPorFerr = {};
for (const d of toolDur) (durPorFerr[d.nome] ||= []).push(d);
const porFerramenta = Object.keys(usosPorFerr).map((nome) => {
  const ds = durPorFerr[nome] || [];
  const reg = ds.filter((d) => d.registrado).length;
  return {
    nome,
    nUsos: usosPorFerr[nome],
    nComDuracao: ds.length,
    nDuracaoRegistrada: reg,
    fonteDuracao: ds.length === 0 ? 'sem_dados' : reg === ds.length ? 'registrada' : reg === 0 ? 'estimada' : 'mista',
    somaMs: Math.round(ds.reduce((s, d) => s + d.ms, 0)),
    medianaMs: mediana(ds.map((d) => d.ms)),
  };
}).sort((a, b) => b.somaMs - a.somaMs);

const meta = {
  periodo: { inicio: diaIni, fim: diaFim, fusoHorario: TZ, dias: DIAS },
  geradoEm: new Date().toISOString(),
  arquivosLidos: { jsonlConversa: jsonls.length, jsonlSubagentes: jsonls.filter((f) => f.includes('/subagents/')).length, metaJson: metas.length, linhasLidas },
  totais: { respostasUnicas: msgs.size, sessoes: porSessao.length, agentes: porAgente.length, pedidos: porPedido.length, usosDeFerramenta: toolUses.size },
  estimado: [
    'duracao_ferramenta:timestamps',
    'duracao_ferramenta:inclui_esperas',
    'duracao_ativa:intervalos_ate_5min',
    'custo_relativo:5x_saida_0.1x_leitura',
    'reprovado:palavra_na_ultima_resposta',
    'pedido:origin_human_sessao_principal',
    'resposta_duplicada:max_por_campo',
    'dia:primeira_linha_no_fuso_local',
  ],
};

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify({ meta, porDia, porSessao, porAgente, porPedido, porFerramenta }, null, 1));

// ---------- checagem de privacidade ----------
const suspeitas = [];
let identificadoresLongos = 0;
const ehIdentificador = (v) => /^[A-Za-z0-9_:.-]{1,80}$/.test(v) || /^workflow-subagent #\d+$/.test(v);
const checa = (v, caminho) => {
  if (v.length <= 40 && !/\s/.test(v)) return;
  if (ehIdentificador(v)) { identificadoresLongos++; return; }
  suspeitas.push(caminho);
};
const varre = (v, caminho) => {
  if (typeof v === 'string') checa(v, caminho);
  else if (Array.isArray(v)) v.forEach((x) => varre(x, caminho + '[]'));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { checa(k, caminho + '.<chave>'); varre(x, caminho + '.' + k); }
};
varre(JSON.parse(fs.readFileSync(SAIDA, 'utf8')), '$');
const caminhosAbs = (fs.readFileSync(SAIDA, 'utf8').match(/"[^"\\]*\/[^"\\]*"/g) || []).filter((x) => !x.includes('T') || true);
console.log(`arquivo: ${SAIDA}`);
console.log(`tamanho: ${fs.statSync(SAIDA).size} bytes`);
console.log(`privacidade: strings suspeitas (>40 ou com espaço, fora de nomes de ferramenta/agente): ${suspeitas.length}; identificadores longos sem espaço: ${identificadoresLongos}; strings com barra: ${caminhosAbs.length}`);
if (suspeitas.length) console.log([...new Set(suspeitas)].join('\n'));
