export function normalizeCityName(cityName?: string | null): string {
  if (!cityName) return '';
  return cityName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
