import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public routes — no auth required
const isPublicRoute = createRouteMatcher([
  "/api/health",
  '/login(.*)',
  "/sign-in(.*)",
  '/sign-up(.*)' 
  
]);

const isProtectedRoute = createRouteMatcher([
  "/admin(.*)",
  "/deputy(.*)",
  "/teacher(.*)",
  "/bursar(.*)",
  "/parent(.*)",
  "/it_admin(.*)",
  "/dashboard(.*)",
  "/api(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Protect everything except public routes
  if (!isPublicRoute(req) && isProtectedRoute(req)) {
    auth().protect();
  }

  const response = NextResponse.next();

  // --- Security headers (from Step 2, unchanged) ---
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

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
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);

  return response;
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};