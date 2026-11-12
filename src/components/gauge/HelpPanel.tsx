import { HELP_TITLE } from '../../lib/gauge-model';
import { statePresentation, type StateKey } from '../../lib/card-model';
import { Icon } from '../Icon';

const LEGEND: { state: StateKey; text: string }[] = [
  { state: 'running', text: 'rodando' },
  { state: 'done', text: 'concluído' },
  { state: 'waiting', text: 'aguardando você' },
  { state: 'stale', text: 'sem sinal' },
  { state: 'your_turn', text: 'sua vez: o Claude terminou de responder' },
  { state: 'ended', text: 'encerrada' },
];

export function HelpPanel() {
  return (
    <div className="gauge-panel gauge-panel--help" role="dialog" aria-label={HELP_TITLE}>
      <span className="gauge-panel__title">{HELP_TITLE}</span>
      {LEGEND.map(({ state, text }) => (
        <span key={state} className={`legend-row legend-row--${state}`}><Icon name={statePresentation(state).icon} />{text}</span>
      ))}
      <span className="gauge-panel__divider" />
      <span className="legend-row"><span className="legend-bars" aria-hidden="true"><i /><i /><i /></span>Barrinhas: ações a cada 30 s, últimos 10 min</span>
      <span className="gauge-panel__caption">Clique num item para abrir o que está abaixo dele e ver o detalhe. Esc fecha.</span>
    </div>
  );
}
