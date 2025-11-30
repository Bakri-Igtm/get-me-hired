import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { Shield, Award, Medal, Star, Trophy, Target, Crown, Zap } from "lucide-react";
import {
  getMyProfile,
  saveProfile,
  addEducation,
  deleteEducation,
  addExperience,
  deleteExperience,
  addLink,
  deleteLink,
} from "../api/profile";

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

function formatMonthYear(d) {
  if (!d) return "?";
  // Accepts "YYYY-MM-DD" or ISO strings
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "?";
  return dt.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function dateRange(start, end, isCurrent) {
  const startStr = formatMonthYear(start);
  const endStr = isCurrent ? "Present" : formatMonthYear(end);
  return `${startStr} – ${endStr}`;
}


export default function ProfilePage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // core profile (headline + links + avatar/location)
  const [core, setCore] = useState({
    headline: "",
    location: "",
    avatar_url: "",
    website_url: "",
    github_url: "",
    linkedin_url: "",
  });

  // summary is now its own card
  const [summary, setSummary] = useState("");

  // collections
  const [education, setEducation] = useState([]);
  const [experience, setExperience] = useState([]);
  const [links, setLinks] = useState([]);
  const [badges, setBadges] = useState([]);

  // toggles for “add” questionnaires
  const [showEditCore, setShowEditCore] = useState(false); // edit headline/links
  const [showAddLink, setShowAddLink] = useState(false);
  const [showAddEdu, setShowAddEdu] = useState(false);
  const [showAddExp, setShowAddExp] = useState(false);
  const [showEditSummary, setShowEditSummary] = useState(false);

  // draft states for add forms
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });

  const [eduDraft, setEduDraft] = useState({
    school: "",
    degree: "",
    field_of_study: "",
    start_date: "",
    end_date: "",
    currently_attending: 0,
    description: "",
  });

  const [expDraft, setExpDraft] = useState({
    title: "",
    company: "",
    employment_type: "Internship",
    location: "",
    start_date: "",
    end_date: "",
    currently_working: 0,
    description: "",
  });

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await getMyProfile();
        const p = data.profile || {};
        setCore({
          headline: p.headline || "",
          location: p.location || "",
          avatar_url: p.avatar_url || "",
          website_url: p.website_url || "",
          github_url: p.github_url || "",
          linkedin_url: p.linkedin_url || "",
        });
        setSummary(p.summary || "");
        setEducation(data.education || []);
        setExperience(data.experience || []);
        setLinks(data.links || []);
        setBadges(data.badges || []);
        setErr("");
      } catch (e) {
        console.error(e);
        setErr(e.response?.data?.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Save only the core (headline/location/avatar/links live in core table).
  const handleSaveCore = async () => {
    try {
      await saveProfile({ ...core, summary }); // summary stored in same table, but edited in its own card
      setShowEditCore(false);
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.message || "Error saving profile");
    }
  };

  // Save only the summary (own card, but same endpoint)
  const handleSaveSummary = async () => {
    try {
      await saveProfile({ ...core, summary });
      setShowEditSummary(false);
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.message || "Error saving summary");
    }
  };

  // Links
  const handleAddLink = async () => {
    if (!linkDraft.label || !linkDraft.url) return;
    try {
      const { data } = await addLink(linkDraft);
      setLinks([{ ...linkDraft, link_id: data.link_id }, ...links]);
      setLinkDraft({ label: "", url: "" });
      setShowAddLink(false);
    } catch {
      alert("Error adding link");
    }
  };
  const handleDelLink = async (id) => {
    try {
      await deleteLink(id);
      setLinks(links.filter((l) => l.link_id !== id));
    } catch {
      alert("Error deleting link");
    }
  };

  // Education
  const handleAddEdu = async () => {
    if (!eduDraft.school) return;
    try {
      const { data } = await addEducation(eduDraft);
      setEducation([{ ...eduDraft, education_id: data.education_id }, ...education]);
      setEduDraft({
        school: "",
        degree: "",
        field_of_study: "",
        start_date: "",
        end_date: "",
        currently_attending: 0,
        description: "",
      });
      setShowAddEdu(false);
    } catch {
      alert("Error adding education");
    }
  };
  const handleDelEdu = async (id) => {
    try {
      await deleteEducation(id);
      setEducation(education.filter((e) => e.education_id !== id));
    } catch {
      alert("Error deleting education");
    }
  };

  // Experience
  const handleAddExp = async () => {
    if (!expDraft.title || !expDraft.company) return;
    try {
      const { data } = await addExperience(expDraft);
      setExperience([{ ...expDraft, experience_id: data.experience_id }, ...experience]);
      setExpDraft({
        title: "",
        company: "",
        employment_type: "Internship",
        location: "",
        start_date: "",
        end_date: "",
        currently_working: 0,
        description: "",
      });
      setShowAddExp(false);
    } catch {
      alert("Error adding experience");
    }
  };
  const handleDelExp = async (id) => {
    try {
      await deleteExperience(id);
      setExperience(experience.filter((x) => x.experience_id !== id));
    } catch {
      alert("Error deleting experience");
    }
  };

  return (
    <div className="space-y-6">
      {/* CORE CARD: Avatar, Name, Headline, Location, Links — forms hidden until "Edit" / "+ Add" */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start gap-4">
          <img
            src={
              core.avatar_url ||
              "https://api.dicebear.com/7.x/initials/svg?seed=" +
                encodeURIComponent(user.firstName || "U")
            }
            alt="avatar"
            className="w-16 h-16 rounded-full border border-slate-200 object-cover"
          />
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            {user.firstName} {user.lastName}
            {user.user_type && (
                <span className="text-xs font-medium text-white bg-emerald-600 px-2 py-0.5 rounded-full capitalize">
                {user.user_type === "RQ"
                    ? "Requester"
                    : user.user_type === "RR"
                    ? "Reviewer"
                    : user.user_type === "AD"
                    ? "Admin"
                    : user.user_type}
                </span>
            )}
            {badges.map((badge, idx) => {
                const Icon = BADGE_ICONS[badge.badge_name] || Shield;
                return (
                  <div key={idx} className="flex items-center gap-1 bg-amber-50 border border-amber-100 text-amber-700 rounded-full px-2 py-0.5" title={badge.category}>
                    <Icon className="w-3 h-3" />
                    <span className="text-[10px] font-bold">{badge.badge_name}</span>
                  </div>
                );
            })}
            </h1>


            <p className="text-sm text-slate-600 mt-1">
              {core.headline || "Add a headline"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {core.location || "Add a location"}
            </p>

            {/* Links list */}
            <div className="flex flex-wrap gap-2 mt-3">
              {links.length > 0 ? (
                links.map((l) => (
                  <div
                    key={l.link_id}
                    className="flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-slate-900 text-white"
                  >
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {l.label}
                    </a>
                    <button
                      className="text-[10px] opacity-80 hover:opacity-100"
                      onClick={() => handleDelLink(l.link_id)}
                    >
                      ✕
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">No links yet.</p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowEditCore((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800"
              >
                {showEditCore ? "Close editor" : "Edit headline & details"}
              </button>
              <button
                onClick={() => setShowAddLink(true)}
                className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              >
                + Add link
              </button>
            </div>
          </div>
        </div>

        {/* Edit Headline/Location/Avatar (form only when toggled) */}
        {showEditCore && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Headline</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={core.headline}
                onChange={(e) => setCore({ ...core, headline: e.target.value })}
                placeholder="e.g., SWE Intern @ LinkedIn | Cryptography & AI"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Location</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={core.location}
                onChange={(e) => setCore({ ...core, location: e.target.value })}
                placeholder="City, Country"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Avatar URL</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={core.avatar_url}
                onChange={(e) => setCore({ ...core, avatar_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Website URL</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={core.website_url}
                onChange={(e) => setCore({ ...core, website_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">GitHub URL</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={core.github_url}
                onChange={(e) => setCore({ ...core, github_url: e.target.value })}
                placeholder="https://github.com/..."
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">LinkedIn URL</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={core.linkedin_url}
                onChange={(e) => setCore({ ...core, linkedin_url: e.target.value })}
                placeholder="https://linkedin.com/in/..."
              />
            </div>

            <div className="md:col-span-3">
              <button
                onClick={handleSaveCore}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800"
              >
                Save details
              </button>
            </div>
          </div>
        )}

        {/* Add Link form (only when +Add link is clicked) */}
        {showAddLink && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Link label</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={linkDraft.label}
                onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })}
                placeholder="Portfolio / Blog / Twitter"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-slate-600 mb-1">URL</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={linkDraft.url}
                onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="md:col-span-3 flex gap-2">
              <button
                onClick={handleAddLink}
                className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Add link
              </button>
              <button
                onClick={() => setShowAddLink(false)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* SUMMARY — its own card */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Summary</h2>
            {!showEditSummary && (
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                {summary || "No summary yet."}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowEditSummary((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800"
          >
            {showEditSummary ? "Close editor" : "Edit"}
          </button>
        </div>

        {showEditSummary && (
          <div className="mt-3">
            <label className="block text-[11px] text-slate-600 mb-1">Summary</label>
            <textarea
              className="w-full border border-slate-300 rounded px-2 py-1 text-xs min-h-[100px]"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Tell us about yourself..."
            />
            <div className="mt-2">
              <button
                onClick={handleSaveSummary}
                className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Save summary
              </button>
            </div>
          </div>
        )}
      </section>

      {/* EDUCATION */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900">Education</h2>
          <button
            onClick={() => setShowAddEdu(true)}
            className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
          >
            + Add
          </button>
        </div>

        {/* Empty state with add button only */}
        {education.length === 0 && !showAddEdu && (
          <div className="border border-dashed border-slate-300 rounded-lg p-4 text-sm text-slate-500 bg-slate-50">
            No education yet.
          </div>
        )}

        {/* Add form only after clicking + Add */}
        {showAddEdu && (
          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">School</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={eduDraft.school}
                onChange={(e) => setEduDraft({ ...eduDraft, school: e.target.value })}
                placeholder="Institution name"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Degree</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={eduDraft.degree}
                onChange={(e) => setEduDraft({ ...eduDraft, degree: e.target.value })}
                placeholder="B.S., M.S., etc."
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Field of Study</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={eduDraft.field_of_study}
                onChange={(e) =>
                  setEduDraft({ ...eduDraft, field_of_study: e.target.value })
                }
                placeholder="Computer Science"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Start date</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={eduDraft.start_date}
                onChange={(e) => setEduDraft({ ...eduDraft, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">End date</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={eduDraft.end_date}
                onChange={(e) => setEduDraft({ ...eduDraft, end_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                Currently attending (0/1)
              </label>
              <input
                type="number"
                min="0"
                max="1"
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={eduDraft.currently_attending}
                onChange={(e) =>
                  setEduDraft({ ...eduDraft, currently_attending: Number(e.target.value || 0) })
                }
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] text-slate-600 mb-1">Description</label>
              <textarea
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs min-h-[80px]"
                value={eduDraft.description}
                onChange={(e) => setEduDraft({ ...eduDraft, description: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="md:col-span-3 flex gap-2">
              <button
                onClick={handleAddEdu}
                className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Add education
              </button>
              <button
                onClick={() => setShowAddEdu(false)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List existing entries */}
        <ul className="divide-y divide-slate-100">
          {education.map((e) => (
            <li key={e.education_id} className="py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">{e.school}</p>
                  <p className="text-xs text-slate-600">
                    {e.degree} {e.field_of_study ? `• ${e.field_of_study}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {dateRange(e.start_date, e.end_date, !!e.currently_attending)}
                  </p>
                  {e.description && (
                    <p className="text-[11px] text-slate-600 mt-1">{e.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelEdu(e.education_id)}
                  className="text-xs text-red-600"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* EXPERIENCE */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900">Experience</h2>
          <button
            onClick={() => setShowAddExp(true)}
            className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
          >
            + Add
          </button>
        </div>

        {/* Empty state with add button only */}
        {experience.length === 0 && !showAddExp && (
          <div className="border border-dashed border-slate-300 rounded-lg p-4 text-sm text-slate-500 bg-slate-50">
            No experience yet.
          </div>
        )}

        {/* Add form only after clicking + Add */}
        {showAddExp && (
          <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Title</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={expDraft.title}
                onChange={(e) => setExpDraft({ ...expDraft, title: e.target.value })}
                placeholder="Software Engineer"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Company</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={expDraft.company}
                onChange={(e) => setExpDraft({ ...expDraft, company: e.target.value })}
                placeholder="LinkedIn"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Location</label>
              <input
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={expDraft.location}
                onChange={(e) => setExpDraft({ ...expDraft, location: e.target.value })}
                placeholder="City, Country"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Employment type</label>
              <select
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={expDraft.employment_type}
                onChange={(e) => setExpDraft({ ...expDraft, employment_type: e.target.value })}
              >
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Internship</option>
                <option>Contract</option>
                <option>Freelance</option>
                <option>Self-employed</option>
                <option>Temporary</option>
                <option>Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Start date</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={expDraft.start_date}
                onChange={(e) => setExpDraft({ ...expDraft, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">End date</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={expDraft.end_date}
                onChange={(e) => setExpDraft({ ...expDraft, end_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                Currently working (0/1)
              </label>
              <input
                type="number"
                min="0"
                max="1"
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                value={expDraft.currently_working}
                onChange={(e) =>
                  setExpDraft({ ...expDraft, currently_working: Number(e.target.value || 0) })
                }
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-[11px] text-slate-600 mb-1">Description</label>
              <textarea
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs min-h-[80px]"
                value={expDraft.description}
                onChange={(e) => setExpDraft({ ...expDraft, description: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="md:col-span-4 flex gap-2">
              <button
                onClick={handleAddExp}
                className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Add experience
              </button>
              <button
                onClick={() => setShowAddExp(false)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List existing entries */}
        <ul className="divide-y divide-slate-100">
          {experience.map((x) => (
            <li key={x.experience_id} className="py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">
                    {x.title} • {x.company}
                  </p>
                  <p className="text-xs text-slate-600">
                    {x.employment_type}
                    {x.location ? ` • ${x.location}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {dateRange(x.start_date, x.end_date, !!x.currently_working)}
                  </p>
                  {x.description && (
                    <p className="text-[11px] text-slate-600 mt-1">{x.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelExp(x.experience_id)}
                  className="text-xs text-red-600"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
    </div>
  );
}
