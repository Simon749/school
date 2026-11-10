import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { decideAccess } from '@/lib/auth/route-policy';

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // TODO(R7-06): tighten (drop 'unsafe-inline'/'unsafe-eval', add Firebase/Sentry hosts) after
  // testing in a real browser; changing it blind could break Clerk sign-in.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.dev https://*.clerk.accounts.dev",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.clerk.dev https://*.clerk.accounts.dev https://*.upstash.io https://*.amazonaws.com",
    "frame-src 'self' https://*.clerk.dev https://*.clerk.accounts.dev",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export default clerkMiddleware((auth, req) => {
  const { userId } = auth();
  const decision = decideAccess(req, Boolean(userId));

  if (decision === 'unauthenticated-api') {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
  }

  if (decision === 'unauthenticated-page') {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect_url', req.url);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return withSecurityHeaders(NextResponse.next());
});

export const config = {
  matcher: [
    // Run on everything except Next internals and static files (standard Clerk matcher)...
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // ...but ALWAYS run on API routes, even if the path happens to contain a dot.
    '/(api|trpc)(.*)',
  ],
};
