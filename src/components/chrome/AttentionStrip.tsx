import type { StripChip, StripModel } from '../../lib/strip-model';
import { Icon } from '../Icon';

interface AttentionStripProps {
  strip: StripModel;
  onSelectChip: (chip: StripChip) => void;
}

export function AttentionStrip({ strip, onSelectChip }: AttentionStripProps) {
  if (!strip.headline && strip.chips.length === 0) return null;
  return (
    <div className="attention-strip">
      {strip.chips.map((chip) => (
        <button key={chip.key} type="button" className={`attention-chip attention-chip--${chip.tone}`} onClick={() => onSelectChip(chip)}>
          <Icon name={chip.icon} />
          <span className="attention-chip__name">{chip.name}</span>
          <span className="attention-chip__fact">{chip.fact}</span>
        </button>
      ))}
      {strip.headline && <span className="attention-strip__clear"><Icon name="done" />{strip.headline}</span>}
    </div>
  );
}
