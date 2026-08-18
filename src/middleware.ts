import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Route groups that require authentication.
const isProtectedRoute = createRouteMatcher([
  "/admin(.*)",
  "/teacher(.*)",
  "/parent(.*)",
  "/bursar(.*)",
  "/deputy(.*)",
  "/it_admin(.*)",
  "/dashboard(.*)",
  "/api/(.*)",
]);

// Routes that are always public (auth pages, webhooks, health).
const isPublicRoute = createRouteMatcher([
  "/login",
  "/sign-up",
  "/api/webhooks/(.*)",
  "/api/health",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const { pathname } = req.nextUrl;

  // Public routes never block
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Protected routes: redirect unauthenticated to /login
  if (isProtectedRoute(req) && !userId) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Onboarding guard: if user is authenticated but has no school profile yet,
  // redirect to onboarding (implemented in Phase 1.2).
  // For now we let them through so the dashboard shell renders.
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
