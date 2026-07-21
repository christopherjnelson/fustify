import { PLAYER_PALETTE } from '../generation/constants';
import { BRAND } from '../../branding';

export type PlayerControllerType = 'local-human' | 'heuristic-bot';

export interface LocalPlayerConfig {
  id: string;
  name: string;
  colorId: string;
  seatIndex: number;
  controllerType: PlayerControllerType;
}

export interface PlayerColor {
  id: string;
  label: string;
  value: string;
}

const COLOR_NAMES = ['Crimson', 'Azure', 'Gold', 'Verdant', 'Violet', 'Rose'];

export const PLAYER_COLORS: readonly PlayerColor[] = PLAYER_PALETTE.map(
  (value, index) => ({
    id: `color-${index + 1}`,
    label: COLOR_NAMES[index]!,
    value,
  }),
);

const DEFAULT_NAMES = [
  'Crimson League',
  'Azure Pact',
  'Golden Union',
  'Verdant Order',
  'Violet Assembly',
  'Rose Coalition',
];

export function createDefaultPlayerConfigs(
  playerCount: number,
): LocalPlayerConfig[] {
  return Array.from({ length: playerCount }, (_, seatIndex) => ({
    id: `player-${String(seatIndex + 1).padStart(2, '0')}`,
    name: DEFAULT_NAMES[seatIndex] ?? `Player ${seatIndex + 1}`,
    colorId: PLAYER_COLORS[seatIndex]!.id,
    seatIndex,
    controllerType: 'local-human',
  }));
}

export function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function validatePlayerConfigs(players: LocalPlayerConfig[]): string[] {
  const errors: string[] = [];
  if (players.length < 2 || players.length > 6) {
    errors.push('Choose between 2 and 6 players.');
  }
  const names = players.map((player) =>
    normalizePlayerName(player.name).toLocaleLowerCase(),
  );
  if (names.some((name) => name.length === 0)) {
    errors.push('Every player needs a name.');
  }
  if (new Set(names).size !== names.length) {
    errors.push('Player names must be unique.');
  }
  const colors = players.map((player) => player.colorId);
  if (new Set(colors).size !== colors.length) {
    errors.push('Player colors must be unique.');
  }
  if (colors.some((id) => !PLAYER_COLORS.some((color) => color.id === id))) {
    errors.push(`Choose a color from the ${BRAND.productName} palette.`);
  }
  const seats = players.map((player) => player.seatIndex).sort((a, b) => a - b);
  if (seats.some((seat, index) => seat !== index)) {
    errors.push('Player seats must form a complete turn order.');
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    errors.push('Player IDs must be unique.');
  }
  if (
    players.some(
      (player) =>
        player.controllerType !== 'local-human' &&
        player.controllerType !== 'heuristic-bot',
    )
  ) {
    errors.push('Choose a supported controller for every player.');
  }
  return errors;
}

export function playerColorValue(colorId: string): string {
  return (
    PLAYER_COLORS.find((color) => color.id === colorId)?.value ?? '#ffffff'
  );
}
