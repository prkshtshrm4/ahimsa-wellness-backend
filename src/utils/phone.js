/** Normalize to E.164 India (+91XXXXXXXXXX). */
export function normalizePhone(input) {
  if (!input) return '';
  const digits = String(input).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (String(input).startsWith('+')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}
