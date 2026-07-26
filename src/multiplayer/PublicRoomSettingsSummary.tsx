import {
  stablePublicRoomSettingFields,
  type StablePublicRoomSettings,
} from './publicRoomSettings';

export function PublicRoomSettingsSummary({
  settings,
  includeRoomName = true,
  className = '',
}: {
  settings: StablePublicRoomSettings;
  includeRoomName?: boolean;
  className?: string;
}) {
  const fields = stablePublicRoomSettingFields(settings).filter(
    (field) => includeRoomName || field.key !== 'name',
  );

  return (
    <dl className={`public-game-configuration ${className}`.trim()}>
      {fields.map((field) => (
        <div key={field.key} data-public-setting={field.key}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}
