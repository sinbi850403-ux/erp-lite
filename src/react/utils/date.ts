const YYYY_MM_DD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidYyyyMmDdParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

export function toLocalDateKey(value: Date = new Date()) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidYyyyMmDd(value: unknown) {
  const text = String(value || '').trim();
  const match = YYYY_MM_DD_PATTERN.exec(text);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isValidYyyyMmDdParts(year, month, day);
}

export function normalizeYyyyMmDd(value: unknown) {
  if (value instanceof Date) {
    return toLocalDateKey(value);
  }

  const text = String(value || '').trim();
  if (!text) return '';

  if (isValidYyyyMmDd(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return toLocalDateKey(parsed);
}

export function toLocalDateTimestamp(value: unknown) {
  const normalized = normalizeYyyyMmDd(value);
  if (normalized) {
    const parsed = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  const fallback = new Date(String(value || ''));
  return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime();
}

export function formatLocalDateLabel(value: unknown) {
  return normalizeYyyyMmDd(value) || '-';
}

export function isSameLocalDate(value: unknown, baseDate: Date = new Date()) {
  const normalized = normalizeYyyyMmDd(value);
  if (!normalized) return false;
  return normalized === toLocalDateKey(baseDate);
}
