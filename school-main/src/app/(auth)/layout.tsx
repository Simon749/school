import { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">EduTrack Kenya</h1>
          <span className="text-xs text-gray-500">School Setup Wizard</span>
        </div>
      </header>
      {children}
    </div>
  );
}