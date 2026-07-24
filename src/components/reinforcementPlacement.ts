export function submitReinforcementPlacement(
  selectedTerritoryId: string | null,
  amount: number,
  onPlace: (territoryId: string, amount: number) => void,
) {
  if (selectedTerritoryId) onPlace(selectedTerritoryId, amount);
}
