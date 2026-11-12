import { LiveNumber } from '../LiveNumber';
import type { GaugeModel } from '../../lib/gauge-model';
import type { GaugePanel } from '../../lib/ui-state';
import { HelpPanel } from './HelpPanel';
import { WeekTokensPanel } from './WeekTokensPanel';

interface GaugeProps {
  model: GaugeModel;
  openPanel: GaugePanel;
  onTogglePanel: (panel: 'tokens' | 'help') => void;
  onSelectDay: (day: string) => void;
}

/** Mostrador flutuante: três números do dia e os painéis de tokens dos 7 dias e de ajuda. */
export function Gauge({ model, openPanel, onTogglePanel, onSelectDay }: GaugeProps) {
  const [acting, actionsPerMinute, tokens] = model.figures;
  return (
    <div className="gauge">
      {openPanel === 'tokens' && <WeekTokensPanel gauge={model} onSelectDay={onSelectDay} />}
      {openPanel === 'help' && <HelpPanel />}
      <div className="gauge-bar">
        {acting && <span className="gauge-figure"><strong>{acting.value}</strong>&nbsp;{acting.label}</span>}
        {actionsPerMinute && <span className="gauge-figure"><strong>{actionsPerMinute.value}</strong>&nbsp;{actionsPerMinute.label}</span>}
        {tokens && (
          <button type="button" className="gauge-button" aria-expanded={openPanel === 'tokens'} onClick={() => onTogglePanel('tokens')}>
            <LiveNumber value={tokens.value} /> {tokens.label}
          </button>
        )}
        <button type="button" className="gauge-button gauge-button--icon" aria-expanded={openPanel === 'help'} aria-label="Como ler o mapa" onClick={() => onTogglePanel('help')}>?</button>
      </div>
    </div>
  );
}
