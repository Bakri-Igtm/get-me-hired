import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLeaderboard, getMyProfile } from "../api/profile.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Shield, Award, Medal, Star, Trophy, Target, Crown, Zap, CheckCircle, Clock, Edit3, Search, FileText } from "lucide-react";

const BADGE_ICONS = {
  "Rookie": Shield,
  "Sergeant": Zap,
  "Lieutenant": Star,
  "Captain": Target,
  "General": Award,
  "Major General": Medal,
  "Commander": Trophy,
  "Legend": Crown
};

// --- Components ---

function PieChart({ data, colors }) {
  // data: { "Label": value, ... }
  // colors: { "Label": "#hex", ... }
  
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-xs text-slate-400 bg-slate-50 rounded-full aspect-square mx-auto">
        No data
      </div>
    );
  }

  let currentAngle = 0;
  const segments = Object.entries(data).map(([label, value]) => {
    const percentage = (value / total) * 100;
    const angle = (value / total) * 360;
    const color = colors[label] || "#cbd5e1";
    const segment = `${color} ${currentAngle}deg ${currentAngle + angle}deg`;
    currentAngle += angle;
    return segment;
  });

  const gradient = `conic-gradient(${segments.join(", ")})`;

  return (
    <div className="flex items-center gap-4">
      <div 
        className="w-24 h-24 rounded-full shrink-0 border-4 border-white shadow-sm"
        style={{ background: gradient }}
      />
      <div className="space-y-1">
        {Object.entries(data).map(([label, value]) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full" style={{ background: colors[label] || "#cbd5e1" }} />
            <span className="text-slate-600">{label}:</span>
            <span className="font-medium text-slate-900">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileCompleteness({ profile, education, experience }) {
  // Simple heuristic
  let score = 0;
  const checks = [
    { label: "Avatar", done: !!profile?.avatar_url, pts: 10 },
    { label: "Headline", done: !!profile?.headline, pts: 20 },
    { label: "Summary", done: !!profile?.summary, pts: 20 },
    { label: "Education", done: education?.length > 0, pts: 25 },
    { label: "Experience", done: experience?.length > 0, pts: 25 },
  ];

  checks.forEach(c => { if (c.done) score += c.pts; });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-slate-900">Profile Strength</h2>
        <span className="text-xs font-bold text-emerald-600">{score}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 mb-3">
        <div 
          className="bg-emerald-500 h-2 rounded-full transition-all duration-500" 
          style={{ width: `${score}%` }} 
        />
      </div>
      <div className="space-y-1">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-xs">
            {c.done ? (
              <CheckCircle className="w-3 h-3 text-emerald-500" />
            ) : (
              <div className="w-3 h-3 rounded-full border border-slate-300" />
            )}
            <span className={c.done ? "text-slate-700" : "text-slate-400"}>{c.label}</span>
          </div>
        ))}
      </div>
      {score < 100 && (
        <Link to="/profile" className="block mt-3 text-center text-xs text-blue-600 hover:underline">
          Complete your profile →
        </Link>
      )}
    </div>
  );
}

