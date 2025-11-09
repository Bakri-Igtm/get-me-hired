import { useEffect, useState } from "react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function DashboardPage() {
  const { user } = useAuth();

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

  // AI feedback & human reviews
  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");

  // ---------------- FETCH RESUMES ----------------
  useEffect(() => {
    const fetchResumes = async () => {
      setResumesLoading(true);
      setResumesError("");
      try {
        const res = await api.get("/api/resumes/mine");
        setResumes(res.data || []);
      } catch (err) {
        console.error("Error fetching resumes:", err);
        setResumesError(
          err.response?.data?.message || "Could not load your resumes."
        );
      } finally {
        setResumesLoading(false);
      }
    };

    fetchResumes();
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
        api.get(`/api/resume-versions/${versionId}`),
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
      if (reviewsRes.status === "fulfilled" && Array.isArray(reviewsRes.value.data)) {
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
    await loadVersionDetails(version.resume_versions_id);
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
      {/* Greeting */}
      <section className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          Hey {user.firstName} 👋
        </h1>
        <p className="text-sm text-slate-600">
          You&apos;re logged in as{" "}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 text-slate-50 text-xs font-medium">
            {user.userType === "RQ"
              ? "Requester"
              : user.userType === "RR"
              ? "Reviewer"
              : "Admin"}
          </span>
        </p>
      </section>

      {/* 2-column grid: Account (left) / Resumes+Detail (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* LEFT COLUMN — Account info */}
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm md:sticky md:top-20">
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
            <p className="text-xs text-slate-500 mb-1">
              User ID: <span className="font-mono">{user.userId}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              We&apos;ll expand this later with profile details, badges, and
              stats.
            </p>
          </section>
        </div>

        {/* RIGHT COLUMN — Resumes + Version detail */}
        <div className="space-y-6">
          {/* My Resumes list */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h2 className="font-semibold text-slate-900 mb-1">My Resumes</h2>
            <p className="text-xs text-slate-500 mb-3">
              Click a resume to expand and see its versions. Click a version to
              view its content, AI feedback, and reviews.
            </p>

            {resumesLoading ? (
              <p className="text-sm text-slate-500">Loading resumes...</p>
            ) : resumesError ? (
              <p className="text-sm text-red-500">{resumesError}</p>
            ) : resumes.length === 0 ? (
              <p className="text-sm text-slate-500">
                You don&apos;t have any resumes yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {resumes.map((resume) => (
                  <li
                    key={resume.resume_id}
                    className={`py-3 px-2 rounded-md transition-all duration-200 cursor-pointer ${
                      expandedResumeId === resume.resume_id
                        ? "bg-slate-50 shadow-sm"
                        : "hover:bg-slate-50"
                    }`}
                    onClick={() => handleResumeClick(resume.resume_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {resume.track || "Untitled resume"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Resume ID:{" "}
                          <span className="font-mono">{resume.resume_id}</span>
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        Created{" "}
                        {new Date(resume.created_at).toLocaleDateString("en-US")}
                      </span>
                    </div>

                    {/* Versions */}
                    {expandedResumeId === resume.resume_id && (
                      <div
                        className="mt-3 border-t border-slate-200 pt-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {versionsLoading ? (
                          <p className="text-xs text-slate-500">
                            Loading versions...
                          </p>
                        ) : versionsError ? (
                          <p className="text-xs text-red-500">
                            {versionsError}
                          </p>
                        ) : versions.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            No versions yet for this resume.
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {versions.map((v) => (
                              <li
                                key={v.resume_versions_id}
                                className={`flex items-center justify-between rounded-md px-2 py-1 text-xs border border-transparent hover:border-slate-300 cursor-pointer transition-all duration-150 ${
                                  selectedVersion &&
                                  selectedVersion.resume_versions_id ===
                                    v.resume_versions_id
                                    ? "bg-slate-900 text-slate-50"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                                onClick={() => handleVersionClick(v)}
                              >
                                <div>
                                  <span className="font-mono mr-1">
                                    v{v.version_number}
                                  </span>
                                  <span className="text-slate-400">
                                    ({v.resume_versions_id})
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  {v.content_length || 0} chars
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Version detail: content + feedback + comments */}
          {selectedVersion && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Resume Version Detail
                  </h2>
                  <p className="text-xs text-slate-500">
                    Viewing version v{selectedVersion.version_number} (
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
