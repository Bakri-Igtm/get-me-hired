import { useAuth } from "../context/AuthContext.jsx";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-4 mt-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-sm text-slate-300">
        Welcome back, {user.firstName}! You are logged in as{" "}
        <span className="font-mono px-2 py-1 bg-slate-800 rounded">
          {user.userType}
        </span>
        .
      </p>

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h2 className="font-semibold mb-2">Next steps</h2>
          <ul className="text-sm list-disc list-inside text-slate-300 space-y-1">
            <li>Hook this dashboard to your resume data.</li>
            <li>Add a page to create / view resume versions.</li>
            <li>Add a button to generate AI feedback using your backend.</li>
          </ul>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h2 className="font-semibold mb-2">Quick info</h2>
          <p className="text-xs text-slate-400">
            userId: <span className="font-mono">{user.userId}</span>
          </p>
          <p className="text-xs text-slate-400">
            email: <span className="font-mono">{user.email}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
