// Generated and reviewed from sourcePlaceNames.json by
// scripts/generateGeographicNameAssets.ts. Keep each family internally
// consistent: a world assigns one family (and one dialect) per continent.
export interface PhoneticNameFamily {
  id: string;
  starts: readonly string[];
  cores: readonly string[];
  endings: readonly string[];
}

export const PHONETIC_NAME_FAMILIES: readonly PhoneticNameFamily[] = [
  {
    id: 'ardic',
    starts: ['al', 'ar', 'bal', 'cor', 'dar', 'el', 'fal', 'gar'],
    cores: ['a', 'e', 'ia', 'io', 'or', 'ra', 'ri', 'va'],
    endings: ['a', 'an', 'ar', 'en', 'ia', 'is', 'or', 'um'],
  },
  {
    id: 'boreal',
    starts: ['br', 'dr', 'fjor', 'hal', 'jor', 'kal', 'nor', 'sk'],
    cores: ['a', 'ei', 'en', 'i', 'ol', 'or', 'u', 'yr'],
    endings: ['a', 'en', 'ik', 'in', 'mark', 'or', 'und', 'vik'],
  },
  {
    id: 'calic',
    starts: ['ca', 'ce', 'dal', 'la', 'ma', 'pa', 'sa', 'va'],
    cores: ['ba', 'di', 'la', 'mi', 'na', 'ra', 'si', 'ta'],
    endings: ['a', 'ia', 'io', 'on', 'ora', 'os', 'u', 'ya'],
  },
  {
    id: 'doran',
    starts: ['abo', 'ado', 'beko', 'doro', 'kano', 'mako', 'sene', 'zama'],
    cores: ['ba', 'da', 'go', 'ka', 'lo', 'ma', 'na', 'ra'],
    endings: ['a', 'i', 'ia', 'o', 'on', 'u', 'um', 'ya'],
  },
  {
    id: 'eirenic',
    starts: ['al', 'el', 'ir', 'lyr', 'myr', 'nyr', 'sel', 'syr'],
    cores: ['a', 'e', 'i', 'o', 'la', 'li', 'ra', 'ri'],
    endings: ['a', 'en', 'ia', 'ion', 'is', 'os', 'um', 'ya'],
  },
  {
    id: 'galdic',
    starts: ['bryn', 'caer', 'don', 'gal', 'kil', 'mor', 'pen', 'tre'],
    cores: ['a', 'an', 'en', 'i', 'or', 'ra', 'ro', 'yn'],
    endings: ['a', 'ach', 'an', 'en', 'eth', 'or', 'wyn', 'yn'],
  },
  {
    id: 'harani',
    starts: ['bha', 'dha', 'ka', 'ma', 'na', 'ra', 'sha', 'va'],
    cores: ['a', 'ani', 'ari', 'i', 'ira', 'u', 'una', 'ya'],
    endings: ['a', 'an', 'ara', 'i', 'ia', 'in', 'pur', 'ya'],
  },
  {
    id: 'islandic',
    starts: ['a', 'fai', 'ha', 'kai', 'lo', 'mo', 'ta', 'vai'],
    cores: ['a', 'e', 'i', 'oa', 'ra', 'ri', 'u', 'ua'],
    endings: ['a', 'i', 'iki', 'oa', 'ora', 'u', 'ua', 'wai'],
  },
  {
    id: 'jandic',
    starts: ['ba', 'cha', 'gan', 'ja', 'ka', 'sha', 'ta', 'za'],
    cores: ['a', 'ai', 'an', 'i', 'ir', 'o', 'ur', 'ya'],
    endings: ['a', 'ad', 'an', 'ar', 'ia', 'ir', 'stan', 'ya'],
  },
  {
    id: 'keshic',
    starts: ['be', 'che', 'he', 'ke', 'me', 'se', 'te', 'ye'],
    cores: ['a', 'eo', 'i', 'in', 'o', 'on', 'u', 'un'],
    endings: ['a', 'an', 'eo', 'i', 'in', 'on', 'u', 'un'],
  },
  {
    id: 'lusan',
    starts: ['bra', 'co', 'es', 'lu', 'mo', 'po', 'rio', 'sa'],
    cores: ['a', 'e', 'ei', 'i', 'o', 'ra', 'ri', 'u'],
    endings: ['a', 'al', 'ia', 'o', 'ora', 'os', 'u', 'ues'],
  },
  {
    id: 'meridian',
    starts: ['an', 'chi', 'ecu', 'gua', 'hon', 'nic', 'par', 'uru'],
    cores: ['a', 'aya', 'e', 'i', 'o', 'ra', 'ri', 'u'],
    endings: ['a', 'ay', 'ia', 'o', 'ora', 'os', 'u', 'ya'],
  },
  {
    id: 'nembic',
    starts: ['a', 'be', 'ga', 'ke', 'li', 'na', 'se', 'zi'],
    cores: ['ba', 'di', 'ka', 'la', 'ma', 'na', 'ra', 'zi'],
    endings: ['a', 'e', 'ia', 'i', 'o', 'on', 'u', 'we'],
  },
  {
    id: 'oronic',
    starts: ['ak', 'bor', 'kar', 'mon', 'or', 'sar', 'tor', 'ul'],
    cores: ['a', 'e', 'i', 'ol', 'on', 'or', 'u', 'ur'],
    endings: ['a', 'ak', 'an', 'en', 'ia', 'on', 'or', 'us'],
  },
  {
    id: 'saharic',
    starts: ['al', 'bah', 'dar', 'kha', 'mar', 'qas', 'sar', 'zah'],
    cores: ['a', 'ai', 'ar', 'i', 'ir', 'u', 'un', 'ya'],
    endings: ['a', 'ah', 'an', 'ar', 'ia', 'im', 'ir', 'un'],
  },
  {
    id: 'velic',
    starts: ['be', 'dra', 'ko', 'mi', 'slo', 've', 'za', 'zve'],
    cores: ['a', 'e', 'i', 'in', 'o', 'ov', 'u', 'ya'],
    endings: ['a', 'ek', 'ia', 'in', 'ov', 'ska', 'ya', 'yn'],
  },
] as const;