function QuickActions({ userType }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900 mb-3">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-2">
        {userType !== "RR" && (
          <Link to="/my-resumes" className="flex flex-col items-center justify-center p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
            <FileText className="w-5 h-5 text-slate-600 mb-1" />
            <span className="text-xs font-medium text-slate-700">My Resumes</span>
          </Link>
        )}
        <Link to="/directory" className="flex flex-col items-center justify-center p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
          <Search className="w-5 h-5 text-slate-600 mb-1" />
          <span className="text-xs font-medium text-slate-700">Find Person</span>
        </Link>
        <Link to="/profile" className="flex flex-col items-center justify-center p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
          <Edit3 className="w-5 h-5 text-slate-600 mb-1" />
          <span className="text-xs font-medium text-slate-700">Edit Profile</span>
        </Link>
        <Link to="/review-requests" className="flex flex-col items-center justify-center p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
          <Clock className="w-5 h-5 text-slate-600 mb-1" />
          <span className="text-xs font-medium text-slate-700">My Requests</span>
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  // EXACTLY the same style as rev.user_type in comments
  const rawType = user?.user_type || user?.userType;

  const userTypeLabel =
    rawType === "RQ"
        ? "Requester"
        : rawType === "RR"
        ? "Reviewer"
        : rawType === "AD"
        ? "Admin"
        : "Unknown";


  const userId = user?.userId || user?.id || user?.user_id;

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState({ requesters: [], reviewers: [] });
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Profile Stats & Badges
  const [myProfile, setMyProfile] = useState(null);
  const [education, setEducation] = useState([]);
  const [experience, setExperience] = useState([]);

  // ---------------- FETCH DATA ----------------
  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLeaderboardLoading(true);
      try {
        const res = await getLeaderboard();
        setLeaderboard(res.data);
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
      } finally {
        setLeaderboardLoading(false);
      }
    };

    const fetchProfileData = async () => {
      try {
        const { data } = await getMyProfile();
        setMyProfile(data);
        setEducation(data.education || []);
        setExperience(data.experience || []);
      } catch (err) {
        console.error("Error fetching profile:", err);
      }
    };

    fetchLeaderboard();
    fetchProfileData();
  }, []);

  // ---------------- UI ----------------
  return (
    <div className="mt-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <section className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Hey, {user.firstName} 👋
          </h1>
          <p className="text-slate-600 mt-1">
            Welcome back to your dashboard.
          </p>
        </div>
        <span className="px-4 py-1.5 rounded-full bg-slate-900 text-slate-50 text-sm font-medium shadow-sm">
          {userTypeLabel}
        </span>
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
        
        {/* 1. Account Info */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl font-bold text-slate-700">
              {user.firstName[0]}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{user.firstName} {user.lastName}</h2>
              <p className="text-sm text-slate-500 font-mono">{user.email}</p>
              <Link to="/profile" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                View Profile
              </Link>
            </div>
          </div>
        </div>

        {/* 2. Stats & Badges */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="font-semibold text-slate-900 mb-3">Your Impact</h2>
            <div className={`grid gap-4 ${rawType === "RR" ? "grid-cols-1" : "grid-cols-2"}`}>
              {/* Reviews Column */}
              <div className="flex flex-col gap-2">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-slate-900">{myProfile?.stats?.reviewCount || 0}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Reviews</p>
                </div>
                <div className="flex justify-center min-h-[28px]">
                  {(() => {
                    const badge = myProfile?.badges?.find(b => b.category === "Reviewer Badge");
                    if (badge) {
                      const Icon = BADGE_ICONS[badge.badge_name] || Shield;
                      return (
                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-full px-3 py-1" title={badge.category}>
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">{badge.badge_name}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* Requests Column - Hidden for Reviewers */}
              {rawType !== "RR" && (
                <div className="flex flex-col gap-2">
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-slate-900">{myProfile?.stats?.requestCount || 0}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Requests</p>
                  </div>
                  <div className="flex justify-center min-h-[28px]">
                    {(() => {
                      const badge = myProfile?.badges?.find(b => b.category === "Requester Badge");
                      if (badge) {
                        const Icon = BADGE_ICONS[badge.badge_name] || Shield;
                        return (
                          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-full px-3 py-1" title={badge.category}>
                            <Icon className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold">{badge.badge_name}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Profile Strength */}
        <ProfileCompleteness 
          profile={myProfile?.profile} 
          education={education} 
          experience={experience} 
        />

        {/* 4. Quick Actions */}
        <QuickActions userType={rawType} />

        {/* 5. Activity Chart */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-4">
            {rawType === "RQ" ? "Request Status" : "Review Ratings"}
          </h2>
          <div className="flex justify-center">
            {rawType === "RQ" ? (
              <PieChart 
                data={myProfile?.stats?.requestStatus || {}} 
                colors={{ "pending": "#f59e0b", "accepted": "#3b82f6", "resolved": "#10b981", "cancelled": "#ef4444" }} 
              />
            ) : (
              <PieChart 
                data={myProfile?.stats?.reviewRatings || {}} 
                colors={{ "5": "#10b981", "4": "#34d399", "3": "#f59e0b", "2": "#f97316", "1": "#ef4444" }} 
              />
            )}
          </div>
        </div>

        {/* 6. Leaderboard */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm md:col-span-2 xl:col-span-1">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            Leaderboard
          </h2>
           {leaderboardLoading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : (
              <div className="space-y-6">
                {leaderboard.requesters?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Top Requesters</h3>
                    <ul className="space-y-2">
                      {leaderboard.requesters.slice(0, 3).map((u, i) => (
                        <li key={u.user_id} className="flex justify-between text-sm">
                          <span className="text-slate-700">{i + 1}. {u.user_fname} {u.user_lname}</span>
                          <span className="font-mono font-bold text-slate-900">{u.points}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {leaderboard.reviewers?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Top Reviewers</h3>
                    <ul className="space-y-2">
                      {leaderboard.reviewers.slice(0, 3).map((u, i) => (
                        <li key={u.user_id} className="flex justify-between text-sm">
                          <span className="text-slate-700">{i + 1}. {u.user_fname} {u.user_lname}</span>
                          <span className="font-mono font-bold text-slate-900">{u.points}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(!leaderboard.requesters?.length && !leaderboard.reviewers?.length) && (
                   <p className="text-sm text-slate-400 italic">No leaderboard data available yet.</p>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
