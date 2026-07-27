export interface HomePreviewLoadConditions {
  narrowViewport: boolean;
  saveData: boolean;
}

export function requiresManualHomePreviewLoad({
  narrowViewport,
  saveData,
}: HomePreviewLoadConditions): boolean {
  return narrowViewport || saveData;
}

export function browserRequiresManualHomePreviewLoad(): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean };
    }
  ).connection;
  return requiresManualHomePreviewLoad({
    narrowViewport: window.matchMedia('(max-width: 720px)').matches,
    saveData: connection?.saveData === true,
  });
}
