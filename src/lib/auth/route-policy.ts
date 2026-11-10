import { createRouteMatcher } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';

/**
 * Edge route policy: DENY BY DEFAULT.
 * Every path requires a signed-in user unless it matches a pattern below. A new route group
 * is therefore protected automatically; making something public is an explicit, reviewed change.
 *
 * This is only the coarse first gate ("are you signed in?"). Role, school and guardian checks
 * are enforced per route/page on the server (see REMEDIATION_PLAN R1).
 *
 * NOTE: everything under /api/webhooks/ is public at this layer, so every webhook handler MUST
 * authenticate the caller itself (shared secret / signature / provider verification).
 */
export const PUBLIC_ROUTE_PATTERNS = [
  '/', // only redirects to /login
  '/login(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/unauthorized',
  '/api/health',
  '/api/webhooks/(.*)',
  '/manifest.json',
];

export const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);

export type AccessDecision = 'allow' | 'unauthenticated-api' | 'unauthenticated-page';

export function decideAccess(req: NextRequest, isAuthenticated: boolean): AccessDecision {
  if (isPublicRoute(req) || isAuthenticated) return 'allow';
  return req.nextUrl.pathname.startsWith('/api/') ? 'unauthenticated-api' : 'unauthenticated-page';
}
