import { useEffect, useMemo, useState } from 'react';
import { BoardView } from './BoardView';
import { ConnectPanel } from './ConnectPanel';
import { buildBoard } from './lib/board';
import { tabIndicator } from './lib/format';
import { useDashboard } from './useDashboard';

export function App() {
  const { access, userName, events, isLive, historyError, now, signIn, signOut } = useDashboard();
  const [isConnecting, setIsConnecting] = useState(false);
  const board = useMemo(() => buildBoard(events, now), [events, now]);

  useEffect(() => {
    document.title = tabIndicator(board.flatMap((person) => person.sessions)).title;
  }, [board]);

  return (
    <>
      {access === 'member' && !isLive && <div id="offline">Sem conexão com o servidor. Os dados podem estar desatualizados.</div>}
      <header>
        <h1>Painel de agentes</h1>
        {userName && <span className="muted">{userName}</span>}
        <span>
          {access === 'signed_out' && <button onClick={signIn}>Entrar com GitHub</button>}
          {userName && (
            <>
              <button onClick={() => setIsConnecting(true)}>Conectar meu Claude Code</button> <button onClick={signOut}>Sair</button>
            </>
          )}
        </span>
      </header>
      {isConnecting && userName ? <ConnectPanel onBack={() => setIsConnecting(false)} /> : (
        <>
          {access === 'signed_out' && <div className="notice">Entre com a sua conta do GitHub para ver o painel.</div>}
          {access === 'no_access' && <div className="notice">Seu usuário ainda não tem acesso. Peça para alguém do time incluir você.</div>}
          {access === 'member' && historyError && <div className="notice">Não foi possível carregar suas sessões: {historyError}. Confira a internet e recarregue a página.</div>}
          {access === 'member' && !historyError && <BoardView board={board} now={now} />}
        </>
      )}
    </>
  );
}
