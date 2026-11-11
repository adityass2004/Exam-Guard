#!/usr/bin/env node
/**
 * ExamGuard Production Integrity & No-Mocks Verification Script
 *
 * Scans production source directories (apps/api/src, apps/web/src, services/vision/app)
 * for forbidden patterns: fake success, bypass flags, mock biometric scores, or unhandled placeholders.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PRODUCTION_DIRS = [
  path.join(ROOT_DIR, 'apps', 'api', 'src'),
  path.join(ROOT_DIR, 'apps', 'web', 'src'),
  path.join(ROOT_DIR, 'services', 'vision', 'app'),
];

// Patterns that must NOT appear in production logic
const FORBIDDEN_PATTERNS = [
  { pattern: /bypass[_-]?auth/i, description: 'Authentication bypass flag' },
  { pattern: /mock[_-]?verification/i, description: 'Mock verification shortcut' },
  { pattern: /fake[_-]?liveness/i, description: 'Fake liveness result' },
  { pattern: /always[_-]?true[_-]?verification/i, description: 'Always-true verification bypass' },
  { pattern: /lorem\s+ipsum/i, description: 'Lorem ipsum placeholder text' },
];

// Files or line patterns explicitly allowed (e.g. comments explaining limitations or tests)
const ALLOW_LIST_PATHS = [
  '.test.ts',
  '.spec.ts',
  'test_',
  '__tests__',
  'fixtures',
];

let violationCount = 0;

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '__pycache__') {
        continue;
      }
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      const isAllowed = ALLOW_LIST_PATHS.some((sub) => fullPath.includes(sub));
      if (isAllowed) continue;

      const ext = path.extname(entry.name);
      if (!['.ts', '.tsx', '.js', '.mjs', '.py'].includes(ext)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, lineIndex) => {
        for (const { pattern, description } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            console.error(
              `[INTEGRITY ERROR] ${description} detected at ${path.relative(ROOT_DIR, fullPath)}:${lineIndex + 1}`
            );
            console.error(`  > ${line.trim()}`);
            violationCount++;
          }
        }
      });
    }
  }
}

console.log('Running ExamGuard Production Integrity & No-Mocks Verification Scan...');

for (const dir of PRODUCTION_DIRS) {
  scanDirectory(dir);
}

if (violationCount > 0) {
  console.error(`\nFAILED: Found ${violationCount} integrity violation(s) in production source code.`);
  process.exit(1);
} else {
  console.log('SUCCESS: All production source code is clean of forbidden mock / bypass patterns.');
  process.exit(0);
}

