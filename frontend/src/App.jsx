import { useState } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { useAuth } from "./context/AuthContext.jsx";

import AuthPage from "./pages/AuthPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import DirectoryPage from "./pages/DirectoryPage.jsx";
import PrizesPage from "./pages/PrizesPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ReviewRequestsPage from "./pages/ReviewRequestsPage.jsx";
import Sidebar from "./components/Sidebar.jsx";
import PublicMemberPage from "./pages/PublicMemberPage.jsx";


function App() {
  const { user, logout, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  // 🚦 Don’t render routes until we know if user is logged in
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-slate-900">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div
          className={
            user
              ? "flex items-center justify-between py-3 px-6"
              : "max-w-5xl mx-auto flex items-center justify-between py-3 px-4"
          }
        >
          <div className="flex items-center gap-3">
            {/* Hamburger only when logged in */}
            {user && (
              <button
                className="inline-flex items-center justify-center rounded-md border border-slate-200 w-9 h-9 text-slate-700 hover:bg-slate-100"
                onClick={toggleSidebar}
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
            <Link to="/" className="font-bold text-lg text-emerald-600">
              Get Me Hired
            </Link>
          </div>

          {user && (
            <button
              onClick={logout}
              className="text-xs px-3 py-1 rounded-full bg-slate-900 text-white hover:bg-slate-700"
            >
              Logout
            </button>
          )}
        </div>
      </header>

      {/* Main */}
      <main className={user ? "px-0 py-0" : "max-w-5xl mx-auto px-4 py-6"}>
        {user ? (
          // =======================
          // LOGGED-IN LAYOUT
          // =======================
          <div className="relative px-6 py-6 min-h-[calc(100vh-64px)] flex">
            {/* Desktop sidebar */}
            {sidebarOpen && (
              <div className="hidden md:block w-56 mr-6">
                <div className="h-full">
                  <Sidebar />
                </div>
              </div>
            )}

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
              <div className="fixed inset-0 z-40 flex md:hidden">
                <div className="flex-1 bg-black/40" onClick={toggleSidebar} />
                <div className="w-56 h-full">
                  <Sidebar onNavigate={toggleSidebar} />
                </div>
              </div>
            )}

            {/* Right-side content */}
            <div className="flex-1">
              <Routes>
                {/* Root only when URL is exactly "/" */}
                <Route
                  index
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/directory" element={<DirectoryPage />} />
                <Route
                  path="/review-requests"
                  element={<ReviewRequestsPage />}
                />
                <Route path="/prizes" element={<PrizesPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/members/:id" element={<PublicMemberPage />} /> 
                {/* Any unknown path while logged in → dashboard */}
                <Route
                  path="*"
                  element={<Navigate to="/dashboard" replace />}
                />
              </Routes>
            </div>
          </div>
        ) : (
          // =======================
          // LOGGED-OUT LAYOUT
          // =======================
          <Routes>
            {/* Root only when exactly "/" and logged out */}
            <Route
              index
              element={<Navigate to="/login" replace />}
            />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage />} />
            {/* Any unknown path while logged out → login */}
            <Route
              path="*"
              element={<Navigate to="/login" replace />}
            />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default App;
