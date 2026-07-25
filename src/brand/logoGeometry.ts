export const FUSTIFY_MARK_VIEW_BOX = '0 0 128 128';
export const FUSTIFY_LOGO_VIEW_BOX = '0 0 440 128';

export const FUSTIFY_MARK_GEOMETRY = {
  westLongitude: 'M48 16C28 38 26 82 51 112',
  eastLongitude: 'M79 16C99 40 101 83 76 112',
  northLatitude: 'M17 57C39 40 88 38 112 52',
  southLatitude: 'M16 82C41 65 91 64 114 77',
  orbitLead: 'M24 31C45 8 84 5 108 24',
  orbitFollow: 'M115 34C128 58 122 91 100 111',
  letterF: 'M43 34L101 25L91 44L62 49L58 62L85 58L77 75L54 79L46 103L24 110Z',
} as const;

export const FUSTIFY_FAVICON_GEOMETRY = {
  orbitLead: 'M22 31C43 9 83 5 108 24',
  orbitFollow: 'M115 34C128 59 122 92 99 112',
  letterF: FUSTIFY_MARK_GEOMETRY.letterF,
} as const;
