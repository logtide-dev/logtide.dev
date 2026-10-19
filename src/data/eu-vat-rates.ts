// Standard VAT rates for the 27 EU member states, as of October 2026.
// Verify before changes; Stripe Tax computes the exact amount at checkout.

export interface EuCountry {
  name: string;
  /** Standard VAT rate in percent. */
  vat: number;
}

export const EU_COUNTRIES: Record<string, EuCountry> = {
  AT: { name: 'Austria', vat: 20 },
  BE: { name: 'Belgium', vat: 21 },
  BG: { name: 'Bulgaria', vat: 20 },
  HR: { name: 'Croatia', vat: 25 },
  CY: { name: 'Cyprus', vat: 19 },
  CZ: { name: 'Czechia', vat: 21 },
  DK: { name: 'Denmark', vat: 25 },
  EE: { name: 'Estonia', vat: 24 },
  FI: { name: 'Finland', vat: 25.5 },
  FR: { name: 'France', vat: 20 },
  DE: { name: 'Germany', vat: 19 },
  GR: { name: 'Greece', vat: 24 },
  HU: { name: 'Hungary', vat: 27 },
  IE: { name: 'Ireland', vat: 23 },
  IT: { name: 'Italy', vat: 22 },
  LV: { name: 'Latvia', vat: 21 },
  LT: { name: 'Lithuania', vat: 21 },
  LU: { name: 'Luxembourg', vat: 17 },
  MT: { name: 'Malta', vat: 18 },
  NL: { name: 'Netherlands', vat: 21 },
  PL: { name: 'Poland', vat: 23 },
  PT: { name: 'Portugal', vat: 23 },
  RO: { name: 'Romania', vat: 21 },
  SK: { name: 'Slovakia', vat: 23 },
  SI: { name: 'Slovenia', vat: 22 },
  ES: { name: 'Spain', vat: 21 },
  SE: { name: 'Sweden', vat: 25 },
};

/** IANA time zones of EU capitals and major cities mapped to a country code. */
export const TIMEZONE_COUNTRY: Record<string, string> = {
  'Europe/Vienna': 'AT',
  'Europe/Brussels': 'BE',
  'Europe/Sofia': 'BG',
  'Europe/Zagreb': 'HR',
  'Asia/Nicosia': 'CY',
  'Europe/Nicosia': 'CY',
  'Europe/Prague': 'CZ',
  'Europe/Copenhagen': 'DK',
  'Europe/Tallinn': 'EE',
  'Europe/Helsinki': 'FI',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Busingen': 'DE',
  'Europe/Athens': 'GR',
  'Europe/Budapest': 'HU',
  'Europe/Dublin': 'IE',
  'Europe/Rome': 'IT',
  'Europe/Riga': 'LV',
  'Europe/Vilnius': 'LT',
  'Europe/Luxembourg': 'LU',
  'Europe/Malta': 'MT',
  'Europe/Amsterdam': 'NL',
  'Europe/Warsaw': 'PL',
  'Europe/Lisbon': 'PT',
  'Atlantic/Madeira': 'PT',
  'Atlantic/Azores': 'PT',
  'Europe/Bucharest': 'RO',
  'Europe/Bratislava': 'SK',
  'Europe/Ljubljana': 'SI',
  'Europe/Madrid': 'ES',
  'Atlantic/Canary': 'ES',
  'Europe/Stockholm': 'SE',
};

/** Price including VAT, rounded to 2 decimals. */
export function priceWithVat(net: number, vatPercent: number): number {
  return Math.round(net * (100 + vatPercent)) / 100;
}
