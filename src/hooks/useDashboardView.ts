import { useCallback, useEffect, useMemo } from 'react';
import { BROWSER_TIME_ZONE } from '../config';
import { attentionItems } from '../lib/attention';
import { allSessionsOf, buildBoard } from '../lib/board';
import { effectiveNow } from '../lib/day';
import { detailModel } from '../lib/detail-model';
import { gaugeModel } from '../lib/gauge-model';
import { headerModel } from '../lib/header-model';
import { tabIndicator } from '../lib/format';
import type { CardModel } from '../lib/card-model';
import { buildMapScene } from '../lib/map-scene';
import { buildMapTree, nodesWithChildren, revealPathOf } from '../lib/map-tree';
import { screenState } from '../lib/screen-state';
import { stripModel, type StripChip } from '../lib/strip-model';
import type { CollapsibleGroup } from '../lib/ui-state';
import { useDashboard } from '../useDashboard';
import { useTodayKey } from './useTodayKey';
import { useUiState } from './useUiState';
import { useViewportMode } from './useViewportMode';
import { useWeekTokens } from './useWeekTokens';

/** Junta os dados do banco, o estado da tela e os modelos puros; devolve o que a tela desenha e as ações dos cliques. */
export function useDashboardView() {
  const todayKey = useTodayKey();
  const [ui, dispatch] = useUiState(todayKey);
  const dashboard = useDashboard(ui.day);
  const { now, isLive, lastUpdateAt, todayEvents, events } = dashboard;
  const layoutMode = useViewportMode();
  const pastDay = !ui.live;
  const connection = useMemo(() => ({ timeZone: BROWSER_TIME_ZONE, connected: isLive, lastUpdateAt: lastUpdateAt ?? undefined }), [isLive, lastUpdateAt]);
  const shownNow = effectiveNow({ now, day: ui.day, timeZone: BROWSER_TIME_ZONE, connected: isLive, lastUpdateAt: lastUpdateAt ?? undefined });

  const todayBoard = useMemo(() => buildBoard(todayEvents, now, { ...connection, day: ui.today }), [todayEvents, now, connection, ui.today]);
  const board = useMemo(() => (pastDay ? buildBoard(events, shownNow, { ...connection, day: ui.day }) : todayBoard), [pastDay, events, shownNow, connection, ui.day, todayBoard]);
  const scene = useMemo(() => buildMapScene({ board, ui, now: shownNow, timeZone: BROWSER_TIME_ZONE, pastDay }), [board, ui, shownNow, pastDay]);

  useEffect(() => {
    document.title = tabIndicator(todayBoard.flatMap((person) => person.sessions)).title;
  }, [todayBoard]);

  const todayTree = useMemo(() => buildMapTree(todayBoard, { pastDay: false }), [todayBoard]);
  const todayWaiting = useMemo(() => attentionItems(todayBoard, now).filter((item) => item.kind === 'waiting'), [todayBoard, now]);
  const header = headerModel({ now, lastUpdateAt, timeZone: BROWSER_TIME_ZONE, viewedDay: ui.day, pastDay, todayWaiting, todayTree });
  const strip = useMemo(() => stripModel({ items: attentionItems(board, shownNow), tree: scene.tree, now: shownNow, timeZone: BROWSER_TIME_ZONE, pastDay }), [board, scene.tree, shownNow, pastDay]);

  const week = useWeekTokens({ isOpen: ui.gauge === 'tokens', timeZone: BROWSER_TIME_ZONE });
  const gauge = gaugeModel({ sessions: allSessionsOf(board), now: shownNow, pastDay, viewedDay: ui.day, timeZone: BROWSER_TIME_ZONE, week });

  const selectedNode = ui.selectedId ? scene.tree.nodes[ui.selectedId] : undefined;
  const detail = selectedNode ? detailModel(selectedNode, { now: shownNow, timeZone: BROWSER_TIME_ZONE, events, tree: scene.tree, pastDay, taskExpanded: ui.taskExpanded }) : null;
  const screen = screenState({ access: dashboard.access, isLoadingDay: dashboard.isLoadingDay, historyError: dashboard.historyError, hasSessions: scene.hasSessions, pastDay });
  const isPanelShown = layoutMode.panel === 'fixed' || ui.panelOpen;

  const activateCard = useCallback((card: CardModel) => dispatch({ type: 'select', id: card.id }), [dispatch]);
  const toggleCard = useCallback((card: CardModel) => dispatch({ type: 'setNodeOpen', id: card.id, open: !card.open }), [dispatch]);
  const selectWithReveal = useCallback((id: string) => dispatch({ type: 'select', id, reveal: revealPathOf(scene.tree, id) ?? undefined, focus: true }), [dispatch, scene.tree]);
  const selectChip = useCallback((chip: StripChip) => dispatch({ type: 'select', id: chip.nodeId, reveal: chip.reveal ?? undefined, focus: true }), [dispatch]);

  const actions = {
    activateCard,
    toggleCard,
    selectWithReveal,
    selectChip,
    toggleGroup: (group: CollapsibleGroup) => dispatch({ type: 'toggleGroup', group }),
    showAllAgents: (workflowId: string) => dispatch({ type: 'expand', workflowId }),
    collapseAll: () => dispatch({ type: 'collapseAll', ids: nodesWithChildren(scene.tree) }),
    selectDay: (day: string) => dispatch({ type: 'selectDay', day }),
    backToLive: () => dispatch({ type: 'backToLive' }),
    goToWaiting: () => header.waiting && dispatch({ type: 'goToWaiting', sessionId: header.waiting.sessionId, reveal: header.waiting.reveal ?? undefined }),
    closeDetail: () => dispatch({ type: 'close' }),
    toggleGauge: (panel: 'tokens' | 'help') => dispatch({ type: 'openGauge', panel }),
    toggleTask: () => dispatch({ type: 'toggleTask' }),
  };

  return { dashboard, ui, pastDay, layoutMode, scene, header, strip, gauge, detail, screen, isPanelShown, actions };
}
