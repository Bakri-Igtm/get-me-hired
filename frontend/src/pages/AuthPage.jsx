import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

const roles = [
  { value: "RQ", label: "Requester (job seeker)" },
  { value: "RR", label: "Reviewer" },
];

export default function AuthPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [mode, setMode] = useState("signup"); // "signup" | "login"

  // LOGIN STATE
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // SIGNUP STATE
  const [signupForm, setSignupForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "RQ",
  });
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState("");

  // ---------------- LOGIN ----------------
  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    setSignupSuccess("");
    setLoginLoading(true);

    try {
      const res = await api.post("/api/auth/login", {
        email: loginForm.email,
        password: loginForm.password,
      });

      const { token, user } = res.data;
      login(token, {
        userId: user.userId,
        userType: user.userType,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });

      navigate("/dashboard");
    } catch (err) {
      console.error("Login failed:", err);
      setLoginError(
        err.response?.data?.message || "Login failed. Check your credentials."
      );
    } finally {
      setLoginLoading(false);
    }
  };

  // ---------------- SIGNUP ----------------
  const handleSignupChange = (e) => {
    const { name, value } = e.target;
    setSignupForm((prev) => ({ ...prev, [name]: value }));
    setSignupSuccess("");
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setSignupError("");
    setSignupSuccess("");
    setSignupLoading(true);

    try {
      const { firstName, lastName, email, password, role } = signupForm;

      let endpoint = "/api/requesters";
      if (role === "RR") {
        endpoint = "/api/reviewers";
      }

      await api.post(endpoint, {
        firstName,
        lastName,
        email,
        password,
      });

      setSignupSuccess("Account created! You can now sign in.");
      // optional: prefill login email
      setLoginForm((prev) => ({ ...prev, email }));
      setMode("login");
    } catch (err) {
      console.error("Signup failed:", err);
      setSignupError(
        err.response?.data?.message || "Signup failed. Please try again."
      );
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-3">
      <div className="relative w-full max-w-5xl h-[520px] md:h-[560px]">
        {/* SIGNUP VIEW (matches your GIF: green left, signup right) */}
        <div
          className={`absolute inset-0 flex flex-col md:flex-row bg-white rounded-2xl shadow-xl overflow-hidden transition-all duration-500 ease-in-out
            ${mode === "signup" ? "opacity-100 translate-x-0 z-20" : "opacity-0 -translate-x-8 z-10 pointer-events-none"}`}
        >
          {/* LEFT - GREEN PANEL */}
          <div className="md:w-1/2 bg-gradient-to-br from-emerald-500 to-teal-500 text-white p-10 flex flex-col justify-center items-start">
            <div className="mb-10 hidden md:flex items-center gap-2">
              <div className="w-10 h-10 rounded-full border border-white/60 flex items-center justify-center text-xs font-semibold">
                GMH
              </div>
              <span className="text-sm font-medium">Get Me Hired</span>
            </div>

            <h2 className="text-3xl font-bold mb-3">Welcome Back!</h2>
            <p className="text-sm text-emerald-50/90 mb-6 max-w-xs">
              Already have an account? Sign in to view your resume progress and
              reviews.
            </p>

            <button
              type="button"
              onClick={() => setMode("login")}
              className="mt-2 w-40 rounded-full border border-white bg-transparent hover:bg-white hover:text-emerald-600 transition-colors px-4 py-2 text-sm font-semibold"
            >
              SIGN IN
            </button>
          </div>

          {/* RIGHT - SIGNUP FORM */}
          <div className="md:w-1/2 bg-white p-8 md:p-10 flex flex-col justify-center">
            <h2 className="text-2xl font-bold text-emerald-600 mb-1">
              Create Account
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Use your email to register and start improving your resume.
            </p>

            {signupError && (
              <div className="mb-3 text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {signupError}
              </div>
            )}

            {signupSuccess && (
              <div className="mb-3 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
                {signupSuccess}
              </div>
            )}

            <form onSubmit={handleSignupSubmit} className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    className="block text-xs text-slate-600 mb-1"
                    htmlFor="signup-firstName"
                  >
                    First Name
                  </label>
                  <input
                    id="signup-firstName"
                    name="firstName"
                    type="text"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Jane"
                    value={signupForm.firstName}
                    onChange={handleSignupChange}
                    required
                  />
                </div>
                <div className="flex-1">
                  <label
                    className="block text-xs text-slate-600 mb-1"
                    htmlFor="signup-lastName"
                  >
                    Last Name
                  </label>
                  <input
                    id="signup-lastName"
                    name="lastName"
                    type="text"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Doe"
                    value={signupForm.lastName}
                    onChange={handleSignupChange}
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-xs text-slate-600 mb-1"
                  htmlFor="signup-email"
                >
                  Email
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="you@example.com"
                  value={signupForm.email}
                  onChange={handleSignupChange}
                  required
                />
              </div>

              <div>
                <label
                  className="block text-xs text-slate-600 mb-1"
                  htmlFor="signup-password"
                >
                  Password
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Choose a strong password"
                  value={signupForm.password}
                  onChange={handleSignupChange}
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  Account Type
                </label>
                <select
                  name="role"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  value={signupForm.role}
                  onChange={handleSignupChange}
                >
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Requester = job seeker who owns resumes. Reviewer = person who
                  reviews resumes.
                </p>
              </div>

              <button
                type="submit"
                disabled={signupLoading}
                className="w-full mt-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {signupLoading ? "Creating account..." : "SIGN UP"}
              </button>
            </form>
          </div>
        </div>

        {/* LOGIN VIEW (green on the right, login form on the left) */}
        <div
          className={`absolute inset-0 flex flex-col md:flex-row bg-white rounded-2xl shadow-xl overflow-hidden transition-all duration-500 ease-in-out
            ${mode === "login" ? "opacity-100 translate-x-0 z-20" : "opacity-0 translate-x-8 z-10 pointer-events-none"}`}
        >
          {/* LEFT - LOGIN FORM */}
          <div className="md:w-1/2 bg-white p-8 md:p-10 flex flex-col justify-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Sign In</h2>
            <p className="text-xs text-slate-500 mb-5">
              Login with your email and password to access your workspace.
            </p>

            {loginError && (
              <div className="mb-3 text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label
                  className="block text-xs text-slate-600 mb-1"
                  htmlFor="login-email"
                >
                  Email
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="you@example.com"
                  value={loginForm.email}
                  onChange={handleLoginChange}
                  required
                />
              </div>

              <div>
                <label
                  className="block text-xs text-slate-600 mb-1"
                  htmlFor="login-password"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={handleLoginChange}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full mt-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loginLoading ? "Signing in..." : "SIGN IN"}
              </button>
            </form>
          </div>

          {/* RIGHT - GREEN PANEL */}
          <div className="md:w-1/2 bg-gradient-to-br from-emerald-500 to-teal-500 text-white p-10 flex flex-col justify-center items-start md:items-center text-left md:text-center">
            <div className="mb-10 hidden md:flex items-center gap-2">
              <div className="w-10 h-10 rounded-full border border-white/60 flex items-center justify-center text-xs font-semibold">
                GMH
              </div>
              <span className="text-sm font-medium">Get Me Hired</span>
            </div>

            <h2 className="text-3xl font-bold mb-3">Hello, Friend!</h2>
            <p className="text-sm text-emerald-50/90 mb-6 max-w-xs">
              Enter your personal details and start your journey to a stronger
              resume.
            </p>

            <button
              type="button"
              onClick={() => setMode("signup")}
              className="mt-2 w-40 rounded-full border border-white bg-transparent hover:bg-white hover:text-emerald-600 transition-colors px-4 py-2 text-sm font-semibold"
            >
              SIGN UP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
