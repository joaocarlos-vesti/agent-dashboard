import type { ChildBar } from '../../lib/detail-model';
import { Icon } from '../Icon';

interface ChildrenSectionProps {
  title: string;
  bars: ChildBar[];
  onSelectChild: (id: string) => void;
}

export function ChildrenSection({ title, bars, onSelectChild }: ChildrenSectionProps) {
  return (
    <section className="detail-section" aria-label="Abaixo">
      <h3 className="detail-section__title">{title}</h3>
      {bars.map((child) => (
        <button key={child.id} type="button" className={`child-bar${child.lit ? ' child-bar--lit' : ''}`} onClick={() => onSelectChild(child.id)}>
          <span className="child-bar__line">
            <span className={`child-bar__icon child-bar__icon--${child.state}`}><Icon name={child.stateIcon} /></span>
            <span className="child-bar__name">{child.title}</span>
            {child.alert && <span className="child-bar__alert"><Icon name="rejected" label={child.alert} /></span>}
            <span className="child-bar__tokens">{child.tokensText}</span>
          </span>
          <span className="meter"><span className="meter__fill" style={{ width: `${child.widthPct}%` }} /></span>
        </button>
      ))}
    </section>
  );
}
