/**
 * Generates docs/ROUTE_INVENTORY.md: every API route and dashboard page with the security
 * properties it visibly has. HEURISTIC static analysis (regex over source) — it narrows where
 * to look in R1; it does not prove anything. A "✓" means the pattern appears somewhere in the
 * file, not that it is applied correctly.
 *
 * Run: pnpm inventory
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const API_DIR = join(ROOT, 'src/app/api');
const PAGES_DIR = join(ROOT, 'src/app');

function walk(dir: string, accept: (file: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, accept, out);
    else if (accept(p)) out.push(p);
  }
  return out;
}

const has = (src: string, re: RegExp) => re.test(src);
const mark = (b: boolean) => (b ? '✓' : '·');

function toUrl(file: string, base: string): string {
  const rel = relative(base, file).split(sep).slice(0, -1).join('/');
  return '/' + rel.replace(/\((.*?)\)\/?/g, '');
}

const PUBLIC_API = [/^\/api\/health$/, /^\/api\/webhooks\//];

interface Row {
  url: string;
  file: string;
  methods: string;
  auth: boolean;
  guard: boolean;
  sessionClaims: boolean;
  role: boolean;
  school: boolean;
  guardian: boolean;
  validate: boolean;
  audit: boolean;
  rate: boolean;
  writes: number;
  flags: string[];
}

function analyse(file: string, url: string, isApi: boolean): Row {
  // Strip comments so words in comments (e.g. "sessionClaims") are not counted as usage.
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const methods = isApi
    ? [...src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
        .map((m) => m[1])
        .join(',')
    : has(src, /^["']use client["']/m)
      ? 'client'
      : 'server';
  const prismaUsed = has(src, /prisma\./);
  const writes = (
    src.match(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g) ?? []
  ).length;
  // The shared guard (src/lib/auth/current-user.ts) both authenticates and, when given a role
  // list, enforces roles.
  const guard = has(src, /require(Page)?(User|Teacher)\(|resolveUser\(/);
  const auth = guard || has(src, /\bauth\(\)|currentUser\(|getAuth\(/);
  const row: Row = {
    url,
    file: relative(ROOT, file),
    methods,
    auth,
    guard,
    sessionClaims: has(src, /sessionClaims/),
    role: has(
      src,
      /require(Page)?(User\(\s*\[|Teacher\()|\brole\b\s*(===|!==|==|!=)|\.role\b|roles?\.includes|\[\s*["']\w+["']\s*,/
    ),
    school: has(src, /schoolId/),
    guardian: has(src, /guardian/i),
    validate: has(src, /\bz\.|safeParse\(|\.parse\(/),
    audit: has(src, /logAudit/),
    rate: has(src, /checkRateLimit/),
    writes,
    flags: [],
  };

  const isPublic = isApi && PUBLIC_API.some((r) => r.test(url));
  if (methods === 'client') return row; // client components: guarded by the APIs they call
  if (!isPublic && !auth && prismaUsed) row.flags.push('DB-WITHOUT-AUTH');
  if (!isPublic && !auth && isApi) row.flags.push('NO-AUTH-CALL');
  if (auth && !row.role) row.flags.push('NO-ROLE-CHECK');
  if (prismaUsed && !row.school) row.flags.push('NO-SCHOOL-SCOPE');
  if (writes > 0 && !row.audit) row.flags.push('WRITE-NO-AUDIT');
  if (row.sessionClaims) row.flags.push('USES-SESSION-CLAIMS');
  if (isApi && writes > 0 && !row.validate) row.flags.push('WRITE-NO-VALIDATION');
  if (
    /where:\s*\{\s*userId\s*[,}]/.test(src) ||
    /findUnique\(\{\s*where:\s*\{\s*userId\b/.test(src)
  )
    row.flags.push('CHECK-CLERKID-VS-UUID');
  return row;
}

function table(rows: Row[], isApi: boolean): string {
  const head = isApi
    ? '| Route | Methods | Auth | Guard | Role | School | Guardian | Validate | Audit | RateLim | Writes | Flags |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n'
    : '| Page | Kind | Auth | Guard | Role | School | Guardian | Writes | Flags |\n|---|---|---|---|---|---|---|---|---|\n';
  return (
    head +
    rows
      .sort((a, b) => a.url.localeCompare(b.url))
      .map((r) =>
        isApi
          ? `| \`${r.url}\` | ${r.methods} | ${mark(r.auth)} | ${mark(r.guard)} | ${mark(r.role)} | ${mark(r.school)} | ${mark(r.guardian)} | ${mark(r.validate)} | ${mark(r.audit)} | ${mark(r.rate)} | ${r.writes} | ${r.flags.join(' ')} |`
          : `| \`${r.url}\` | ${r.methods} | ${mark(r.auth)} | ${mark(r.guard)} | ${mark(r.role)} | ${mark(r.school)} | ${mark(r.guardian)} | ${r.writes} | ${r.flags.join(' ')} |`
      )
      .join('\n')
  );
}

function main() {
  const apiRows = walk(API_DIR, (f) => /route\.ts$/.test(f)).map((f) =>
    analyse(f, toUrl(f, join(ROOT, 'src/app')), true)
  );
  const pageRows = walk(join(PAGES_DIR, '(dashboard)'), (f) => /(page|layout)\.tsx$/.test(f)).map(
    (f) => analyse(f, toUrl(f, PAGES_DIR) + (f.endsWith('layout.tsx') ? ' (layout)' : ''), false)
  );
  const actionRows = walk(join(PAGES_DIR, 'actions'), (f) => /\.tsx?$/.test(f)).map((f) =>
    analyse(f, 'server-actions:' + relative(join(PAGES_DIR, 'actions'), f), false)
  );

  const all = [...apiRows, ...pageRows.filter((r) => r.methods !== 'client'), ...actionRows];
  const count = (flag: string) => all.filter((r) => r.flags.includes(flag)).length;

  const md = `# Route & Page Inventory (generated)

> Generated by \`pnpm inventory\` — do not edit by hand. HEURISTIC regex analysis: "✓" means the
> pattern appears somewhere in the file, not that it is applied correctly, and the analysis is
> per FILE, not per HTTP method (a role check on PUT can hide an unguarded GET in the same file).
> Use it to decide where to look in REMEDIATION_PLAN R1; the negative-authorization test suite
> (R1-26) is the real proof.

## Summary

| Metric | Count |
|---|---|
| API routes | ${apiRows.length} |
| Dashboard pages/layouts (server) | ${pageRows.filter((r) => r.methods !== 'client').length} |
| Dashboard pages/layouts (client) | ${pageRows.filter((r) => r.methods === 'client').length} |
| Server-action files | ${actionRows.length} |
| **Routes/pages on the shared guard (R1-14 progress)** | ${all.filter((r) => r.guard).length} / ${all.length} |
| DB access without any auth call | ${count('DB-WITHOUT-AUTH')} |
| API route without auth call (non-public) | ${count('NO-AUTH-CALL')} |
| Authenticated but no role check visible | ${count('NO-ROLE-CHECK')} |
| Prisma used without \`schoolId\` | ${count('NO-SCHOOL-SCOPE')} |
| Writes without audit | ${count('WRITE-NO-AUDIT')} |
| API writes without validation | ${count('WRITE-NO-VALIDATION')} |
| Uses Clerk session claims (second identity model) | ${count('USES-SESSION-CLAIMS')} |
| Possible Clerk-ID-vs-UUID lookup | ${count('CHECK-CLERKID-VS-UUID')} |

Flags: \`NO-AUTH-CALL\` \`DB-WITHOUT-AUTH\` \`NO-ROLE-CHECK\` \`NO-SCHOOL-SCOPE\` \`WRITE-NO-AUDIT\`
\`WRITE-NO-VALIDATION\` \`USES-SESSION-CLAIMS\` \`CHECK-CLERKID-VS-UUID\`. Public by design:
\`/api/health\`, \`/api/webhooks/*\` (webhooks must self-authenticate).

## API routes

${table(apiRows, true)}

## Dashboard pages and layouts (server-rendered)

${table(
  pageRows.filter((r) => r.methods !== 'client'),
  false
)}

## Server actions

${table(actionRows, false)}
`;
  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  writeFileSync(join(ROOT, 'docs/ROUTE_INVENTORY.md'), md);
  console.log(`Wrote docs/ROUTE_INVENTORY.md — ${all.length} entries`);
}

main();
