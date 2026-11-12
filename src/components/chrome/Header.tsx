import type { HeaderModel } from '../../lib/header-model';
import type { Access } from '../../lib/screen-state';
import { Icon } from '../Icon';
import { DaySelector } from './DaySelector';

interface HeaderProps {
  model: HeaderModel;
  access: Access;
  userName: string | null;
  isLive: boolean;
  onGoToWaiting: () => void;
  onSelectDay: (day: string) => void;
  onConnect: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

function LiveIndicator({ isLive, updatedText }: { isLive: boolean; updatedText: string }) {
  return (
    <span className="live-indicator" role="status">
      <span className={`live-indicator__dot${isLive ? '' : ' live-indicator__dot--off'}`} />
      <span>{isLive ? 'Ao vivo' : 'Sem conexão'}</span>
      <span className="live-indicator__updated">{updatedText}</span>
    </span>
  );
}

export function Header({ model, access, userName, isLive, onGoToWaiting, onSelectDay, onConnect, onSignIn, onSignOut }: HeaderProps) {
  const isMember = access === 'member';
  return (
    <header className="app-header">
      <h1 className="app-header__title">Painel de agentes</h1>
      {model.waiting && (
        <button type="button" className="waiting-button" onClick={onGoToWaiting}>
          <Icon name="waiting" />
          {model.waiting.text}
          <span className="waiting-button__since">{model.waiting.since}</span>
          <Icon name="arrowRight" />
        </button>
      )}
      <span className="app-header__spacer" />
      {isMember && <DaySelector days={model.days} onSelectDay={onSelectDay} />}
      {isMember && <LiveIndicator isLive={isLive} updatedText={model.updatedText} />}
      {userName && <span className="app-header__user">{userName}</span>}
      {access === 'signed_out' && <button type="button" className="ghost-button" onClick={onSignIn}>Entrar com GitHub</button>}
      {userName && <button type="button" className="ghost-button" onClick={onConnect}>Conectar meu Claude Code</button>}
      {userName && <button type="button" className="ghost-button" onClick={onSignOut}>Sair</button>}
    </header>
  );
}
