import { useConnectPanel } from './hooks/useConnectPanel';

interface ConnectPanelProps {
  onBack: () => void;
}

export function ConnectPanel({ onBack }: ConnectPanelProps) {
  const { view, requestNew, confirm, cancel, retryStatus, copyCommand } = useConnectPanel();
  return (
    <div className="notice">
      <h2>Conectar meu Claude Code</h2>
      <p><b>{view.headline}</b></p>
      {view.hint && <p className="muted">{view.hint}</p>}
      {view.error && <p role="alert">{view.error}</p>}
      {view.canRetryStatus && <button type="button" className="ghost-button" onClick={retryStatus}>Tentar de novo</button>}
      {view.confirmation && (
        <div role="alertdialog" aria-label="Gerar nova conexão">
          <p>{view.confirmation.text}</p>
          <button type="button" className="ghost-button" onClick={confirm}>{view.confirmation.confirmLabel}</button>{' '}
          <button type="button" className="ghost-button" onClick={cancel}>{view.confirmation.cancelLabel}</button>
        </div>
      )}
      {view.action && <button type="button" className="ghost-button" disabled={view.action.disabled} onClick={requestNew}>{view.action.label}</button>}
      {view.install && (
        <>
          <p><b>No seu computador:</b> cole no terminal e aperte Enter.</p>
          <pre>{view.install.command}</pre>
          <button type="button" className="ghost-button" onClick={() => void copyCommand(view.install?.command ?? '')}>{view.install.copyLabel}</button>
          <p className="muted">Depois, abra uma sessão nova do Claude Code. Ela aparece aqui sozinha.</p>
          <p>
            <b>Na nuvem (claude.ai/code), opcional:</b> no ambiente da sessão, em <i>Variáveis de ambiente</i>, cole{' '}
            <code>{view.install.cloudVariable}</code> e, em <i>Acesso à rede</i>, libere <code>{view.install.networkHost}</code>.
          </p>
        </>
      )}
      <p><button type="button" className="ghost-button" onClick={onBack}>Voltar ao painel</button></p>
    </div>
  );
}
