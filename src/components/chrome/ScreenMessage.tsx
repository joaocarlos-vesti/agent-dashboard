import type { ScreenState } from '../../lib/screen-state';

type MessageState = Exclude<ScreenState, { kind: 'ready' }>;

interface ScreenMessageProps {
  state: MessageState;
  onRetry: () => void;
  onSignIn: () => void;
}

export function ScreenMessage({ state, onRetry, onSignIn }: ScreenMessageProps) {
  return (
    <div className="screen-message" role={state.kind === 'error' ? 'alert' : 'status'}>
      <p className="screen-message__title">{state.title}</p>
      {state.kind === 'empty' && state.hint && <p className="screen-message__hint">{state.hint}</p>}
      {state.kind === 'error' && <button type="button" className="ghost-button" onClick={onRetry}>{state.action}</button>}
      {state.kind === 'signedOut' && <button type="button" className="ghost-button" onClick={onSignIn}>{state.action}</button>}
    </div>
  );
}
