import { describe, expect, it } from 'vitest';
import { formatCsvRow, escapeCsvCell } from '../../src/lib/csv-stream.js';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('Security Hardening - Injection & Sanitization Tests', () => {
  describe('CSV Formula Injection Defense', () => {
    it('escapes cells beginning with DDE formula trigger characters (=, +, -, @, tab, cr)', () => {
      const maliciousCells = [
        '=cmd|"/C calc"!A0',
        '+cmd|"/C calc"!A0',
        '-cmd|"/C calc"!A0',
        '@SUM(1+1)',
        '\t=2+5',
        '\r=1+1',
      ];

      for (const cell of maliciousCells) {
        const sanitized = escapeCsvCell(cell);
        // Formula injection mitigation: cell must start with single quote, or be quoted with single quote immediately inside
        expect(sanitized).toMatch(/^"?'/);
      }
    });

    it('safely formats rows containing RFC-4180 quotes and comma delimiters', () => {
      const row = ['Standard Text', 'Text, with comma', 'Text with "quotes"', '=1+1'];
      const formatted = formatCsvRow(row);

      // Verify cell with comma is wrapped in double quotes
      expect(formatted).toContain('"Text, with comma"');
      // Verify cell with quotes has quotes doubled
      expect(formatted).toContain('"Text with ""quotes"""');
      // Verify formula is neutralised
      expect(formatted).toContain("'=1+1");
      expect(formatted.endsWith('\r\n')).toBe(true);
    });
  });

  describe('SQL Injection & XSS Payloads in API Requests', () => {
    it('rejects or neutralizes SQL injection strings in query parameters', async () => {
      const sqlInjectionQueries = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "1 UNION SELECT null, email, password_hash FROM users --",
      ];

      for (const query of sqlInjectionQueries) {
        const res = await request(app)
          .get(`/api/v1/auth/csrf?query=${encodeURIComponent(query)}`);
        // The server should handle gracefully (200, 400, or standard JSON), never 500 SQL crash
        expect(res.status).not.toBe(500);
      }
    });

    it('safely handles XSS strings in login attempts without reflecting unsanitized HTML', async () => {
      // 1. Get CSRF Token
      const csrfRes = await request(app).get('/api/v1/auth/csrf');
      const setCookie = csrfRes.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
      const csrfCookie = cookies.find((c) => c.startsWith('eg_csrf=')) || '';
      const csrfToken = csrfRes.body.data.csrfToken;

      const xssStrings = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        '"><svg/onload=alert(document.cookie)>',
      ];

      for (const xss of xssStrings) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('Cookie', [csrfCookie])
          .set('X-CSRF-Token', csrfToken)
          .set('Content-Type', 'application/json')
          .send({
            email: `test${xss}@example.com`,
            password: 'SomePassword123!',
          });

        // The response body should be standard JSON error envelope, not HTML
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.status).toBe(400); // Bad email format validation
      }
    });
  });
});
