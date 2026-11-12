import type { TokensBlock } from '../../lib/detail-model';

export function TokensSection({ tokens }: { tokens: TokensBlock }) {
  return (
    <section className="detail-section" aria-label="Tokens">
      <h3 className="detail-section__title">Tokens · entrada + saída</h3>
      <span className="tokens-figure">
        {tokens.primaryText && <span className="tokens-figure__value">{tokens.primaryText}</span>}
        {tokens.unknownText && <span className="tokens-figure__sub">{tokens.unknownText}</span>}
        {tokens.shareText && <span className="tokens-figure__sub">{tokens.shareText}</span>}
      </span>
      {tokens.sharePct !== null && <span className="meter" aria-hidden="true"><span className="meter__fill meter__fill--soft" style={{ width: `${tokens.sharePct}%` }} /></span>}
      {tokens.exactText && <span className="detail-section__aside">{tokens.exactText}</span>}
      {tokens.daySplit && <span className="detail-section__aside">{tokens.daySplit}</span>}
      {tokens.cache && (
        <details className="tokens-cache">
          <summary>Cache, à parte</summary>
          <span>{tokens.cache.creation}</span>
          <span>{tokens.cache.read}</span>
        </details>
      )}
    </section>
  );
}
