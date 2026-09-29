import { execSync } from "node:child_process";

// Skip in CI / Vercel / production installs
if (process.env.CI || process.env.VERCEL || process.env.NODE_ENV === "production") {
  process.exit(0);
}

try {
  execSync("husky", { stdio: "inherit" });
} catch {
  console.warn("husky not installed, skipping git hooks setup");
}