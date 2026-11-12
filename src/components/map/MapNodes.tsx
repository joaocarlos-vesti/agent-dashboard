import { useEffect, useRef, type ReactNode } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { CardModel } from '../../lib/card-model';
import { Icon } from '../Icon';
import { MapCard } from './MapCard';

type HeightReporter = { onHeight: (id: string, height: number) => void };
export type CardNodeData = HeightReporter & { card: CardModel; selected: boolean; onActivate: (card: CardModel) => void; onToggle: (card: CardModel) => void };
export type GroupNodeData = HeightReporter & { label: string; open: boolean; onToggle: () => void };
export type MoreNodeData = HeightReporter & { label: string; onShow: () => void };
export type CardNode = Node<CardNodeData, 'card'>;
export type GroupNode = Node<GroupNodeData, 'group'>;
export type MoreNode = Node<MoreNodeData, 'more'>;

// O layout precisa da altura real de cada card (a altura segue o conteúdo); quem mede é o próprio conteúdo, não o contêiner do nó.
function MeasuredContent({ id, onHeight, children }: { id: string; onHeight: HeightReporter['onHeight']; children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const report = () => onHeight(id, content.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(content);
    return () => observer.disconnect();
  }, [id, onHeight]);
  return (
    <div ref={contentRef} className="map-node">
      <Handle type="target" position={Position.Left} className="map-handle" isConnectable={false} />
      {children}
      <Handle type="source" position={Position.Right} className="map-handle" isConnectable={false} />
    </div>
  );
}

export function CardNodeView({ id, data }: NodeProps<CardNode>) {
  return <MeasuredContent id={id} onHeight={data.onHeight}><MapCard card={data.card} selected={data.selected} onActivate={data.onActivate} onToggle={data.onToggle} /></MeasuredContent>;
}

export function GroupNodeView({ id, data }: NodeProps<GroupNode>) {
  return (
    <MeasuredContent id={id} onHeight={data.onHeight}>
      <button type="button" className="map-group" aria-expanded={data.open} onClick={data.onToggle}>
        <Icon name={data.open ? 'chevronDown' : 'chevronRight'} />{data.label}
      </button>
    </MeasuredContent>
  );
}

export function MoreNodeView({ id, data }: NodeProps<MoreNode>) {
  return (
    <MeasuredContent id={id} onHeight={data.onHeight}>
      <button type="button" className="map-more" onClick={data.onShow}>
        <Icon name="done" />{data.label}
      </button>
    </MeasuredContent>
  );
}
