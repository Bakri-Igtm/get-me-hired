import { useEffect, useState } from "react";
import api from "../api/axios.js";
import { getLeaderboard } from "../api/profile.js";
import { useAuth } from "../context/AuthContext.jsx";

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

  // All resumes for this user
  const [resumes, setResumes] = useState([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [resumesError, setResumesError] = useState("");

  // Versions for currently expanded resume
  const [expandedResumeId, setExpandedResumeId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState("");

  // Selected version detail
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [versionContent, setVersionContent] = useState("");
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionError, setVersionError] = useState("");

  // Edit mode
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editingContent, setEditingContent] = useState("");
  const [savingContent, setSavingContent] = useState(false);
  const [saveError, setSaveError] = useState("");

  // AI feedback & human reviews
  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState({ requesters: [], reviewers: [] });
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // ---------------- FETCH RESUMES ----------------
  useEffect(() => {
    const fetchResumes = async () => {
      setResumesLoading(true);
      setResumesError("");
      try {
        const res = await api.get("/api/resumes/mine");
        setResumes(res.data.resumes || []);
      } catch (err) {
        console.error("Error fetching resumes:", err);
        setResumesError(
          err.response?.data?.message || "Could not load your resumes."
        );
      } finally {
        setResumesLoading(false);
      }
    };

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

    fetchResumes();
    fetchLeaderboard();
  }, []);

  // ---------------- HANDLERS: RESUMES & VERSIONS ----------------
  const handleResumeClick = async (resumeId) => {
    if (expandedResumeId === resumeId) {
      // collapse
      setExpandedResumeId(null);
      setVersions([]);
      setSelectedVersion(null);
      setVersionContent("");
      setVersionError("");
      setAiFeedback(null);
      setAiError("");
      setReviews([]);
      return;
    }

    setExpandedResumeId(resumeId);
    setVersions([]);
    setSelectedVersion(null);
    setVersionContent("");
    setVersionError("");
    setAiFeedback(null);
    setAiError("");
    setReviews([]);
    setVersionsLoading(true);
    setVersionsError("");

    try {
      const res = await api.get(`/api/resumes/${resumeId}/versions`);
      setVersions(res.data || []);
    } catch (err) {
      console.error("Error fetching versions:", err);
      setVersionsError(
        err.response?.data?.message ||
          "Could not load versions for this resume."
      );
    } finally {
      setVersionsLoading(false);
    }
  };

  const loadVersionDetails = async (versionId) => {
    setVersionLoading(true);
    setVersionError("");
    setVersionContent("");
    setAiFeedback(null);
    setAiError("");
    setReviews([]);
    setReviewsError("");

    try {
      const [contentRes, feedbackRes, reviewsRes] = await Promise.allSettled([
        api.get(`/api/resumes/content/${versionId}`),
        api.get(`/api/ai-feedback/version/${versionId}`),
        api.get(`/api/reviews/version/${versionId}`),
      ]);

      // Content
      if (
        contentRes.status === "fulfilled" &&
        contentRes.value?.data?.content
      ) {
        setVersionContent(contentRes.value.data.content);
      } else {
        setVersionContent("");
        if (contentRes.status === "rejected") {
          setVersionError(
            contentRes.reason?.response?.data?.message ||
              "Could not load resume content."
          );
        }
      }

      // AI Feedback (optional)
      if (
        feedbackRes.status === "fulfilled" &&
        feedbackRes.value?.data?.feedback
      ) {
        setAiFeedback(feedbackRes.value.data.feedback);
      } else {
        setAiFeedback(null);
      }

      // Human reviews (optional)
      if (
        reviewsRes.status === "fulfilled" &&
        Array.isArray(reviewsRes.value.data)
      ) {
        setReviews(reviewsRes.value.data);
      } else {
        setReviews([]);
      }
    } catch (err) {
      console.error("Error loading version details:", err);
      setVersionError(
        err.response?.data?.message || "Error loading version details."
      );
    } finally {
      setVersionLoading(false);
      setReviewsLoading(false);
      setAiLoading(false);
    }
  };

  const handleVersionClick = async (version) => {
    setSelectedVersion(version);
    setIsEditingContent(false);
    setSaveError("");
    await loadVersionDetails(version.resume_versions_id);
  };

  const handleEditContent = () => {
    setIsEditingContent(true);
    setEditingContent(versionContent);
    setSaveError("");
  };

  const handleCancelEdit = () => {
    setIsEditingContent(false);
    setEditingContent("");
    setSaveError("");
  };

  const handleSaveContent = async () => {
    if (!selectedVersion) return;
    
    setSavingContent(true);
    setSaveError("");
    try {
      await api.patch(`/api/resumes/content/${selectedVersion.resume_versions_id}`, {
        content: editingContent,
      });
      setVersionContent(editingContent);
      setIsEditingContent(false);
      setEditingContent("");
    } catch (err) {
      console.error("Error saving content:", err);
      setSaveError(
        err.response?.data?.message || "Error saving content."
      );
    } finally {
      setSavingContent(false);
    }
  };

  // ---------------- HANDLERS: AI FEEDBACK ----------------
  const handleGenerateFeedback = async () => {
    if (!selectedVersion) return;

    setAiLoading(true);
    setAiError("");
    try {
      const res = await api.post("/api/ai-feedback/generate", {
        resumeVersionsId: selectedVersion.resume_versions_id,
      });
        setAiFeedback(res.data.feedback);
    } catch (err) {
      console.error("Error generating AI feedback:", err);
      setAiError(
        err.response?.data?.message || "Error generating AI feedback."
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleReloadComments = async () => {
    if (!selectedVersion) return;
    await loadVersionDetails(selectedVersion.resume_versions_id);
  };

  // ---------------- UI ----------------
  return (
    <div className="mt-6">
      Greeting
      <section className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          Hey {user.firstName} 👋
        </h1>
        <p className="text-sm text-slate-600">
          You&apos;re logged in as{" "}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 text-slate-50 text-xs font-medium">
            {userTypeLabel}
          </span>
        </p>
      </section>

      {/* 2-column grid: Left (account + leaderboard) / Right (resumes + detail) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* LEFT COLUMN — Account + Leaderboard */}
        <div className="lg:col-span-1 lg:sticky lg:top-20">
          <div className="space-y-6 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-4">
            {/* Account card */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h2 className="font-semibold text-slate-900 mb-2">Account</h2>
              <p className="text-xs text-slate-500 mb-1">
                Name:{" "}
                <span className="font-medium">
                  {user.firstName} {user.lastName}
                </span>
              </p>
              <p className="text-xs text-slate-500 mb-1">
                Email: <span className="font-mono">{user.email}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-2">
                We&apos;ll expand this later with profile details, badges, and stats.
              </p>
            </section>

            {/* Leaderboard card */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h2 className="font-semibold text-slate-900 mb-2">Leaderboard</h2>
              <p className="text-xs text-slate-500 mb-2">
                Top contributors in the community.
              </p>
              
              {leaderboardLoading ? (
                <p className="text-xs text-slate-500">Loading leaderboard...</p>
              ) : (
                <div className="space-y-4">
                  {leaderboard.requesters && leaderboard.requesters.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Top Requesters</h3>
                      <ul className="space-y-1">
                        {leaderboard.requesters.map((u, i) => (
                          <li key={u.user_id} className="flex justify-between text-xs text-slate-600">
                            <span>{i + 1}. {u.user_fname} {u.user_lname}</span>
                            <span className="font-mono font-medium text-slate-900">{u.points} pts</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {leaderboard.reviewers && leaderboard.reviewers.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Top Reviewers</h3>
                      <ul className="space-y-1">
                        {leaderboard.reviewers.map((u, i) => (
                          <li key={u.user_id} className="flex justify-between text-xs text-slate-600">
                            <span>{i + 1}. {u.user_fname} {u.user_lname}</span>
                            <span className="font-mono font-medium text-slate-900">{u.points} pts</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(!leaderboard.requesters?.length && !leaderboard.reviewers?.length) && (
                     <p className="text-xs text-slate-400 italic">No leaderboard data available yet.</p>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* RIGHT COLUMN — Version detail (No more resumes list) */}
        <div className="space-y-6">
          {/* Version detail: content + feedback + comments */}
          {selectedVersion && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Resume Version Detail
                  </h2>
                  <p className="text-xs text-slate-500">
                    Viewing version {selectedVersion.version_name || `Version ${selectedVersion.version_number}`} (
                    {selectedVersion.resume_versions_id})
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleGenerateFeedback}
                    disabled={aiLoading}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {aiLoading ? "Working..." : "Generate AI feedback"}
                  </button>
                  <button
                    onClick={handleReloadComments}
                    disabled={versionLoading}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    Reload content & comments
                  </button>
                </div>
              </div>

              {/* CONTENT */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                  Resume content
                </h3>
                {versionLoading ? (
                  <p className="text-sm text-slate-500">Loading content...</p>
                ) : versionError ? (
                  <p className="text-sm text-red-500">{versionError}</p>
                ) : (
                  <div>
                    {isEditingContent ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          className="w-full h-64 p-3 border border-slate-300 rounded-md font-mono text-xs"
                          placeholder="Edit resume content..."
                        />
                        {saveError && (
                          <p className="text-xs text-red-500">{saveError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveContent}
                            disabled={savingContent}
                            className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {savingContent ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={savingContent}
                            className="px-3 py-1.5 text-xs rounded bg-slate-300 text-slate-700 hover:bg-slate-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="border border-slate-200 rounded-md bg-slate-50 max-h-64 overflow-y-auto p-3">
                          {versionContent ? (
                            <pre className="whitespace-pre-wrap break-words text-xs text-slate-800 font-mono">
                              {versionContent}
                            </pre>
                          ) : (
                            <p className="text-xs text-slate-500">
                              No content stored for this version.
                            </p>
                          )}
                        </div>
                        <button
                          onClick={handleEditContent}
                          className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Edit Content
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* FEEDBACK & COMMENTS */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Feedback & comments
                </h3>

                {aiError && (
                  <p className="text-xs text-red-500 mb-2">{aiError}</p>
                )}

                {/* AI feedback as first comment */}
                {aiFeedback && (
                  <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-emerald-700">
                        AI Feedback
                      </span>
                      {typeof aiFeedback?.summary?.score === "number" && (
                        <span className="text-[11px] font-mono text-emerald-700">
                          Score: {aiFeedback.summary.score}/100
                        </span>
                      )}
                    </div>
                    <p className="text-slate-800 mb-2">
                      {aiFeedback.summary?.overall}
                    </p>
                  </div>
                )}

                {/* Human reviews */}
                <div className="space-y-2">
                  {reviewsLoading ? (
                    <p className="text-xs text-slate-500">
                      Loading reviews...
                    </p>
                  ) : reviewsError ? (
                    <p className="text-xs text-red-500">{reviewsError}</p>
                  ) : reviews.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No human reviews yet.
                    </p>
                  ) : (
                    reviews.map((rev) => (
                      <div
                        key={rev.review_id}
                        className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">
                              {rev.reviewer_name || "Reviewer"}
                            </span>
                            {rev.user_type && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-slate-900 text-slate-50">
                                {rev.user_type}
                              </span>
                            )}
                          </div>
                          {typeof rev.review_rating === "number" && (
                            <span className="text-[11px] text-amber-600">
                              ★ {rev.review_rating}/5
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-700">
                          {rev.comment_text || rev.review_comment}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
