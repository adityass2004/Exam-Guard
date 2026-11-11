import { Response } from 'express';

export interface CsvStreamOptions {
  filename: string;
  maxRows?: number;
  delimiter?: string;
}

/**
 * Escapes a cell value according to RFC-4180 and protects against CSV formula injection (DDE attacks).
 * If the value starts with '=', '+', '-', '@', '\t', or '\r', it prepends a single quote.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }

  let str = String(val);

  // CSV Formula Injection mitigation
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // RFC-4180 quote escaping
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Formats a single row of cells into an RFC-4180 CSV line.
 */
export function formatCsvRow(row: unknown[], delimiter = ','): string {
  return row.map(escapeCsvCell).join(delimiter) + '\r\n';
}

/**
 * Sets response headers for streaming CSV downloads.
 */
export function setCsvHeaders(res: Response, filename: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Transfer-Encoding', 'chunked');
}

