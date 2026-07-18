export const CONTROL_BINDINGS = [
  { input: 'Drag', action: 'Rotate globe' },
  { input: 'Wheel / pinch', action: 'Zoom' },
  { input: 'Click / tap', action: 'Select territory' },
] as const;

export const TERRITORY_NAVIGATOR_SHORTCUT = {
  key: 'k',
  label: 'Ctrl/⌘ K',
  action: 'Territory list',
} as const;

export const CLOSE_DIALOG_SHORTCUT = {
  key: 'Escape',
  label: 'Esc',
  action: 'Close dialog',
} as const;
