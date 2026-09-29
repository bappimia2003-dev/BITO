import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.cache',
]);

const IGNORED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.test',
  '.env.example',
  'pnpm-lock.yaml',
  'package-lock.json',
  'SPEC.md',
  'BITO_MASTER_PROMPT.pdf',
]);

// Patterns for detecting real secrets and keys
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    name: 'AWS Access Key',
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
  },
  { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/ },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/ },
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|secret[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_-]{32,}["']/i,
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
];

async function scanDirectory(dir: string, baseDir: string): Promise<string[]> {
  const violations: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      const subViolations = await scanDirectory(fullPath, baseDir);
      violations.push(...subViolations);
    } else if (entry.isFile()) {
      if (
        IGNORED_FILES.has(entry.name) ||
        entry.name.startsWith('.env') ||
        entry.name.endsWith('.pdf')
      ) {
        continue;
      }

      // Check file size (skip large binaries)
      const fileStat = await stat(fullPath);
      if (fileStat.size > 1024 * 1024) {
        continue;
      }

      try {
        const content = await readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          // Skip comment lines in docs or scripts defining patterns
          if (line.includes('SECRET_PATTERNS') || line.includes('pattern:')) {
            continue;
          }

          for (const { name, pattern } of SECRET_PATTERNS) {
            if (pattern.test(line)) {
              violations.push(`${relPath}:${i + 1} - Potential ${name} detected`);
            }
          }
        }
      } catch {
        // Ignore unreadable binary files
      }
    }
  }

  return violations;
}

async function main(): Promise<void> {
  const baseDir = process.cwd();
  process.stdout.write('Scanning repository for committed secrets...\n');
  const violations = await scanDirectory(baseDir, baseDir);

  if (violations.length > 0) {
    process.stderr.write(`Secret scan FAILED! Found ${violations.length} potential issue(s):\n`);
    for (const v of violations) {
      process.stderr.write(`  - ${v}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('Secret scan PASSED: No secrets found.\n');
}

main().catch((err) => {
  process.stderr.write(`Error during secret scan: ${err}\n`);
  process.exit(1);
});
