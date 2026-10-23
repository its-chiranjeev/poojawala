/**
 * Pure slug generator function.
 *
 * Rules:
 * - Lowercase
 * - Trim leading/trailing whitespace
 * - Replace spaces, underscores, and consecutive hyphens with a single hyphen
 * - Strip out unsupported special characters safely
 * - Normalize Unicode accents/diacritics
 * - Avoid leading or trailing hyphens
 */
export function slugify(name: string | null | undefined): string {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return '';
  }

  const normalized = name
    .trim()
    .toLowerCase()
    // Normalize Unicode accented characters (e.g. é -> e)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove characters that are not alphanumeric, spaces, or hyphens
    .replace(/[^a-z0-9\s-]/g, '')
    // Replace whitespace, underscores, and multiple hyphens with a single hyphen
    .replace(/[\s_—–-]+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '');

  return normalized;
}

export interface SlugCheckRepository {
  findOne(options: any): Promise<any>;
}

/**
 * Generates a unique slug for a record within a given repository.
 * If the base slug already exists, deterministically appends `-2`, `-3`, etc.
 *
 * @param repo Repository or object providing a findOne method
 * @param name The source name to generate slug from
 * @param excludeId Optional ID of the record being updated so it doesn't collide with itself
 */
export async function generateUniqueSlug(
  repo: SlugCheckRepository,
  name: string,
  excludeId?: number | string,
): Promise<string> {
  const baseSlug = slugify(name) || 'item';
  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await repo.findOne({
      where: { slug: candidate },
      withDeleted: true,
    });

    if (!existing) {
      return candidate;
    }

    // If existing record is the current record being updated, its own slug is acceptable
    if (excludeId !== undefined && excludeId !== null && String(existing.id) === String(excludeId)) {
      return candidate;
    }

    counter++;
    candidate = `${baseSlug}-${counter}`;
  }
}
