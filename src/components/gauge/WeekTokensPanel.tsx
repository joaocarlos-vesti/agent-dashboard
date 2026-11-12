import { TOKENS_DEFINITION, type GaugeModel } from '../../lib/gauge-model';
import { Icon } from '../Icon';

interface WeekTokensPanelProps {
  gauge: GaugeModel;
  onSelectDay: (day: string) => void;
}

function WeekRows({ week, onSelectDay }: { week: GaugeModel['week']; onSelectDay: (day: string) => void }) {
  if (week.kind !== 'ready') return <p className="gauge-panel__note">{week.text}</p>;
  return (
    <div className="week-rows">
      {week.rows.map((row) => (
        <button key={row.day} type="button" className="week-row" aria-pressed={row.selected} onClick={() => onSelectDay(row.day)}>
          <span className="week-row__label">{row.label}</span>
          <span className="meter"><span className="meter__fill" style={{ width: `${row.widthPct}%` }} /></span>
          <span className="week-row__tokens">{row.tokensText}</span>
        </button>
      ))}
    </div>
  );
}

export function WeekTokensPanel({ gauge, onSelectDay }: WeekTokensPanelProps) {
  return (
    <div className="gauge-panel gauge-panel--tokens" role="dialog" aria-label="Tokens dos últimos 7 dias">
      <span className="gauge-panel__caption">Últimos 7 dias · entrada + saída</span>
      {gauge.week.kind === 'ready' && <span className="gauge-panel__total">{gauge.week.totalText}</span>}
      <span className="gauge-panel__caption">{TOKENS_DEFINITION}</span>
      <WeekRows week={gauge.week} onSelectDay={onSelectDay} />
      <span className="gauge-panel__caption gauge-panel__caption--spaced">{gauge.daySessionsTitle}</span>
      <div className="day-sessions">
        {gauge.daySessions.map((row) => (
          <div key={row.id} className={`day-session${row.ended ? ' day-session--ended' : ''}`}>
            <Icon name={row.ended ? 'ended' : 'terminal'} />
            <span className="day-session__name">{row.name}</span>
            <span className="day-session__tokens">{row.tokensText}</span>
          </div>
        ))}
        {gauge.daySessionsEmptyText && <span className="gauge-panel__note">{gauge.daySessionsEmptyText}</span>}
      </div>
    </div>
  );
}
