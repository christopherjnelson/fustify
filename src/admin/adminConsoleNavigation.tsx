export type AdminTab =
  | 'overview'
  | 'rooms'
  | 'accounts'
  | 'logs'
  | 'maintenance'
  | 'audit'
  | 'verification'
  | 'balance';

const tabs: Array<[AdminTab, string]> = [
  ['overview', 'Overview'],
  ['rooms', 'Rooms'],
  ['accounts', 'Accounts'],
  ['logs', 'Logs'],
  ['maintenance', 'Maintenance'],
  ['audit', 'Audit'],
  ['verification', 'Verification'],
  ['balance', 'Balance Studies'],
];

export function AdminConsoleNavigation({
  activeTab,
  onChange,
}: {
  activeTab: AdminTab;
  onChange: (tab: AdminTab) => void;
}) {
  return (
    <nav className="admin-tabs" aria-label="Administration sections">
      {tabs.map(([id, name]) => (
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === id}
          key={id}
          onClick={() => onChange(id)}
        >
          {name}
        </button>
      ))}
    </nav>
  );
}
