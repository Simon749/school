import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
      <SignIn path="/login" routing="path" fallbackRedirectUrl="/dashboard" />
    </div>
  );
}