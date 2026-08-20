"use client";

import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">EduTrack Kenya</h1>
        <p className="text-sm text-slate-500 mt-1">
          CBC-native school management for Nairobi private schools
        </p>
      </div>
      <SignIn
        fallbackRedirectUrl="/"
        signUpUrl="/sign-up"
        appearance={{
          elements: {
            card: "shadow-none border border-slate-200 rounded-xl",
            headerTitle: "hidden",
            headerSubtitle: "hidden",
            socialButtonsBlockButton:
              "border-slate-200 text-slate-700 hover:bg-slate-50",
            formButtonPrimary:
              "bg-emerald-600 hover:bg-emerald-700 text-white",
            footerActionLink: "text-emerald-600 hover:text-emerald-700",
          },
        }}
      />
    </div>
  );
}