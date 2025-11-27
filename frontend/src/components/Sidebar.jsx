// src/components/Sidebar.jsx
import { NavLink } from "react-router-dom";
import {
  Home,
  Users,
  Trophy,
  User,
  ClipboardList,
  FileText,
} from "lucide-react";

export default function Sidebar({ onNavigate }) {
  const menuItems = [
    { name: "Home", icon: Home, path: "/dashboard" },
    { name: "Directory", icon: Users, path: "/directory" },
    { name: "Review Requests", icon: ClipboardList, path: "/review-requests" },
    // ✅ New "My Resumes" item, before Profile
    { name: "My Resumes", icon: FileText, path: "/my-resumes" },
    { name: "Prizes", icon: Trophy, path: "/prizes" },
    { name: "Profile", icon: User, path: "/profile" },
  ];

  return (
    <div className="h-full w-56 bg-white text-slate-900 flex flex-col justify-between border border-slate-200 shadow-sm rounded-lg md:rounded-md">
      <div className="flex flex-col py-6 px-3 space-y-2 flex-grow">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => onNavigate && onNavigate()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150
                ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "hover:bg-slate-50 text-slate-700 border border-transparent"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {item.name}
            </NavLink>
          );
        })}
      </div>

      <div className="border-t border-slate-200 py-3 px-4 text-xs text-slate-400">
        © {new Date().getFullYear()} GetMeHired
      </div>
    </div>
  );
}
