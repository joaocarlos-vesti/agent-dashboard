import type { DayButton } from '../../lib/header-model';

interface DaySelectorProps {
  days: DayButton[];
  onSelectDay: (day: string) => void;
}

export function DaySelector({ days, onSelectDay }: DaySelectorProps) {
  return (
    <nav className="day-selector" aria-label="Dia">
      {days.map((dayButton) => (
        <button key={dayButton.day} type="button" className="day-selector__button" aria-pressed={dayButton.pressed} title={dayButton.title} aria-label={dayButton.title} onClick={() => onSelectDay(dayButton.day)}>
          {dayButton.label}
        </button>
      ))}
    </nav>
  );
}
