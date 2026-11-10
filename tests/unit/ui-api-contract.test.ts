import { describe, expect, it } from 'vitest';
import { findProblems } from '../../scripts/ui-api-contract';

const route = (url: string, ...methods: string[]) => ({
  url,
  rx: new RegExp('^' + url.replace(/\[[^\]]+\]/g, '[^/]+') + '$'),
  methods: new Set(methods),
});

describe('UI→API contract matcher', () => {
  const routes = [route('/api/students', 'GET', 'POST'), route('/api/students/[id]', 'GET', 'PUT')];

  it('accepts calls that match an existing route and method', () => {
    expect(
      findProblems(routes, [
        { file: 'a.tsx', url: '/api/students', method: 'POST' },
        { file: 'a.tsx', url: '/api/students/${id}', method: 'PUT' },
      ])
    ).toEqual([]);
  });

  it('flags a call to a route that does not exist', () => {
    const out = findProblems(routes, [{ file: 'a.tsx', url: '/api/activities', method: 'GET' }]);
    expect(out).toEqual(['MISSING-ROUTE GET /api/activities  (a.tsx)']);
  });

  it('flags a method the route does not export', () => {
    const out = findProblems(routes, [
      { file: 'a.tsx', url: '/api/students/${id}', method: 'DELETE' },
    ]);
    expect(out[0]).toMatch(/^WRONG-METHOD DELETE .* exports \[GET,PUT\]/);
  });
});
