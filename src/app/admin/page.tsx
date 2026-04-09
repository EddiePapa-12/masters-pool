/**
 * /admin — Pool admin dashboard
 *
 * Server Component. Checks session cookie before rendering.
 * Shows login form if unauthenticated.
 */

import { redirect } from "next/navigation";
import { isAuthenticated, loginAction, logoutAction, getPoolSettings, getSyncStats } from "./actions";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic"; // never cache this page

export default async function AdminPage() {
  const authed = await isAuthenticated();

  if (!authed) {
    return <LoginPage />;
  }

  // Authenticated — load initial data server-side
  const [settings, stats] = await Promise.all([getPoolSettings(), getSyncStats()]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#006747] text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Masters Pool — Admin</h1>
            <p className="text-green-200 text-sm mt-0.5">
              {settings?.tournament_name ?? "2026 Masters Tournament"}
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              await logoutAction();
              redirect("/admin");
            }}
          >
            <button
              type="submit"
              className="text-sm text-green-200 hover:text-white underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <AdminClient initialStats={stats} initialSettings={settings} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginPage() {
  async function handleLogin(formData: FormData) {
    "use server";
    const result = await loginAction(formData);
    if (result.success) {
      redirect("/admin");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-block bg-[#006747] text-white text-2xl font-bold px-4 py-2 rounded-lg mb-3">
            ⛳
          </div>
          <h1 className="text-xl font-bold text-gray-900">Masters Pool Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Enter password to continue</p>
        </div>

        <form action={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-[#006747] focus:border-transparent"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#006747] hover:bg-[#005238] text-white font-semibold
                       py-2.5 rounded-lg transition-colors text-sm"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
