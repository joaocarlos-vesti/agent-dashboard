import type { TaskBlock } from '../../lib/detail-model';

export function TaskSection({ task, onToggle }: { task: TaskBlock; onToggle: () => void }) {
  return (
    <section className="detail-section">
      <h3 className="detail-section__title">Tarefa</h3>
      <p className={`task-text${task.expanded ? '' : ' task-text--clamped'}`} lang="en">{task.text}</p>
      {task.canExpand && <button type="button" className="link-button" onClick={onToggle}>{task.expanded ? 'recolher' : 'ler a tarefa inteira'}</button>}
    </section>
  );
}
