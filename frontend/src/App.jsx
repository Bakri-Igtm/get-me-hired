import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";

function App() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* you can keep or simplify this header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between py-3 px-4">
          <Link to="/" className="font-bold text-lg text-emerald-600">
            Get Me Hired
          </Link>
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

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Routes>
          <Route
            path="/"
            element={
              user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
            }
          />
          <Route path="/login" element={<AuthPage />} />
          {/* optional alias */}
          <Route path="/signup" element={<AuthPage />} />
          <Route
            path="/dashboard"
            element={
              user ? <DashboardPage /> : <Navigate to="/login" replace />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
