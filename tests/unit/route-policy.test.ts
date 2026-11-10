import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { decideAccess } from '@/lib/auth/route-policy';

const req = (path: string) => new NextRequest(new URL(path, 'https://school.example'));

describe('edge route policy (deny by default)', () => {
  it.each([
    '/',
    '/login',
    '/login/sso-callback',
    '/sign-up',
    '/unauthorized',
    '/api/health',
    '/api/webhooks/mpesa', // PAY-01 regression: Safaricom's callback must reach the handler
    '/manifest.json',
  ])('lets an anonymous visitor reach public path %s', (path) => {
    expect(decideAccess(req(path), false)).toBe('allow');
  });

  it.each([
    '/api/students/abc',
    '/api/fees/payments',
    '/api/export/status/1',
    '/api/healthcheck-extra', // near-miss of a public path
    '/api/webhooksfoo', // near-miss of the webhook prefix
    '/api/anything.json', // dots in the path must not bypass the gate
  ])('rejects anonymous API call to %s with 401', (path) => {
    expect(decideAccess(req(path), false)).toBe('unauthenticated-api');
  });

  it.each([
    '/admin',
    '/parent/fees',
    '/teacher/markbook',
    '/deputy/uncovered-lessons',
    '/some-brand-new-route-group', // deny-by-default: unknown pages are protected too
    '/onboarding/step-1',
  ])('redirects anonymous page request %s to login', (path) => {
    expect(decideAccess(req(path), false)).toBe('unauthenticated-page');
  });

  it('allows signed-in users through the first gate (role checks happen later)', () => {
    expect(decideAccess(req('/api/students/abc'), true)).toBe('allow');
    expect(decideAccess(req('/admin'), true)).toBe('allow');
  });
});
