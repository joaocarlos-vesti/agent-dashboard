import { NOTHING_SELECTED_TEXT, type DetailModel } from '../../lib/detail-model';
import type { PanelMode } from '../../lib/layout-mode';
import { Icon } from '../Icon';
import { ActivitySection } from './ActivitySection';
import { CallsSection } from './CallsSection';
import { ChildrenSection } from './ChildrenSection';
import { LastReplySection } from './LastReplySection';
import { PermissionSection } from './PermissionSection';
import { TaskSection } from './TaskSection';
import { TokensSection } from './TokensSection';

interface DetailPanelProps {
  model: DetailModel | null;
  mode: PanelMode;
  onClose: () => void;
  onToggleTask: () => void;
  onSelectChild: (id: string) => void;
}

function DetailHeader({ model, onClose }: { model: DetailModel; onClose: () => void }) {
  return (
    <div className="detail-header">
      <span className={`orb orb--${model.state} orb--large`}><Icon name={model.icon} /></span>
      <div className="detail-header__text">
        <span className="detail-header__path">{model.path}</span>
        <h2 className="detail-header__title" title={model.title}>{model.title}</h2>
        <span className="detail-header__state">
          <span className={`detail-header__state-word map-card__state--${model.state}`}><Icon name={model.stateIcon} />{model.stateLabel}</span>
          <span className="detail-header__state-detail">{model.stateDetail}</span>
          {model.probableSameAgent && <span className="detail-header__probable" title="Rótulo deduzido da tarefa; chamadas com o mesmo início foram somadas"><Icon name="probable" />provável mesmo agente</span>}
        </span>
      </div>
      <button type="button" className="icon-button" aria-label="Fechar detalhe" onClick={onClose}><Icon name="close" /></button>
    </div>
  );
}

/** Painel de detalhe na ordem das perguntas: o que pede de você, agora, resultado, custo e, por último, a tarefa. */
export function DetailPanel({ model, mode, onClose, onToggleTask, onSelectChild }: DetailPanelProps) {
  if (!model) {
    return <aside className={`detail-panel detail-panel--${mode}`} aria-label="Detalhe"><p className="detail-panel__empty">{NOTHING_SELECTED_TEXT}</p></aside>;
  }
  return (
    <aside className={`detail-panel detail-panel--${mode}`} aria-label="Detalhe">
      <DetailHeader model={model} onClose={onClose} />
      <div className="detail-body">
        {model.permission && <PermissionSection permission={model.permission} />}
        {model.lastReply && <LastReplySection reply={model.lastReply} />}
        {model.startMissingNotice && <section className="detail-callout detail-callout--note">{model.startMissingNotice}</section>}
        {model.activity && <ActivitySection activity={model.activity} lit={model.lit} />}
        {model.calls && <CallsSection calls={model.calls} />}
        {model.childrenTitle && model.children.length > 0 && <ChildrenSection title={model.childrenTitle} bars={model.children} onSelectChild={onSelectChild} />}
        <TokensSection tokens={model.tokens} />
        {model.task && <TaskSection task={model.task} onToggle={onToggleTask} />}
      </div>
    </aside>
  );
}
