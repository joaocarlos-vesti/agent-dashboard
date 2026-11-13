import type { PermissionBlock } from '../../lib/detail-model';

export function PermissionSection({ permission }: { permission: PermissionBlock }) {
  const place = [permission.folder, permission.branch].filter(Boolean).join(' · ');
  return (
    <section className="detail-callout detail-callout--waiting">
      <span className="detail-callout__title">Pediu permissão <span className="detail-callout__since">· {permission.since}</span></span>
      <span className="detail-callout__text">{permission.instruction}</span>
      {place && <span className="detail-mono">{place}</span>}
    </section>
  );
}
