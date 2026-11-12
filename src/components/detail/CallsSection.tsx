import type { CallsBlock } from '../../lib/detail-model';
import { Icon } from '../Icon';

export function CallsSection({ calls }: { calls: CallsBlock }) {
  return (
    <section className="detail-section" aria-label="Chamadas">
      <div className="detail-section__row">
        <h3 className="detail-section__title">Chamadas{calls.items.length > 0 ? ` · ${calls.items.length}` : ''}</h3>
        {calls.rejectedText && <span className="detail-section__alert"><Icon name="rejected" />{calls.rejectedText}</span>}
      </div>
      {calls.emptyText && <p className="detail-section__empty">{calls.emptyText}</p>}
      <div className="call-list">
        {calls.items.map((call) => (
          <div key={call.number} className={`call${call.rejected ? ' call--rejected' : ''}`}>
            <div className="call__line">
              <span className="call__number">{call.number}</span>
              <span className="meter meter--thick">
                <span className={`meter__fill${call.outlier ? ' meter__fill--outlier' : ''}${call.rejected ? ' meter__fill--rejected' : ''}`} style={{ width: `${call.widthPct}%` }} />
                <span className="meter__median" style={{ left: `${calls.medianPct}%` }} aria-hidden="true" />
              </span>
              <span className="call__tokens">{call.tokensText}</span>
            </div>
            <div className="call__meta">
              <span>{call.shareText}</span>
              {call.outlierText && <span className="call__outlier"><Icon name="outlier" />{call.outlierText}</span>}
              {call.rejected && <span className="call__rejected">REPROVADO</span>}
            </div>
            {call.reason && <p className="call__reason" lang="en">{call.reason}</p>}
          </div>
        ))}
      </div>
      {calls.medianText && <span className="call-footnote">mediana {calls.medianText} · “fora da curva” = mais de 2× a mediana</span>}
    </section>
  );
}
