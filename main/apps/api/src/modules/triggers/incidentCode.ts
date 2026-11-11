import crypto from 'node:crypto';

const BASE32_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Crockford-style base32 (excludes 0, 1, I, O)

/**
 * Generates a human-readable, unique incident code in the format:
 * INC-YYYYMMDD-XXXXXX (e.g. INC-20261110-7K9MZ2)
 */
export function generateIncidentCode(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length];
  }

  return `INC-${dateStr}-${suffix}`;
}
