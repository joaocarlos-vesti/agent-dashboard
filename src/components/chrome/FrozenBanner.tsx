import type { FrozenBanner as FrozenBannerModel } from '../../lib/header-model';
import { Icon } from '../Icon';

interface FrozenBannerProps {
  banner: FrozenBannerModel;
  onBackToLive: () => void;
}

export function FrozenBanner({ banner, onBackToLive }: FrozenBannerProps) {
  return (
    <div className="frozen-banner">
      <Icon name="ended" />
      <span>{banner.text}</span>
      <span className="app-header__spacer" />
      <button type="button" className="frozen-banner__action" onClick={onBackToLive}>{banner.action}</button>
    </div>
  );
}
