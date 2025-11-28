// src/pages/DirectoryPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMembers, searchDirectory } from "../api/directory";
import { useAuth } from "../context/AuthContext.jsx";

function roleLabel(type) {
  if (type === "RQ") return "Requester";
  if (type === "RR") return "Reviewer";
  if (type === "AD") return "Admin";
  return "Unknown";
}

function DirectoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState([]);
  const [filterRole, setFilterRole] = useState("ALL"); // ALL | RQ | RR
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchMeta, setSearchMeta] = useState(null);

  const loadMembers = async () => {
    try {
      setLoading(true);
      const roleParam = filterRole === "ALL" ? undefined : filterRole;
      const { data } = await fetchMembers(roleParam);
      setMembers(data.members || []);
      setErr("");
      setIsSearching(false);
      setSearchMeta(null);
    } catch (e) {
      console.error("Directory load error:", e);
      setErr(
        e.response?.data?.message ||
          `Failed to load directory: ${e.message || "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSearching) {
      loadMembers();
    }
  }, [filterRole]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      // If empty, just reload normal list
      setIsSearching(false);
      loadMembers();
      return;
    }

    try {
      setLoading(true);
      setIsSearching(true);
      setErr("");
      
      const { data } = await searchDirectory(searchQuery);
      setMembers(data.members || []);
      setSearchMeta(data.searchMeta);
      
    } catch (e) {
      console.error("Search error:", e);
      setErr(
        e.response?.data?.message ||
          `Search failed: ${e.message || "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setIsSearching(false);
    setSearchMeta(null);
    loadMembers();
  };

  return (
    <div className="space-y-6">
      {/* Header + Search + Filters */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Directory</h1>
            <p className="text-sm text-slate-600">
              Browse requesters and reviewers on Get Me Hired.
            </p>
          </div>
        </div>

        {/* AI Search Bar */}
        <form onSubmit={handleSearch} className="relative max-w-2xl">
          <div className="relative">
            <input
              type="text"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              placeholder="Try 'I'm looking for a finance expert to review my resume'..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              🔍
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 ml-1">
            AI-powered search: Describe who you're looking for in natural language.
          </p>
        </form>

        {/* Filters (only show if not searching, or maybe keep them to filter search results? 
            For now, let's hide them during search to avoid confusion as search might override role) 
        */}
        {!isSearching && (
          <div className="flex items-center gap-2">
            <FilterChip
              label="All"
              active={filterRole === "ALL"}
              onClick={() => setFilterRole("ALL")}
            />
            <FilterChip
              label="Requesters"
              active={filterRole === "RQ"}
              onClick={() => setFilterRole("RQ")}
            />
            <FilterChip
              label="Reviewers"
              active={filterRole === "RR"}
              onClick={() => setFilterRole("RR")}
            />
          </div>
        )}
        
        {isSearching && searchMeta && (
          <div className="flex flex-wrap gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span className="font-semibold">AI Filtered by:</span>
            {searchMeta.role && (
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                Role: {roleLabel(searchMeta.role)}
              </span>
            )}
            {searchMeta.keywords?.map((kw, i) => (
              <span key={i} className="bg-white px-2 py-0.5 rounded border border-slate-200">
                "{kw}"
              </span>
            ))}
            {searchMeta.name && (
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                Name: "{searchMeta.name}"
              </span>
            )}
          </div>
        )}
      </section>

      {/* Status messages */}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {loading && <p className="text-sm text-slate-500">Loading members…</p>}

      {/* Cards grid */}
      {!loading && !err && (
        <section>
          {members.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <p className="text-slate-500 font-medium">
                {isSearching ? "No User Matches this search" : "No members found for this filter."}
              </p>
              {isSearching && (
                <button 
                  onClick={clearSearch}
                  className="mt-2 text-sm text-indigo-600 hover:underline"
                >
                  Clear search and show all members
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => (
                <MemberCard
                  key={m.user_id}
                  member={m}
                  currentUserId={user.user_id}
                  onClick={() => navigate(`/members/${m.user_id}`)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        "text-xs px-3 py-1.5 rounded-full border transition " +
        (active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100")
      }
    >
      {label}
    </button>
  );
}

function MemberCard({ member, currentUserId, onClick }) {
  const { user_id, firstName, lastName, user_type, headline, avatar_url } =
    member;
  const isSelf = currentUserId === user_id;

  const avatarSrc =
    avatar_url ||
    "https://api.dicebear.com/7.x/initials/svg?seed=" +
      encodeURIComponent(firstName || "U");

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition p-4 flex gap-3"
    >
      <img
        src={avatarSrc}
        alt={`${firstName} ${lastName}`}
        className="w-12 h-12 rounded-full border border-slate-200 object-cover"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            {firstName} {lastName}
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-white">
            {roleLabel(user_type)}
          </span>
        </div>
        {isSelf && (
          <p className="text-[10px] text-emerald-600 mt-0.5">This is you</p>
        )}
        <p className="mt-1 text-xs text-slate-600 line-clamp-2">
          {headline || "No headline yet."}
        </p>
      </div>
    </button>
  );
}

export default DirectoryPage;
