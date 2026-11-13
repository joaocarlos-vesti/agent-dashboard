export type GaugePanel = 'tokens' | 'help' | null;
export type CollapsibleGroup = 'endedToday' | 'openIdle';

/** O que precisa abrir para um item ficar visível no mapa: os pais, o grupo recolhido e os concluídos escondidos. */
export interface RevealPath {
  ancestorIds: string[];
  group: CollapsibleGroup | null;
  workflowId: string | null;
}

export interface UiState {
  today: string;
  day: string;
  live: boolean;
  selectedId: string | null;
  panelOpen: boolean;
  focusNonce: number;
  gauge: GaugePanel;
  helpSeen: boolean;
  openGroups: Record<CollapsibleGroup, boolean>;
  expandedWorkflows: string[];
  nodeOpen: Record<string, boolean>;
  taskExpanded: boolean;
}

export type UiAction =
  | { type: 'selectDay'; day: string }
  | { type: 'backToLive' }
  | { type: 'goToWaiting'; sessionId: string; reveal?: RevealPath }
  | { type: 'setToday'; today: string }
  | { type: 'select'; id: string; reveal?: RevealPath; focus?: boolean; openChildren?: boolean }
  | { type: 'close' }
  | { type: 'openGauge'; panel: 'tokens' | 'help' }
  | { type: 'closeGauge' }
  | { type: 'escape' }
  | { type: 'expand'; workflowId: string }
  | { type: 'toggleGroup'; group: CollapsibleGroup }
  | { type: 'setNodeOpen'; id: string; open: boolean }
  | { type: 'collapseAll'; ids: string[] }
  | { type: 'toggleTask' };

export function initialUiState({ today, helpSeen }: { today: string; helpSeen: boolean }): UiState {
  return {
    today, day: today, live: true, selectedId: null, panelOpen: false, focusNonce: 0,
    gauge: helpSeen ? null : 'help', helpSeen, openGroups: { endedToday: false, openIdle: false },
    expandedWorkflows: [], nodeOpen: {}, taskExpanded: false,
  };
}

const withoutSelection = { selectedId: null, panelOpen: false, taskExpanded: false } as const;

const addOnce = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

// Sair do painel de ajuda, por qualquer caminho, conta como "já viu".
const withGauge = (state: UiState, gauge: GaugePanel): UiState => ({
  ...state,
  gauge,
  helpSeen: state.helpSeen || (state.gauge === 'help' && gauge !== 'help'),
});

function reveal(state: UiState, path: RevealPath | undefined): UiState {
  if (!path) return state;
  const opened = Object.fromEntries(path.ancestorIds.map((id) => [id, true]));
  return {
    ...state,
    nodeOpen: { ...state.nodeOpen, ...opened },
    openGroups: path.group ? { ...state.openGroups, [path.group]: true } : state.openGroups,
    expandedWorkflows: path.workflowId ? addOnce(state.expandedWorkflows, path.workflowId) : state.expandedWorkflows,
  };
}

function select(state: UiState, id: string, path: RevealPath | undefined, focus: boolean, openChildren = false): UiState {
  const revealed = reveal(state, path);
  return {
    ...revealed,
    nodeOpen: openChildren ? { ...revealed.nodeOpen, [id]: true } : revealed.nodeOpen,
    selectedId: id,
    panelOpen: true,
    taskExpanded: state.selectedId === id ? state.taskExpanded : false,
    focusNonce: focus ? state.focusNonce + 1 : state.focusNonce,
  };
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'selectDay':
      return { ...state, ...withoutSelection, day: action.day, live: action.day === state.today };
    case 'backToLive':
      return { ...state, ...withoutSelection, day: state.today, live: true };
    case 'goToWaiting':
      return select({ ...state, day: state.today, live: true }, action.sessionId, action.reveal, true);
    case 'setToday': {
      const followsToday = state.live || state.day === action.today;
      return { ...state, today: action.today, day: followsToday ? action.today : state.day, live: followsToday };
    }
    case 'select':
      return select(state, action.id, action.reveal, action.focus ?? false, action.openChildren);
    case 'close':
      return { ...state, ...withoutSelection };
    case 'openGauge':
      return withGauge(state, state.gauge === action.panel ? null : action.panel);
    case 'closeGauge':
      return withGauge(state, null);
    case 'escape':
      return state.gauge ? withGauge(state, null) : { ...state, ...withoutSelection };
    case 'expand':
      return { ...state, expandedWorkflows: addOnce(state.expandedWorkflows, action.workflowId) };
    case 'toggleGroup':
      return { ...state, openGroups: { ...state.openGroups, [action.group]: !state.openGroups[action.group] } };
    case 'setNodeOpen':
      return { ...state, nodeOpen: { ...state.nodeOpen, [action.id]: action.open } };
    case 'collapseAll':
      return { ...state, nodeOpen: { ...state.nodeOpen, ...Object.fromEntries(action.ids.map((id) => [id, false])) } };
    case 'toggleTask':
      return { ...state, taskExpanded: !state.taskExpanded };
  }
}
