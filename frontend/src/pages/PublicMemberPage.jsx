// src/pages/PublicMemberPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPublicProfile } from "../api/profile";
import { useAuth } from "../context/AuthContext.jsx";

function formatMonthYear(d) {
  if (!d) return "?";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "?";
  return dt.toLocaleString("en-US", { month: "short", year: "numeric" });
}
function dateRange(start, end, isCurrent) {
  const startStr = formatMonthYear(start);
  const endStr = isCurrent ? "Present" : formatMonthYear(end);
  return `${startStr} – ${endStr}`;
}

function roleLabel(type) {
  if (type === "RQ") return "Requester";
  if (type === "RR") return "Reviewer";
  if (type === "AD") return "Admin";
  return "Unknown";
}

export default function PublicMemberPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();                    // ⬅️ current logged-in user
  const [member, setMember] = useState(null);
  const [profile, setProfile] = useState(null);
  const [education, setEducation] = useState([]);
  const [experience, setExperience] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await getPublicProfile(id);
        setMember(data.user);
        setProfile(data.profile || null);
        setEducation(data.education || []);
        setExperience(data.experience || []);
        setLinks(data.links || []);
        setErr("");
      } catch (e) {
        console.error(e);
        setErr(e.response?.data?.message || "Failed to load member profile");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading profile…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-600">{err}</p>;
  }
  if (!member) {
    return <p className="text-sm text-slate-500">Member not found.</p>;
  }

  const avatarSrc =
    profile?.avatar_url ||
    "https://api.dicebear.com/7.x/initials/svg?seed=" +
      encodeURIComponent(member.firstName || "U");

  // 🔹 Only requesters can send requests, and not to themselves
  const isSelf = user && user.user_id === member.user_id;
  const canRequestReview = user && user.user_type === "RQ" && !isSelf;

  const handleRequestReviewClick = () => {
    const fullName = `${member.firstName} ${member.lastName}`;
    navigate("/review-requests", {
      state: {
        prefillReviewerId: member.user_id,
        prefillReviewerName: fullName,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <img
              src={avatarSrc}
              alt={`${member.firstName} ${member.lastName}`}
              className="w-16 h-16 rounded-full border border-slate-200 object-cover"
            />
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                {member.firstName} {member.lastName}
                <span className="text-xs font-medium text-white bg-emerald-600 px-2 py-0.5 rounded-full">
                  {roleLabel(member.user_type)}
                </span>
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {profile?.headline || "No headline yet."}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {profile?.location || ""}
              </p>

              {/* Links */}
              <div className="flex flex-wrap gap-2 mt-3">
                {links.map((l) => (
                  <a
                    key={l.link_id}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs px-2 py-1 rounded-full bg-slate-900 text-white"
                  >
                    {l.label}
                  </a>
                ))}
                {!links.length &&
                  (profile?.website_url ||
                    profile?.github_url ||
                    profile?.linkedin_url) && (
                    <>
                      {profile.website_url && (
                        <a
                          href={profile.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded-full bg-slate-900 text-white"
                        >
                          Website
                        </a>
                      )}
                      {profile.github_url && (
                        <a
                          href={profile.github_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded-full bg-slate-900 text-white"
                        >
                          GitHub
                        </a>
                      )}
                      {profile.linkedin_url && (
                        <a
                          href={profile.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded-full bg-slate-900 text-white"
                        >
                          LinkedIn
                        </a>
                      )}
                    </>
                  )}
              </div>
            </div>
          </div>

          {/* 🔹 Request review button (only for logged-in requesters, not viewing self) */}
          {canRequestReview && (
            <button
              onClick={handleRequestReviewClick}
              className="text-xs px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
            >
              Request review
            </button>
          )}
        </div>
      </section>

      {/* Summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Summary</h2>
        <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
          {profile?.summary || "No summary available."}
        </p>
      </section>

      {/* Education */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900 mb-2">Education</h2>
        {education.length === 0 ? (
          <p className="text-sm text-slate-500">No education listed.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {education.map((e) => (
              <li key={e.education_id} className="py-2">
                <p className="font-medium text-slate-800">{e.school}</p>
                <p className="text-xs text-slate-600">
                  {e.degree}{" "}
                  {e.field_of_study ? `• ${e.field_of_study}` : ""}
                </p>
                <p className="text-[11px] text-slate-500">
                  {dateRange(
                    e.start_date,
                    e.end_date,
                    !!e.currently_attending
                  )}
                </p>
                {e.description && (
                  <p className="text-[11px] text-slate-600 mt-1">
                    {e.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Experience */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900 mb-2">Experience</h2>
        {experience.length === 0 ? (
          <p className="text-sm text-slate-500">No experience listed.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {experience.map((x) => (
              <li key={x.experience_id} className="py-2">
                <p className="font-medium text-slate-800">
                  {x.title} • {x.company}
                </p>
                <p className="text-xs text-slate-600">
                  {x.employment_type}
                  {x.location ? ` • ${x.location}` : ""}
                </p>
                <p className="text-[11px] text-slate-500">
                  {dateRange(
                    x.start_date,
                    x.end_date,
                    !!x.currently_working
                  )}
                </p>
                {x.description && (
                  <p className="text-[11px] text-slate-600 mt-1">
                    {x.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
