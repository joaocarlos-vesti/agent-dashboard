import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { SUPABASE_URL } from './config';

interface ConnectPanelProps {
  onBack: () => void;
}

export function ConnectPanel({ onBack }: ConnectPanelProps) {
  const [dashboardKey, setDashboardKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void supabase.rpc('create_my_key').then(({ data, error }) => {
      if (error) setFailed(true);
      else setDashboardKey(data);
    });
  }, []);

  if (failed) return <div className="notice">Não foi possível gerar a conexão. Tente de novo em instantes.</div>;
  if (!dashboardKey) return <div className="notice">Gerando a conexão…</div>;

  const installCommand = `curl -fsSL ${window.location.origin}/install.sh | bash -s -- ${dashboardKey}`;
  const copyCommand = async () => {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
  };

  return (
    <div className="notice">
      <h2>Conectar meu Claude Code</h2>
      <p><b>No seu computador:</b> cole no terminal e aperte Enter.</p>
      <pre>{installCommand}</pre>
      <button onClick={copyCommand}>{copied ? 'Copiado!' : 'Copiar comando'}</button>
      <p className="muted">Depois, abra uma sessão nova do Claude Code. Ela aparece aqui sozinha.</p>
      <p>
        <b>Na nuvem (claude.ai/code), opcional:</b> no ambiente da sessão, em <i>Variáveis de ambiente</i>, cole{' '}
        <code>INGEST_KEY={dashboardKey}</code> e, em <i>Acesso à rede</i>, libere <code>{new URL(SUPABASE_URL).host}</code>.
      </p>
      <p className="muted">Gerar uma conexão nova desliga a anterior.</p>
      <button onClick={onBack}>Voltar ao painel</button>
    </div>
  );
}
