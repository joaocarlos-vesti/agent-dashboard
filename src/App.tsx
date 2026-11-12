import { useState } from 'react';
import { AttentionStrip } from './components/chrome/AttentionStrip';
import { FrozenBanner } from './components/chrome/FrozenBanner';
import { Header } from './components/chrome/Header';
import { ScreenMessage } from './components/chrome/ScreenMessage';
import { DetailPanel } from './components/detail/DetailPanel';
import { Gauge } from './components/gauge/Gauge';
import { MapView } from './components/map/MapView';
import { ConnectPanel } from './ConnectPanel';
import { useDashboardView } from './hooks/useDashboardView';

const OFFLINE_TEXT = 'Sem conexão com o servidor. Os dados podem estar desatualizados.';

export function App() {
  const view = useDashboardView();
  const { dashboard, ui, header, strip, gauge, detail, screen, scene, actions } = view;
  const [isConnecting, setIsConnecting] = useState(false);
  const showConnect = isConnecting && dashboard.userName;

  return (
    <div className="app">
      {dashboard.access === 'member' && !dashboard.isLive && <div className="offline-banner" role="alert">{OFFLINE_TEXT}</div>}
      <Header
        model={header}
        access={dashboard.access}
        userName={dashboard.userName}
        isLive={dashboard.isLive}
        onGoToWaiting={actions.goToWaiting}
        onSelectDay={actions.selectDay}
        onConnect={() => setIsConnecting(true)}
        onSignIn={dashboard.signIn}
        onSignOut={dashboard.signOut}
      />
      {showConnect ? <div className="app__scroll"><ConnectPanel onBack={() => setIsConnecting(false)} /></div> : (
        <>
          {header.frozen && <FrozenBanner banner={header.frozen} onBackToLive={actions.backToLive} />}
          {screen.kind === 'ready' && <AttentionStrip strip={strip} onSelectChip={actions.selectChip} />}
          <div className="app__main">
            {screen.kind === 'ready' ? (
              <>
                <MapView
                  scene={scene}
                  orientation={view.layoutMode.orientation}
                  selectedId={ui.selectedId}
                  focusNonce={ui.focusNonce}
                  frozen={view.pastDay}
                  onActivateCard={actions.activateCard}
                  onToggleCard={actions.toggleCard}
                  onToggleGroup={actions.toggleGroup}
                  onShowAllAgents={actions.showAllAgents}
                  onCollapseAll={actions.collapseAll}
                />
                <Gauge model={gauge} openPanel={ui.gauge} onTogglePanel={actions.toggleGauge} onSelectDay={actions.selectDay} />
                {view.isPanelShown && <DetailPanel model={detail} mode={view.layoutMode.panel} onClose={actions.closeDetail} onToggleTask={actions.toggleTask} onSelectChild={actions.selectWithReveal} />}
              </>
            ) : <ScreenMessage state={screen} onRetry={dashboard.retry} onSignIn={dashboard.signIn} />}
          </div>
        </>
      )}
    </div>
  );
}
