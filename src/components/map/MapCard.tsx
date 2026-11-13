import type { CardModel } from '../../lib/card-model';
import { Icon } from '../Icon';
import { LiveNumber } from '../LiveNumber';
import { HeartbeatBars } from './HeartbeatBars';

interface MapCardProps {
  card: CardModel;
  selected: boolean;
  onActivate: (card: CardModel) => void;
  onToggle: (card: CardModel) => void;
}

/** Card de sessão, workflow ou agente: clicar no corpo abre o detalhe; a seta à direita abre ou fecha o que tem abaixo. */
export function MapCard({ card, selected, onActivate, onToggle }: MapCardProps) {
  const hasChildren = card.childCount > 0;
  return (
    <div className={`map-card map-card--${card.tone}${selected ? ' map-card--selected' : ''}${card.entering ? ' map-card--entering' : ''}`} data-lit={card.lit || undefined}>
      <button type="button" id={`card-${card.id}`} className="map-card__select" aria-pressed={selected} aria-label={card.ariaLabel} onClick={() => onActivate(card)}>
        <span className={`orb orb--${card.state}${card.ringing ? ' orb--ringing' : ''}`}><Icon name={card.icon} /></span>
        <span className="map-card__body">
          <span className="map-card__head">
            <span className="map-card__title" title={card.titleHint}>{card.title}</span>
            {card.probableSameAgent && <Icon name="probable" label="provável mesmo agente" className="map-card__probable" />}
          </span>
          <span className={`map-card__state map-card__state--${card.state}`}>
            <Icon name={card.stateIcon} />
            <span className="map-card__state-word">{card.stateLabel}</span>
            <span className="map-card__state-detail">{card.stateDetail}</span>
            {card.showsHeartbeat && <HeartbeatBars counts={card.heartbeat} lit={card.lit} />}
          </span>
          {card.actionText && <span className="map-card__action">{card.actionText}</span>}
          <span className="map-card__tokens">{card.tokensText && <LiveNumber value={card.tokensText} />} {card.tokensCaption}</span>
          {card.callsSummary && <span className="map-card__calls">{card.callsSummary}</span>}
          {card.marks.length > 0 && <span className="map-card__marks">{card.marks.map((mark) => <span key={mark}>{mark}</span>)}</span>}
          {card.tags.length > 0 && (
            <span className="map-card__tags">
              {card.tags.map((tag) => <span key={tag.kind} className="tag"><Icon name={tag.icon} />{tag.text}</span>)}
            </span>
          )}
        </span>
      </button>
      {hasChildren && (
        <button type="button" className="map-card__toggle" aria-expanded={card.open} aria-label={`${card.open ? 'Recolher' : 'Abrir'} os ${card.childCount} itens de ${card.title}`} onClick={() => onToggle(card)}>
          <Icon name={card.open ? 'chevronDown' : 'chevronRight'} />{card.childCount}
        </button>
      )}
    </div>
  );
}
