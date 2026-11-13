import type { ActivityBlock } from '../../lib/detail-model';

const BAR_MIN_HEIGHT = 2;
const BAR_MAX_HEIGHT = 32;
const heightOf = (count: number) => (count === 0 ? BAR_MIN_HEIGHT : Math.min(BAR_MAX_HEIGHT, 4 + count * 3));

export function ActivitySection({ activity, lit }: { activity: ActivityBlock; lit: boolean }) {
  return (
    <section className="detail-section" aria-label="Atividade">
      <div className="detail-section__row">
        <h3 className="detail-section__title">{activity.title}</h3>
        <span className="detail-section__aside"><strong>{activity.total}</strong> {activity.totalLabel}</span>
      </div>
      <div className="rhythm" title="ritmo de ações" aria-hidden="true">
        {activity.bars.map((count, index) => (
          <span key={index} className={`rhythm__bar${count > 0 ? (lit ? ' rhythm__bar--lit' : ' rhythm__bar--active') : ''}`} style={{ height: heightOf(count) }} />
        ))}
      </div>
      <div className="rhythm-axis">{activity.legend ? <span>{activity.legend}</span> : <><span>{activity.startLabel}</span><span>{activity.endLabel}</span></>}</div>
      {activity.recentActions.length > 0 && (
        <ol className="recent-actions">
          {activity.recentActions.map((action, index) => (
            <li key={`${action.exact}-${index}`} className="recent-action">
              <span className="recent-action__text">{action.text}</span>
              <time className="recent-action__time" title={action.exact}>{action.relative}</time>
            </li>
          ))}
        </ol>
      )}
      {activity.emptyText && <p className="detail-section__empty">{activity.emptyText}</p>}
    </section>
  );
}
