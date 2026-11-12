/**
 * UI <-> API contract check. Finds every literal `fetch('/api/...')` in client code and verifies
 * that (a) a matching route file exists and (b) it exports the HTTP method being used.
 *
 * Known-broken calls are listed in scripts/ui-api-contract.allowlist.json so CI passes today but
 * fails on any NEW broken call. Fixed calls must be removed from the allow-list (stale entries
 * also fail), so the list can only shrink.
 *
 * Limits (heuristic): only literal string/template URLs are seen; method is read from a
 * `method: '...'` within 250 chars of the fetch (default GET); calls through helper functions,
 * axios, or Server Actions are not covered.
 *
 * Run: pnpm contract
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const API = join(SRC, 'app', 'api');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

interface Route {
  url: string;
  rx: RegExp;
  methods: Set<string>;
}

function loadRoutes(): Route[] {
  return walk(API)
    .filter((f) => /route\.tsx?$/.test(f))
    .map((f) => {
      const url = '/' + relative(join(SRC, 'app'), dirname(f)).split('\\').join('/');
      const src = readFileSync(f, 'utf8');
      const methods = new Set(
        [
          ...src.matchAll(
            /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g
          ),
        ]
          .map((m) => m[1])
          .filter((method): method is string => typeof method === 'string')
      );
      return { url, rx: new RegExp('^' + url.replace(/\[[^\]]+\]/g, '[^/]+') + '$'), methods };
    });
}

interface Call {
  file: string;
  url: string;
  method: string;
}

function loadCalls(): Call[] {
  const calls: Call[] = [];
  for (const f of walk(SRC)) {
    if (!/\.tsx?$/.test(f) || f.startsWith(API)) continue;
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/fetch\(\s*([`'"])(\/api\/[^`'"?]*)/g)) {
      const tail = s.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 250);
      const meth = /method:\s*['"](GET|POST|PUT|PATCH|DELETE)/.exec(tail);
      calls.push({
        file: relative(ROOT, f).split('\\').join('/'),
        url: m[2] ?? '',
        method: meth?.[1] ?? 'GET',
      });
    }
  }
  return calls;
}

export function findProblems(routes: Route[], calls: Call[]): string[] {
  const problems = new Set<string>();
  for (const c of calls) {
    const norm = c.url.replace(/\$\{[^}]*\}/g, 'x');
    const hit = routes.find((r) => r.rx.test(norm));
    if (!hit) problems.add(`MISSING-ROUTE ${c.method} ${c.url}  (${c.file})`);
    else if (!hit.methods.has(c.method))
      problems.add(
        `WRONG-METHOD ${c.method} ${c.url} — route exports [${[...hit.methods].join(',')}]  (${c.file})`
      );
  }
  return [...problems].sort();
}

function main() {
  const allow: string[] = JSON.parse(
    readFileSync(join(ROOT, 'scripts/ui-api-contract.allowlist.json'), 'utf8')
  );
  const calls = loadCalls();
  const problems = findProblems(loadRoutes(), calls);

  const fresh = problems.filter((p) => !allow.includes(p));
  const stale = allow.filter((a) => !problems.includes(a));

  console.log(
    `UI→API contract: ${calls.length} fetch calls, ${problems.length} problem(s), ${allow.length} allow-listed`
  );
  if (fresh.length) {
    console.error('\n❌ NEW broken UI→API calls (fix the call or add the route):');
    fresh.forEach((p) => console.error('  ' + p));
  }
  if (stale.length) {
    console.error(
      '\n❌ Allow-list entries that are no longer broken (remove them from the allow-list):'
    );
    stale.forEach((p) => console.error('  ' + p));
  }
  if (fresh.length || stale.length) process.exit(1);
  console.log('✅ No new contract breaks.');
}

if (process.argv[1] && /ui-api-contract\.ts$/.test(process.argv[1])) main();
