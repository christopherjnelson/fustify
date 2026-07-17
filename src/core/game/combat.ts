export interface DiceRng {
  integer(min: number, max: number): number;
}

export interface CombatResult {
  attackerRolls: number[];
  defenderRolls: number[];
  attackerLosses: number;
  defenderLosses: number;
}

export function resolveCombat(
  attackDice: number,
  defenderArmies: number,
  rng: DiceRng,
): CombatResult {
  const defenderDice = Math.min(2, defenderArmies);
  const attackerRolls = Array.from({ length: attackDice }, () =>
    rng.integer(1, 6),
  ).sort((a, b) => b - a);
  const defenderRolls = Array.from({ length: defenderDice }, () =>
    rng.integer(1, 6),
  ).sort((a, b) => b - a);
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (
    let index = 0;
    index < Math.min(attackerRolls.length, defenderRolls.length);
    index += 1
  ) {
    if (attackerRolls[index]! > defenderRolls[index]!) defenderLosses += 1;
    else attackerLosses += 1;
  }
  return { attackerRolls, defenderRolls, attackerLosses, defenderLosses };
}
