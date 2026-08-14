"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, Loader2, UserPlus } from "lucide-react";

interface UserResult {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

export default function LinkGuardianPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.id as string;

  const [mode, setMode] = useState<"search" | "create">("search");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    relationship: "mother",
    isPrimary: false,
    canPickup: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchPhone.trim()) return;
    setSearching(true);
    setError("");
    try {
      const res = await fetch(`/api/users/search?phone=${encodeURIComponent(searchPhone)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setSearchResults(data.users || []);
      if (data.users.length === 0) setError("No existing guardian found with this phone.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload =
      mode === "search" && selectedUser
        ? {
            userId: selectedUser.id,
            relationship: form.relationship,
            isPrimary: form.isPrimary,
            canPickup: form.canPickup,
          }
        : {
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone,
            email: form.email,
            relationship: form.relationship,
            isPrimary: form.isPrimary,
            canPickup: form.canPickup,
          };

    try {
      const res = await fetch(`/api/students/${studentId}/guardians`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to link guardian");
      router.push(`/admin/students/${studentId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/admin/students/${studentId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to student
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Link Guardian</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
            {error}
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode("search")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg border ${
              mode === "search"
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Search Existing
          </button>
          <button
            onClick={() => setMode("create")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg border ${
              mode === "create"
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Create New
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === "search" ? (
            <div className="space-y-4">
              {!selectedUser ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Search by Phone (2547XXXXXXXX)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={searchPhone}
                        onChange={(e) => setSearchPhone(e.target.value)}
                        placeholder="2547XXXXXXXX"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleSearch}
                        disabled={searching || !searchPhone.trim()}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                      >
                        {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500">Results:</p>
                      {searchResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSelectedUser(u)}
                          className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                        >
                          <p className="font-medium text-sm text-gray-900">
                            {u.firstName} {u.lastName}
                          </p>
                          <p className="text-xs text-gray-500">{u.phone || u.email}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-gray-900">
                      {selectedUser.firstName} {selectedUser.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{selectedUser.phone || selectedUser.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedUser(null)}
                    className="text-xs text-blue-700 hover:text-blue-900 font-medium"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="2547XXXXXXXX"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div className="border-t pt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relationship *</label>
              <select
                required
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="mother">Mother</option>
                <option value="father">Father</option>
                <option value="guardian">Guardian</option>
                <option value="aunt">Aunt</option>
                <option value="uncle">Uncle</option>
                <option value="grandparent">Grandparent</option>
                <option value="sibling">Sibling</option>
              </select>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isPrimary}
                  onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Primary guardian</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.canPickup}
                  onChange={(e) => setForm({ ...form, canPickup: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Can pick up student</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Link
              href={`/admin/students/${studentId}`}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={
                loading ||
                (mode === "search" && !selectedUser) ||
                (mode === "create" && (!form.firstName || !form.lastName || !form.phone))
              }
              className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <UserPlus className="w-4 h-4" />
              {loading ? "Linking..." : "Link Guardian"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}