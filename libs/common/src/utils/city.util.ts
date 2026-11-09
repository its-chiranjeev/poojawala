/**
 * Verified cluster definitions for cities with alternative official or historical names.
 * Each entry is an array where the first element is the designated canonical representation.
 *
 * NOTE: Geographically distinct administrative regions (e.g. Mumbai City vs Mumbai Suburban,
 * Delhi vs New Delhi, Kanpur Nagar vs Kanpur Dehat, Bangalore Urban vs Bangalore Rural)
 * must remain separated and are NOT merged.
 */
export const ALIAS_GROUPS: string[][] = [
  // Bengaluru / Bangalore (Urban operational equivalent)
  ['bengaluru', 'bangalore', 'bangalore urban', 'bengaluru urban'],

  // Bangalore Rural (distinct administrative district)
  ['bangalore rural', 'bengaluru rural'],

  // Gurugram / Gurgaon
  ['gurugram', 'gurgaon'],

  // Kanpur / Kanpur Nagar (Kanpur Dehat is distinct and excluded)
  ['kanpur', 'kanpur nagar'],

  // Mumbai / Bombay (Mumbai City & Mumbai Suburban remain distinct)
  ['mumbai', 'bombay'],

  // Kolkata / Calcutta
  ['kolkata', 'calcutta'],

  // Chennai / Madras
  ['chennai', 'madras'],

  // Prayagraj / Allahabad
  ['prayagraj', 'allahabad'],

  // Varanasi / Kashi / Banaras
  ['varanasi', 'kashi', 'banaras'],

  // Pune / Poona
  ['pune', 'poona'],

  // Vadodara / Baroda
  ['vadodara', 'baroda'],

  // Mysuru / Mysore
  ['mysuru', 'mysore'],

  // Mangaluru / Mangalore
  ['mangaluru', 'mangalore'],

  // Belagavi / Belgaum
  ['belagavi', 'belgaum'],

  // Hubballi / Hubli
  ['hubballi', 'hubli'],

  // Puducherry / Pondicherry
  ['puducherry', 'pondicherry'],

  // Panaji / Panjim
  ['panaji', 'panjim'],

  // Thiruvananthapuram / Trivandrum
  ['thiruvananthapuram', 'trivandrum'],

  // Kochi / Cochin
  ['kochi', 'cochin'],

  // Kozhikode / Calicut
  ['kozhikode', 'calicut'],

  // Visakhapatnam / Vizag
  ['visakhapatnam', 'vizag'],
];

const CITY_TO_CANONICAL = new Map<string, string>();
const CANONICAL_TO_EQUIVALENTS = new Map<string, string[]>();

for (const group of ALIAS_GROUPS) {
  const canonical = group[0];
  const uniqueGroup = Array.from(new Set(group));
  CANONICAL_TO_EQUIVALENTS.set(canonical, uniqueGroup);
  for (const variant of group) {
    CITY_TO_CANONICAL.set(variant, canonical);
  }
}

/**
 * Basic city normalization:
 * - Trims leading/trailing whitespace
 * - Converts to lowercase
 * - Normalizes consecutive whitespace into a single space
 * - Preserves all words (no suffix/prefix stripping)
 */
export function normalizeCityName(cityName?: string | null): string {
  if (!cityName) return '';
  return cityName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Resolves a city name to its canonical form via verified explicit alias lookup.
 * Unmapped cities return their normalized value.
 */
export function resolveCanonicalCity(cityName?: string | null): string {
  const normalized = normalizeCityName(cityName);
  if (!normalized) return '';
  return CITY_TO_CANONICAL.get(normalized) || normalized;
}

/**
 * Returns all verified equivalent city variants for a given city (bidirectional).
 * Used for exact SQL IN (:...matchingCities) expansion.
 */
export function getEquivalentCities(cityName?: string | null): string[] {
  const normalized = normalizeCityName(cityName);
  if (!normalized) return [];
  const canonical = CITY_TO_CANONICAL.get(normalized) || normalized;
  const equivalents = CANONICAL_TO_EQUIVALENTS.get(canonical);
  if (equivalents) {
    return [...equivalents];
  }
  return [canonical];
}

/**
 * Deterministic canonical city comparison:
 * 1. Resolves both cities to canonical representation via explicit alias map
 * 2. Compares via exact string equality
 * 3. Never uses token overlap, stem prefixing, or substring matching
 * 4. Missing or empty values never match
 */
export function isCityMatch(
  cityA?: string | null,
  cityB?: string | null,
): boolean {
  const canonA = resolveCanonicalCity(cityA);
  const canonB = resolveCanonicalCity(cityB);
  if (!canonA || !canonB) return false;
  return canonA === canonB;
}
