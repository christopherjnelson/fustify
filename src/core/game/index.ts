export { createMatch } from './createMatch';
export { gameReducer } from './gameReducer';
export {
  getAttackSources,
  getAttackTargets,
  getFortifyTargets,
  getOwnedConnectedComponent,
  getValidAttackDice,
} from './legalActions';
export {
  calculateReinforcements,
  getFullyOwnedContinents,
  getOwnedTerritories,
  getReinforcementTargets,
} from './reinforcement';
export {
  checkPlayerEliminated,
  checkVictory,
  getNextActivePlayer,
} from './victory';
export type * from './types';
