import { Icon } from '../Icon';

export function LastReplySection({ reply }: { reply: string }) {
  return (
    <section className="detail-callout detail-callout--reply" aria-label="Última resposta">
      <span className="detail-callout__label"><Icon name="yourTurn" />Última resposta do Claude</span>
      <p className="detail-callout__reply">{reply}</p>
    </section>
  );
}
