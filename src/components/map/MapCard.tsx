import type { CardModel } from '../../lib/card-model';
import { Icon } from '../Icon';
import { HeartbeatBars } from './HeartbeatBars';

interface MapCardProps {
  card: CardModel;
  selected: boolean;
  onActivate: (card: CardModel) => void;
}

/** Card de sessão, workflow ou agente; o clique abre ou fecha o que tem abaixo e seleciona para o painel. */
export function MapCard({ card, selected, onActivate }: MapCardProps) {
  const hasChildren = card.childCount > 0;
  return (
    <button
      type="button"
      id={`card-${card.id}`}
      className={`map-card map-card--${card.tone}${selected ? ' map-card--selected' : ''}`}
      data-lit={card.lit || undefined}
      aria-expanded={hasChildren ? card.open : undefined}
      aria-label={card.ariaLabel}
      onClick={() => onActivate(card)}
    >
      <span className={`orb orb--${card.state}`}><Icon name={card.icon} /></span>
      <span className="map-card__body">
        <span className="map-card__head">
          <span className="map-card__title" title={card.titleHint}>{card.title}</span>
          {card.probableSameAgent && <Icon name="probable" label="provável mesmo agente" className="map-card__probable" />}
          {hasChildren && <span className="map-card__children"><Icon name={card.open ? 'chevronDown' : 'chevronRight'} />{card.childCount}</span>}
        </span>
        <span className={`map-card__state map-card__state--${card.state}`}>
          <Icon name={card.stateIcon} />
          <span className="map-card__state-word">{card.stateLabel}</span>
          <span className="map-card__state-detail">{card.stateDetail}</span>
          {card.showsHeartbeat && <HeartbeatBars counts={card.heartbeat} lit={card.lit} />}
        </span>
        {card.actionText && <span className="map-card__action">{card.actionText}</span>}
        <span className="map-card__tokens">{card.tokensText && <strong>{card.tokensText}</strong>} {card.tokensCaption}</span>
        {card.marks.length > 0 && <span className="map-card__marks">{card.marks.map((mark) => <span key={mark}>{mark}</span>)}</span>}
        {card.tags.length > 0 && (
          <span className="map-card__tags">
            {card.tags.map((tag) => <span key={tag.kind} className="tag"><Icon name={tag.icon} />{tag.text}</span>)}
          </span>
        )}
      </span>
    </button>
  );
}
