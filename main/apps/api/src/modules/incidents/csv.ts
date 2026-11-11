/**
 * Sanitizes a cell value for CSV export:
 * 1. Defends against CSV / Formula Injection by prefixing values starting with '=', '+', '-', or '@' with a single quote.
 * 2. Escapes double quotes per RFC-4180.
 * 3. Encloses fields in double quotes if they contain commas, newlines, or quotes.
 */
export function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // CSV Formula Injection mitigation
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Quote escaping per RFC-4180
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function formatCsvRow(cells: any[]): string {
  return cells.map(sanitizeCsvCell).join(',');
}
