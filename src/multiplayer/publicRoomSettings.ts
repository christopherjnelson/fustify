export type StablePublicRoomSettings = {
  name: string;
  seed: string;
  playerCapacity: number;
  territoryCount: number;
  continentCount: number;
  assignmentMode: string;
};

export type StablePublicRoomSettingField = {
  key:
    | 'name'
    | 'seed'
    | 'playerCapacity'
    | 'territoryCount'
    | 'continentCount'
    | 'assignmentMode';
  label: string;
  value: string;
};

export function assignmentModeLabel(value: string): string {
  return value === 'random' ? 'Random' : 'Player draft';
}

export function stablePublicRoomSettingFields(
  settings: StablePublicRoomSettings,
): StablePublicRoomSettingField[] {
  return [
    { key: 'name', label: 'Room name', value: settings.name },
    { key: 'seed', label: 'Seed', value: settings.seed },
    {
      key: 'playerCapacity',
      label: 'Player capacity',
      value: `${settings.playerCapacity} players`,
    },
    {
      key: 'territoryCount',
      label: 'Territories',
      value: String(settings.territoryCount),
    },
    {
      key: 'continentCount',
      label: 'Continents',
      value: String(settings.continentCount),
    },
    {
      key: 'assignmentMode',
      label: 'Assignment',
      value: assignmentModeLabel(settings.assignmentMode),
    },
  ];
}
