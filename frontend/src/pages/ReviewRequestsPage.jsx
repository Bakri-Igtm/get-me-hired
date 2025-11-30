// src/pages/ReviewRequestsPage.jsx
import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ResumeEditor from "../components/ResumeEditor.jsx";
import api from "../api/axios.js";
import {
  fetchIncomingRequests,
  fetchOutgoingRequests,
  fetchRequestDetail,
  submitReview,
  createReviewRequest,
  respondToRequest,
} from "../api/reviewRequests";
import {
  fetchReviewComments,
  addReviewComment,
} from "../api/reviewComments";
import { fetchMembers } from "../api/directory";
import { fetchMyResumeVersions, uploadResumeFile } from "../api/resumes";
import html2pdf from "html2pdf.js";

function roleLabel(type) {
  if (type === "RQ") return "Requester";
  if (type === "RR") return "Reviewer";
  if (type === "AD") return "Admin";
  return "Unknown";
}

function formatDate(d) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReviewRequestsPage() {
  const { user } = useAuth();
  const location = useLocation();

  const [requests, setRequests] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");

  // new review form
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // comments per review
  const [expandedReviewId, setExpandedReviewId] = useState(null);
  const [commentsByReview, setCommentsByReview] = useState({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // accept / decline
  const [responding, setResponding] = useState(false);

  // New Request UI state
  const [showNewRequestForm, setShowNewRequestForm] = useState(false);
  const [visibility, setVisibility] = useState("private"); // "private" | "public"
  const [reviewerOptions, setReviewerOptions] = useState([]);
  const [reviewerOptionsLoading, setReviewerOptionsLoading] = useState(false);
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState(null);
  const [newTrack, setNewTrack] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newFile, setNewFile] = useState(null);
  const [formError, setFormError] = useState("");
  
  // Toggle between selecting existing version vs uploading new file
  const [resumeMode, setResumeMode] = useState("select"); // "select" | "upload"
  const [uploadedFileContent, setUploadedFileContent] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // ask AI feedback?
  const [aiRequested, setAiRequested] = useState(true);

  // your resume versions
  const [myVersions, setMyVersions] = useState([]);
  const [myVersionsLoading, setMyVersionsLoading] = useState(false);
  const [selectedResumeVersionId, setSelectedResumeVersionId] =
    useState(null);
  const [myResumeMeta, setMyResumeMeta] = useState(null); // { track, resumeId, ... }

  // tab: "received" or "sent"
  const [activeTab, setActiveTab] = useState("received");

  // filter under "received": all/private/public
  const [visibilityFilter, setVisibilityFilter] = useState("all");

  // outgoing requests (sent BY me)
  const [sentRequests, setSentRequests] = useState([]);
  const [loadingSent, setLoadingSent] = useState(false);
  const [sentError, setSentError] = useState("");
  
  // Track if we've loaded outgoing requests to prevent infinite loop
  const outgoingLoadedRef = useRef(false);

  const loadIncoming = async () => {
    try {
      setLoadingList(true);
      const { data } = await fetchIncomingRequests();
      setRequests(data.requests || []);
      setListError("");
      if (data.requests && data.requests.length > 0) {
        setSelectedId((prev) => prev ?? data.requests[0].request_id);
      }
    } catch (e) {
      console.error("fetchIncomingRequests error:", e);
      setListError(
        e.response?.data?.message ||
          `Failed to load review requests: ${e.message || "Unknown error"}`
      );
    } finally {
      setLoadingList(false);
    }
  };

  const loadOutgoing = async () => {
    try {
      setLoadingSent(true);
      const { data } = await fetchOutgoingRequests();
      setSentRequests(data.requests || []);
      setSentError("");
    } catch (e) {
      console.error("fetchOutgoingRequests error:", e);
      setSentError(
        e.response?.data?.message ||
          `Failed to load sent review requests: ${e.message || "Unknown error"}`
      );
    } finally {
      setLoadingSent(false);
    }
  };

  useEffect(() => {
    loadIncoming();
  }, []);

  useEffect(() => {
    if (activeTab === "sent" && !outgoingLoadedRef.current && !loadingSent) {
      outgoingLoadedRef.current = true;
      loadOutgoing();
    } else if (activeTab !== "sent") {
      // Reset when switching away from "sent" tab
      outgoingLoadedRef.current = false;
    }
  }, [activeTab, loadingSent]);

  // Load detail when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    (async () => {
      try {
        setLoadingDetail(true);
        const { data } = await fetchRequestDetail(selectedId);
        setDetail(data);
        setDetailError("");
        setShowReviewForm(false);
        setReviewRating(5);
        setReviewComment("");
        setExpandedReviewId(null);
        setCommentsByReview({});
      } catch (e) {
        console.error("fetchRequestDetail error:", e);
        setDetailError(
          e.response?.data?.message ||
            `Failed to load request detail: ${e.message || "Unknown error"}`
        );
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [selectedId]);

  const handleSelect = (id) => {
    setSelectedId(id);
  };

  const handleSubmitReview = async () => {
    if (!detail?.request) return;
    if (!reviewComment.trim()) {
      alert("Please add some feedback.");
      return;
    }
    try {
      setReviewSubmitting(true);
      await submitReview({
        resumeVersionsId: detail.request.resume_versions_id,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setShowReviewForm(false);
      setReviewComment("");
      const { data } = await fetchRequestDetail(detail.request.request_id);
      setDetail(data);
    } catch (e) {
      console.error("submitReview error:", e);
      alert(
        e.response?.data?.message ||
          e.message ||
          "Error submitting review"
      );
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleExpandReview = async (review) => {
    const id = review.review_id;
    if (expandedReviewId === id) {
      setExpandedReviewId(null);
      return;
    }

    setExpandedReviewId(id);
    if (commentsByReview[id]) return; // already loaded

    try {
      setCommentsLoading(true);
      const { data } = await fetchReviewComments(id);
      setCommentsByReview((prev) => ({
        ...prev,
        [id]: data.comments || [],
      }));
    } catch (e) {
      console.error("fetchReviewComments error:", e);
      alert(
        e.response?.data?.message ||
          e.message ||
          "Error loading comments"
      );
    } finally {
      setCommentsLoading(false);
    }
  };

  const canCommentOnReview = (review) => {
    if (!detail) return false;
    const isRequester = detail.isRequester;
    const isReviewAuthor = user.user_id === review.reviewer_id;
    return isRequester || isReviewAuthor;
  };

  const handleSubmitComment = async () => {
    if (!expandedReviewId || !commentDraft.trim()) return;
    try {
      setCommentSubmitting(true);
      await addReviewComment(expandedReviewId, commentDraft.trim());
      const { data } = await fetchReviewComments(expandedReviewId);
      setCommentsByReview((prev) => ({
        ...prev,
        [expandedReviewId]: data.comments || [],
      }));
      setCommentDraft("");
    } catch (e) {
      console.error("addReviewComment error:", e);
      alert(
        e.response?.data?.message ||
          e.message ||
          "Error adding comment"
      );
    } finally {
      setCommentSubmitting(false);
    }
  };

  // Accept / Decline
  const handleRespond = async (status) => {
    if (!detail?.request) return;
    try {
      setResponding(true);
      await respondToRequest(detail.request.request_id, status);

      // refresh detail + incoming list
      const [detailResp, listResp] = await Promise.all([
        fetchRequestDetail(detail.request.request_id),
        fetchIncomingRequests(),
      ]);

      setDetail(detailResp.data);
      setRequests(listResp.data.requests || []);
      setDetailError("");
      setListError("");
    } catch (e) {
      console.error("respondToRequest error:", e);
      alert(
        e.response?.data?.message ||
          e.message ||
          "Error updating request status"
      );
    } finally {
      setResponding(false);
    }
  };

  // Open "Request review" form
  const handleOpenNewRequestForm = async (
    prefillReviewerId = null,
    prefillReviewerName = ""
  ) => {
    setShowNewRequestForm(true);
    setVisibility("private");
    setReviewerSearch(prefillReviewerName || "");
    setSelectedReviewerId(prefillReviewerId);
    setNewTrack("");
    setNewNote("");
    setNewFile(null);
    setSelectedResumeVersionId(null);
    setFormError("");
    setAiRequested(true); // default: ask AI
    setResumeMode("select"); // default: select existing version
    setUploadedFileContent(null);

    // Load potential reviewers (directory)
    if (!reviewerOptions.length) {
      try {
        setReviewerOptionsLoading(true);
        const { data } = await fetchMembers();
        setReviewerOptions(data.members || []);
      } catch (e) {
        console.error("fetchMembers error:", e);
      } finally {
        setReviewerOptionsLoading(false);
      }
    }

    // Load your resume versions
    try {
      setMyVersionsLoading(true);
      const { data } = await fetchMyResumeVersions();
      setMyVersions(data.versions || []);
      // optionally set myResumeMeta if backend sends it
      // setMyResumeMeta({ ... })
    } catch (e) {
      console.error("fetchMyResumeVersions error:", e);
    } finally {
      setMyVersionsLoading(false);
    }
  };

  const handleCloseNewRequestForm = () => {
    setShowNewRequestForm(false);
  };

  // Actually send the request
  const handleSubmitNewRequest = async () => {
    // Validate based on mode
    if (resumeMode === "select" && !selectedResumeVersionId) {
      setFormError("Please select a resume version.");
      return;
    }
    
    if (resumeMode === "upload") {
      if (!uploadedFileContent) {
        setFormError("Please upload and preview a resume file.");
        return;
      }
      if (!newTrack.trim()) {
        setFormError("Please enter a track/role focus for the new resume.");
        return;
      }
    }

    if (visibility === "private" && !selectedReviewerId) {
      setFormError("Please choose a reviewer for a private request.");
      return;
    }

    setFormError("");

    try {
      // If uploading new file, create new resume first
      let versionIdToUse = selectedResumeVersionId;
      
      if (resumeMode === "upload" && uploadedFileContent) {
        console.log("Creating new resume from uploaded file...");
        // Upload file (or edited HTML content) as new resume
        const formData = new FormData();
        formData.append("mode", "new");
        formData.append("trackTitle", newTrack.trim());
        formData.append("versionLabel", "Version 1");
        // If the user edited the uploaded content, send that as a text file so
        // the backend will store the HTML string in the content column.
        if (uploadedFileContent) {
          const blob = new Blob([uploadedFileContent], { type: "text/plain" });
          const fileFromContent = new File([blob], (newFile && newFile.name) || "resume_content.txt", { type: "text/plain" });
          formData.append("file", fileFromContent);
        } else {
          formData.append("file", newFile);
        }

        const { data } = await uploadResumeFile(formData);
        // Get the version ID from response
        if (data.resume && data.resume.versions && data.resume.versions[0]) {
          versionIdToUse = data.resume.versions[0].resume_versions_id;
        } else {
          throw new Error("Failed to create resume");
        }
      }
      
      await createReviewRequest({
        resumeVersionsId: versionIdToUse,
        reviewerId: visibility === "private" ? selectedReviewerId : null,
        visibility, // 'public' or 'private'
        track: newTrack || null, // e.g. "SWE"
        requestNote: newNote || null,
        aiRequested, // send to backend
      });

      alert("Review request sent!");
      setShowNewRequestForm(false);
    } catch (e) {
      console.error("createReviewRequest error:", e);
      setFormError(
        e.response?.data?.message ||
          e.message ||
          "Error sending review request"
      );
    }
  };

  // filter reviewer list locally
  const filteredReviewers = reviewerOptions
    .filter((m) => {
      if (!reviewerSearch.trim()) return true;
      const q = reviewerSearch.toLowerCase();
      const fullName = `${m.firstName || ""} ${
        m.lastName || ""
      }`.toLowerCase();
      return (
        fullName.includes(q) ||
        (m.headline || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 10);

  // Prefill from public profile
  useEffect(() => {
    const prefillId = location.state?.prefillReviewerId;
    const prefillName = location.state?.prefillReviewerName;

    if (user?.user_type === "RQ" && prefillId) {
      handleOpenNewRequestForm(prefillId, prefillName || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, user]);

  // Filter received requests by visibility
  const filteredReceived = requests.filter((req) => {
    if (visibilityFilter === "all") return true;
    if (visibilityFilter === "private") return req.visibility === "private";
    if (visibilityFilter === "public") return req.visibility === "public";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">
            Review Requests
          </h1>
          <p className="text-sm text-slate-600">
            See requests sent to you, requests you've sent, and drop
            detailed feedback.
          </p>

          {/* Tabs: Received / Sent - Only for Requesters */}
          {user?.user_type !== "RR" && (
            <div className="inline-flex mt-2 rounded-full border border-slate-200 bg-slate-50 p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("received")}
                className={
                  "px-3 py-1 rounded-full " +
                  (activeTab === "received"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100")
                }
              >
                Received
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("sent")}
                className={
                  "px-3 py-1 rounded-full " +
                  (activeTab === "sent"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100")
                }
              >
                Sent
              </button>
            </div>
          )}

          {/* Visibility filter (only for Received) */}
          {activeTab === "received" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <span className="font-medium">Filter:</span>
              <button
                type="button"
                onClick={() => setVisibilityFilter("all")}
                className={
                  "px-2 py-0.5 rounded-full border " +
                  (visibilityFilter === "all"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-100")
                }
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setVisibilityFilter("private")}
                className={
                  "px-2 py-0.5 rounded-full border " +
                  (visibilityFilter === "private"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-100")
                }
              >
                Private
              </button>
              <button
                type="button"
                onClick={() => setVisibilityFilter("public")}
                className={
                  "px-2 py-0.5 rounded-full border " +
                  (visibilityFilter === "public"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:bg-slate-100")
                }
              >
                Public
              </button>
            </div>
          )}
        </div>

        {/* Request review – requesters only */}
        {user?.user_type === "RQ" && (
          <button
            onClick={() => handleOpenNewRequestForm()}
            className="self-start md:self-auto text-xs px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
          >
            Request review
          </button>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2.3fr)]">
        {/* LEFT: Feed */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            {user?.user_type === "RR"
              ? "Requests for you"
              : activeTab === "received"
              ? "Requests for you"
              : "Requests you’ve sent"}
          </h2>

          {activeTab === "received" ? (
            <>
              {listError && (
                <p className="text-sm text-red-600">{listError}</p>
              )}
              {loadingList && (
                <p className="text-sm text-slate-500">
                  Loading review requests…
                </p>
              )}
              {!loadingList &&
                !listError &&
                filteredReceived.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No review requests in this view.
                  </p>
                )}

              <div className="space-y-3">
                {filteredReceived.map((req) => (
                  <RequestCard
                    key={req.request_id}
                    req={req}
                    active={req.request_id === selectedId}
                    onClick={() => handleSelect(req.request_id)}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {sentError && (
                <p className="text-sm text-red-600">{sentError}</p>
              )}
              {loadingSent && (
                <p className="text-sm text-slate-500">
                  Loading sent review requests…
                </p>
              )}
              {!loadingSent &&
                !sentError &&
                sentRequests.length === 0 && (
                  <p className="text-sm text-slate-500">
                    You haven’t sent any review requests yet.
                  </p>
                )}

              <div className="space-y-3">
                {sentRequests.map((req) => (
                  <RequestCard
                    key={req.request_id}
                    req={req}
                    active={req.request_id === selectedId}
                    onClick={() => handleSelect(req.request_id)}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* RIGHT: Detail */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-h-[280px]">
          {loadingDetail && (
            <p className="text-sm text-slate-500">
              Loading request detail…
            </p>
          )}
          {detailError && (
            <p className="text-sm text-red-600">{detailError}</p>
          )}
          {!loadingDetail && !detail && !detailError && (
            <p className="text-sm text-slate-500">
              Select a request from the left to see details.
            </p>
          )}
          {!loadingDetail && detail && (
            <DetailView
              detail={detail}
              user={user}
              showReviewForm={showReviewForm}
              setShowReviewForm={setShowReviewForm}
              reviewRating={reviewRating}
              setReviewRating={setReviewRating}
              reviewComment={reviewComment}
              setReviewComment={setReviewComment}
              reviewSubmitting={reviewSubmitting}
              onSubmitReview={handleSubmitReview}
              expandedReviewId={expandedReviewId}
              onExpandReview={handleExpandReview}
              commentsByReview={commentsByReview}
              commentsLoading={commentsLoading}
              commentDraft={commentDraft}
              setCommentDraft={setCommentDraft}
              commentSubmitting={commentSubmitting}
              onSubmitComment={handleSubmitComment}
              canCommentOnReview={canCommentOnReview}
              onRespond={handleRespond}
              responding={responding}
            />
          )}
        </section>
      </div>

      {/* New Request Modal */}
      {showNewRequestForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-lg w-full mx-4 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Request a review
              </h2>
              <button
                onClick={handleCloseNewRequestForm}
                className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            {/* Visibility */}
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-700">
                Visibility
              </p>
              <div className="flex items-center gap-4 text-[11px]">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    checked={visibility === "public"}
                    onChange={() => setVisibility("public")}
                  />
                  <span>Public (feed – future)</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={visibility === "private"}
                    onChange={() => setVisibility("private")}
                  />
                  <span>Private (invite one person)</span>
                </label>
              </div>
            </div>

            {/* Which resume - select existing or upload new */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-700">
                Resume
              </label>
              <div className="flex gap-2 text-[11px]">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="resumeMode"
                    value="select"
                    checked={resumeMode === "select"}
                    onChange={() => {
                      setResumeMode("select");
                      setNewFile(null);
                      setUploadedFileContent(null);
                    }}
                  />
                  <span>Select existing</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="resumeMode"
                    value="upload"
                    checked={resumeMode === "upload"}
                    onChange={() => {
                      setResumeMode("upload");
                      setSelectedResumeVersionId(null);
                    }}
                  />
                  <span>Upload new</span>
                </label>
              </div>
            </div>

            {/* Select existing version */}
            {resumeMode === "select" && (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-700">
                  Which resume version do you want reviewed?
                </label>
                {myVersionsLoading ? (
                  <p className="text-[11px] text-slate-500">
                    Loading your resumes…
                  </p>
                ) : myVersions.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No resume versions available. Try uploading a new one.
                  </p>
                ) : (
                  <select
                    className="w-full text-xs border border-slate-300 rounded px-2 py-1"
                    value={selectedResumeVersionId || ""}
                    onChange={(e) =>
                      setSelectedResumeVersionId(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                  >
                    <option value="">Select a version…</option>
                    {myVersions.map((v) => {
                      const label = `${
                        myResumeMeta?.track || "Resume"
                      } • ${v.version_name || `Version ${v.version_number}`} • ${formatDate(
                        v.uploaded_at
                      )}`;
                      return (
                        <option
                          key={v.resume_versions_id}
                          value={v.resume_versions_id}
                        >
                          {label}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            )}

            {/* Upload new file */}
            {resumeMode === "upload" && (
              <div className="space-y-2">
                {/* File input */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Upload resume file
                  </label>
                  <input
                    type="file"
                    accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="w-full text-xs"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) return;
                      
                      setNewFile(file);
                      setUploadingFile(true);
                      
                      try {
                        // Extract content from file
                        const formData = new FormData();
                        formData.append("file", file);
                        const response = await api.post("/api/resumes/extract", formData);
                        setUploadedFileContent(response.data.content || "");
                      } catch (err) {
                        console.error("Error extracting file content:", err);
                        setFormError("Failed to extract file content. Try again.");
                      } finally {
                        setUploadingFile(false);
                      }
                    }}
                  />
                  {newFile && (
                    <p className="text-[11px] text-slate-500">
                      Selected: {newFile.name}
                    </p>
                  )}
                </div>

                {/* Preview with Tiptap editor */}
                {uploadedFileContent && (
                  <div className="space-y-1 border-t border-slate-200 pt-2">
                    <p className="text-[11px] font-medium text-slate-700">
                      Preview (editable)
                    </p>
                    <div className="max-h-48 overflow-y-auto border border-slate-300 rounded p-2 bg-white text-xs text-slate-700">
                      <div className="h-40">
                        <ResumeEditor
                          content={uploadedFileContent}
                          onChange={(html) => setUploadedFileContent(html)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Request Note / Description */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-700">
                Description / Note for Reviewer
              </label>
              <textarea
                className="w-full text-xs border border-slate-300 rounded px-2 py-1 min-h-[60px]"
                placeholder="e.g. Please focus on my work experience section..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </div>

            {/* Ask AI to review */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="aiRequested"
                checked={aiRequested}
                onChange={(e) => setAiRequested(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="aiRequested" className="text-[11px] font-medium text-slate-700 select-none">
                Ask AI to review this resume
              </label>
            </div>

            {/* Reviewer selection (private only) */}
            {visibility === "private" && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-slate-700">
                  Choose a reviewer
                </p>
                <div className="border border-slate-300 rounded-lg p-2">
                  <input
                    type="text"
                    placeholder="Search by name or headline..."
                    className="w-full text-[11px] border border-slate-200 rounded px-2 py-1 mb-2"
                    value={reviewerSearch}
                    onChange={(e) => setReviewerSearch(e.target.value)}
                  />
                  {reviewerOptionsLoading ? (
                    <p className="text-[11px] text-slate-500">
                      Loading reviewers…
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {filteredReviewers.length === 0 ? (
                        <p className="text-[11px] text-slate-500">
                          No matches found.
                        </p>
                      ) : (
                        filteredReviewers.map((m) => {
                          const fullName = `${m.firstName || ""} ${
                            m.lastName || ""
                          }`;
                          const isSelected =
                            selectedReviewerId === m.user_id;
                          return (
                            <button
                              key={m.user_id}
                              type="button"
                              onClick={() =>
                                setSelectedReviewerId(m.user_id)
                              }
                              className={
                                "w-full text-left text-[11px] px-2 py-1 rounded " +
                                (isSelected
                                  ? "bg-slate-900 text-white"
                                  : "bg-white text-slate-800 hover:bg-slate-100")
                              }
                            >
                              <span className="font-medium">
                                {fullName}
                              </span>{" "}
                              •{" "}
                              <span className="text-[10px] text-slate-500">
                                {roleLabel(m.user_type)}
                              </span>
                              {m.headline && (
                                <span className="block text-[10px] text-slate-500">
                                  {m.headline}
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {formError && (
              <p className="text-[11px] text-red-600">{formError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={handleCloseNewRequestForm}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitNewRequest}
                className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Send request
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* =========================
   Subcomponents
   ========================= */

function RequestCard({ req, active, onClick }) {
  const {
    requesterFirstName,
    requesterLastName,
    requesterType,
    requesterHeadline,
    request_note,
    status,
    created_at,
  } = req;

  const preview =
    request_note && request_note.length > 80
      ? request_note.slice(0, 80) + "…"
      : request_note || "No additional note.";

  const statusColor =
    status === "pending"
      ? "bg-amber-100 text-amber-800"
      : status === "accepted"
      ? "bg-emerald-100 text-emerald-800"
      : status === "declined"
      ? "bg-rose-100 text-rose-800"
      : "bg-slate-100 text-slate-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-full text-left rounded-lg border p-3 transition shadow-sm flex flex-col gap-1 " +
        (active
          ? "border-slate-900 bg-slate-900/5"
          : "border-slate-200 bg-white hover:bg-slate-50")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {requesterFirstName} {requesterLastName}
          </p>
          <p className="text-[11px] text-slate-500">
            {roleLabel(requesterType)} •{" "}
            {requesterHeadline || "No headline yet"}
          </p>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor}`}
        >
          {status}
        </span>
      </div>
      <p className="text-xs text-slate-700 mt-1">{preview}</p>
      <p className="text-[10px] text-slate-400 mt-1">
        {formatDate(created_at)}
      </p>
    </button>
  );
}

function DetailView(props) {
  const {
    detail,
    showReviewForm,
    setShowReviewForm,
    reviewRating,
    setReviewRating,
    reviewComment,
    setReviewComment,
    reviewSubmitting,
    onSubmitReview,
    expandedReviewId,
    onExpandReview,
    commentsByReview,
    commentsLoading,
    commentDraft,
    setCommentDraft,
    commentSubmitting,
    onSubmitComment,
    canCommentOnReview,
    onRespond,
    responding,
  } = props;

  const { request, aiFeedback, reviews, canSeeAiFeedback } = detail;
  const canDropReview = detail.isReviewer;
  const isOwner = detail.isRequester;

  // "Word doc" content
  const [editorContent, setEditorContent] = useState(
    request.resumeContent || ""
  );

  // Ref to textarea for auto-scrolling
  const textareaRef = useRef(null);
  const highlightLayerRef = useRef(null);
  const resumeEditorRef = useRef(null);

  useEffect(() => {
    setEditorContent(request.resumeContent || "");
  }, [request.resumeContent, request.request_id]);

  // Side-panel suggestions from aiFeedback structured JSON
  const [localSuggestions, setLocalSuggestions] = useState([]);
  const [feedbackSummary, setFeedbackSummary] = useState(null);

  // Track highlighted ranges for accepted suggestions
  const [highlightedRanges, setHighlightedRanges] = useState([]);

  // Modal for naming new version
  const [showVersionNameModal, setShowVersionNameModal] = useState(false);
  const [versionNameInput, setVersionNameInput] = useState("");
  const [savingAsVersion, setSavingAsVersion] = useState(false);
  const [versionModalError, setVersionModalError] = useState("");

  // Helper: Strip HTML tags to get plain text for matching
  const stripHtmlTags = (html) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  };

  // Helper: Find text in HTML content and replace while preserving HTML structure
  const replaceInHtml = (htmlContent, originalText, replacementText) => {
    // If content doesn't have HTML tags, use simple replace
    if (!htmlContent.includes("<")) {
      return htmlContent.replace(originalText, replacementText);
    }

    try {
      // 1. Build a map of text content to HTML indices
      let myStripped = "";
      const map = []; // map[i] = { start, end } in htmlContent for char i in myStripped

      const tokenRegex = /(<[^>]+>)|(&[a-zA-Z\d]+;|&#\d+;|&#x[0-9a-fA-F]+;)|([\s\S])/g;
      let match;
      
      const decodeHtmlEntity = (str) => {
        const txt = document.createElement("textarea");
        txt.innerHTML = str;
        return txt.value;
      };

      while ((match = tokenRegex.exec(htmlContent)) !== null) {
        const [fullMatch, tag, entity, char] = match;
        
        if (tag) {
          continue;
        }
        
        const decoded = entity ? decodeHtmlEntity(entity) : char;
        const start = match.index;
        const end = start + fullMatch.length;
        
        for (let i = 0; i < decoded.length; i++) {
          map.push({ start, end });
        }
        myStripped += decoded;
      }

      // 2. Find the match in myStripped
      // Normalize original text to allow flexible whitespace matching
      const normalize = (str) => str.replace(/\s+/g, " ").trim();
      const normalizedOriginal = normalize(originalText);
      
      if (!normalizedOriginal) return htmlContent;

      // Create regex: escape special chars, then replace spaces with \s+
      const escaped = normalizedOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regexPattern = escaped.replace(/ /g, "\\s+");
      const regex = new RegExp(regexPattern); // Case sensitive to be safe, or "i" if desired
      
      const found = regex.exec(myStripped);
      
      if (!found) {
        console.log("⚠️ Text not found in content");
        return htmlContent;
      }
      
      const startChar = found.index;
      const endChar = startChar + found[0].length - 1; // inclusive index of last char
      
      // 3. Map back to HTML
      const startHtml = map[startChar].start;
      const endHtml = map[endChar].end;
      
      // Wrap replacement in <mark> tag for highlighting
      const result = htmlContent.substring(0, startHtml) + "<mark>" + replacementText + "</mark>" + htmlContent.substring(endHtml);

      console.log("✓ Found and replaced in HTML (preserving tags & entities)");
      return result;
    } catch (e) {
      console.error("Error replacing in HTML:", e);
      return htmlContent;
    }
  };

  // Helper: Find suggestion ranges in content for highlighting

  // helper: find ranges of suggested text using regex/fuzzy whitespace
  const findSuggestionRanges = (content, suggested) => {
    if (!suggested) return [];

    const normalizedSuggested = suggested.replace(/\s+/g, " ").trim();
    const escaped = normalizedSuggested.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flexiblePattern = escaped.replace(/\s+/g, "\\s+");
    const regex = new RegExp(flexiblePattern, "gi");

    const ranges = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    return ranges;
  };

  // Sync scroll between textarea and highlight layer
  useEffect(() => {
    // Scroll sync removed - now using Tiptap editor
    // No longer needed
  }, []);

  useEffect(() => {
    if (!aiFeedback?.feedback_text) {
      setLocalSuggestions([]);
      setFeedbackSummary(null);
      return;
    }

    try {
      const parsed = JSON.parse(aiFeedback.feedback_text);

      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : [];
      const summary = parsed.summary || null;

      // Use status from backend, default to "pending"
      const mapped = suggestions.map((s) => ({
        ...s,
        status: s.status || "pending",
      }));

      setLocalSuggestions(mapped);
      setFeedbackSummary(summary);
    } catch (err) {
      console.error("✗ Failed to parse AI feedback JSON:", err);
      console.log("Raw feedback_text:", aiFeedback.feedback_text);
      setLocalSuggestions([]);
      setFeedbackSummary(null);
    }
  }, [aiFeedback]);

  const handleAcceptSuggestion = async (suggestion) => {
    const { id, type, original, suggested, anchor } = suggestion;

    console.log("🔵 Accepting suggestion:", {
      id,
      type,
      original,
      suggested,
      anchor,
    });
    console.log("📄 Current editorContent length:", editorContent.length);
    
    // Debug: show what we're looking for
    if (original) {
      console.log("🔍 Looking for original text:", JSON.stringify(original.substring(0, 50)));
      console.log("🔍 In content (first 100 chars):", JSON.stringify(editorContent.substring(0, 100)));
    }

    // Apply the change to editorContent based on type
    let updatedContent = editorContent;
    let changeApplied = false;

    if (type === "rewrite" || type === "replace") {
      // Replace original with suggested
      if (original && suggested) {
        // For HTML content, use the smart replacement function
        if (editorContent.includes("<")) {
          updatedContent = replaceInHtml(editorContent, original, suggested);
          if (updatedContent !== editorContent) {
            changeApplied = true;
            console.log("✓ Replaced using HTML-aware replacement");
          } else {
            console.log("✗ HTML replacement didn't find match");
          }
        } else {
          // Plain text content - use simple matching
          if (editorContent.includes(original)) {
            console.log("✓ Found exact match");
            updatedContent = editorContent.replace(original, suggested);
            changeApplied = true;
          } else {
            console.log(
              "✗ No exact match. Trying fuzzy match with normalized whitespace..."
            );

            const normalize = (str) => str.replace(/\s+/g, " ").trim();
            const normalizedOriginal = normalize(original);
            const normalizedContent = normalize(editorContent);

            if (normalizedContent.includes(normalizedOriginal)) {
              console.log("✓ Found match after normalization, applying...");
              const escapedPattern = normalizedOriginal.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              );
              const flexibleRegex = new RegExp(
                escapedPattern.replace(/\s+/g, "\\s+"),
                "gi"
              );

              if (flexibleRegex.test(editorContent)) {
                updatedContent = editorContent.replace(
                  flexibleRegex,
                  suggested
                );
                changeApplied = true;
                console.log("✓ Replaced with flexible regex");
              }
            } else {
              console.log(
                "✗ No fuzzy match found. Content not found in resume."
              );
              console.log(
                "Looking for:",
                normalizedOriginal.substring(0, 100)
              );
              console.log(
                "In content:",
                normalizedContent.substring(0, 100)
              );
            }
          }
        }
      }
    } else if (type === "remove") {
      // Remove the original text
      if (original) {
        // For HTML content, use the smart replacement function (replace with empty string)
        if (editorContent.includes("<")) {
          updatedContent = replaceInHtml(editorContent, original, "");
          if (updatedContent !== editorContent) {
            changeApplied = true;
            console.log("✓ Removed using HTML-aware replacement");
          } else {
            console.log("✗ HTML removal didn't find match");
          }
        } else {
          // Plain text content - use simple matching
          if (editorContent.includes(original)) {
            console.log("✓ Found text to remove (exact)");
            updatedContent = editorContent.replace(original, "");
            changeApplied = true;
          } else {
            console.log("✗ Trying fuzzy match for removal...");
            const normalize = (str) => str.replace(/\s+/g, " ").trim();
            const normalizedOriginal = normalize(original);
            const normalizedContent = normalize(editorContent);

            if (normalizedContent.includes(normalizedOriginal)) {
              const escapedPattern = normalizedOriginal.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              );
              const flexibleRegex = new RegExp(
                escapedPattern.replace(/\s+/g, "\\s+"),
                "i"
              );
              if (flexibleRegex.test(editorContent)) {
                updatedContent = editorContent.replace(flexibleRegex, "");
                changeApplied = true;
                console.log("✓ Removed with flexible regex");
              }
            }
          }
        }
      }
    } else if (type === "add") {
      // Add suggested text (append to content or insert at anchor)
      if (suggested) {
        if (anchor) {
          // For HTML content, use the smart replacement function
          if (editorContent.includes("<")) {
            updatedContent = replaceInHtml(
              editorContent,
              anchor,
              anchor + "\n" + suggested
            );
            if (updatedContent !== editorContent) {
              changeApplied = true;
              console.log("✓ Found anchor with HTML-aware replacement, inserting");
            } else {
              // Anchor not found, append to end
              console.log("✓ Anchor not found in HTML, appending to end");
              updatedContent = editorContent + "\n" + suggested;
              changeApplied = true;
            }
          } else {
            // Plain text content - use simple matching
            if (editorContent.includes(anchor)) {
              console.log("✓ Found anchor, inserting after it");
              updatedContent = editorContent.replace(
                anchor,
                anchor + "\n" + suggested
              );
              changeApplied = true;
            } else {
              const normalize = (str) => str.replace(/\s+/g, " ").trim();
              const normalizedAnchor = normalize(anchor);
              const normalizedContent = normalize(editorContent);

              if (normalizedContent.includes(normalizedAnchor)) {
                const escapedPattern = normalizedAnchor.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                );
                const flexibleRegex = new RegExp(
                  escapedPattern.replace(/\s+/g, "\\s+"),
                  "i"
                );
                if (flexibleRegex.test(editorContent)) {
                  updatedContent = editorContent.replace(
                    flexibleRegex,
                    anchor + "\n" + suggested
                  );
                  changeApplied = true;
                  console.log("✓ Found anchor with fuzzy match, inserting");
                }
              } else {
                console.log("✓ Anchor not found, appending to end");
                updatedContent = editorContent + "\n" + suggested;
                changeApplied = true;
              }
            }
          }
        } else {
          console.log("✓ No anchor, appending to end");
          updatedContent = editorContent + "\n" + suggested;
          changeApplied = true;
        }
      }
    }

    console.log("🟢 Change applied:", changeApplied);

    // Update editor content locally
    setEditorContent(updatedContent);

    // Highlight the change in Tiptap (visual cue)
    // Note: replaceInHtml already wraps the text in <mark> tags, so it renders highlighted.
    // We just need to clear it after a delay so it doesn't persist forever.
    if (changeApplied && resumeEditorRef.current) {
      try {
        // Auto-remove highlight after 5 seconds
        setTimeout(() => {
          if (resumeEditorRef.current) {
            resumeEditorRef.current.clearHighlights();
          }
        }, 5000);
      } catch (err) {
        console.error("Error handling highlights in Tiptap:", err);
      }
    }

    try {
      // Persist status to backend
      await api.patch(
        `/api/review-requests/${request.request_id}/ai-suggestions`,
        {
          suggestionId: id,
          status: "accepted",
        }
      );

      // Mark suggestion as accepted
      setLocalSuggestions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: "accepted", changeApplied } : s
        )
      );
    } catch (err) {
      console.error("❌ Error updating suggestion status:", err);
      alert(
        err.response?.data?.message ||
          "Error saving suggestion status. Try again."
      );
    }
  };

  const handleRejectSuggestion = async (id) => {
    try {
      await api.patch(
        `/api/review-requests/${request.request_id}/ai-suggestions`,
        {
          suggestionId: id,
          status: "rejected",
        }
      );

      setLocalSuggestions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: "rejected" } : s
        )
      );

      // Remove highlight for rejected suggestion, if any
      setHighlightedRanges((prev) =>
        prev.filter((range) => range.id !== id)
      );
    } catch (err) {
      console.error("❌ Error rejecting suggestion:", err);
      alert(
        err.response?.data?.message ||
          "Error saving suggestion status. Try again."
      );
    }
  };

  // show AI panel only if request asked for AI + backend says user can see it
  const showAiPanel = !!request.ai_requested && canSeeAiFeedback;

  const handleExportPdf = () => {
    if (!editorContent) return;
    
    // Create a temporary container for the PDF content
    const element = document.createElement("div");
    element.innerHTML = editorContent;
    element.className = "prose prose-sm max-w-none"; 
    
    // Apply styles to match editor (A4)
    element.style.width = "210mm";
    element.style.minHeight = "297mm";
    element.style.padding = "0.5mm 1mm";
    element.style.fontFamily = "Arial, sans-serif";
    element.style.fontSize = "9pt";
    element.style.lineHeight = "1.5";
    element.style.color = "#000";
    element.style.background = "#fff";
    
    const opt = {
      margin: 0,
      filename: `resume_request_${request.request_id}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };
    
    html2pdf().set(opt).from(element).save();
  };

  const handleSaveAsNewVersion = async () => {
    if (!request || !editorContent.trim()) {
      alert("Resume content is empty");
      return;
    }

    // Show the modal to prompt for version name
    setVersionNameInput("");
    setVersionModalError("");
    setShowVersionNameModal(true);
  };

  const handleConfirmVersionName = async () => {
    if (!versionNameInput.trim()) {
      setVersionModalError("Please enter a version name");
      return;
    }

    if (!request || !editorContent.trim()) {
      alert("Resume content is empty");
      return;
    }

    console.log("💾 Saving new version...");
    console.log("📋 Resume ID:", request.resume_id);
    console.log("📝 Content length:", editorContent.length);
    console.log("📛 Version name:", versionNameInput);

    setSavingAsVersion(true);
    setVersionModalError("");

    try {
      // Create new resume version with edited content
      const payload = {
        content: editorContent,
        version_name: versionNameInput.trim(),
      };

      console.log("📤 Sending payload to create new version");

      const response = await api.post(
        `/api/resumes/${request.resume_id}/versions`,
        payload
      );

      console.log("📥 Response data:", response.data);

      const newVersionId = response.data.resume_versions_id;
      console.log("📌 New version ID:", newVersionId);

      setShowVersionNameModal(false);
      setVersionNameInput("");
      setVersionModalError("");

      alert(
        "✓ Resume version saved successfully as '" + versionNameInput + "'!"
      );
    } catch (err) {
      console.error("❌ Error saving resume version:", err);
      setVersionModalError(
        "Error: " + (err.response?.data?.message || err.message)
      );
    } finally {
      setSavingAsVersion(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top: requester + note + status + actions */}
      <div className="border-b border-slate-200 pb-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500 mb-1">
              Request #{request.request_id} •{" "}
              {formatDate(request.created_at)}
            </p>
            <p className="text-sm font-semibold text-slate-900">
              From: {request.requesterFirstName}{" "}
              {request.requesterLastName}{" "}
              <span className="text-[11px] text-slate-500">
                ({roleLabel(request.requesterType)})
              </span>
            </p>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {request.status}
          </span>
        </div>

        {/* Accept / decline – reviewer only, pending, PRIVATE requests only */}
        {detail.isReviewer &&
          request.visibility === "private" &&
          request.status === "pending" && (
            <div className="flex gap-2">
              <button
                onClick={() => onRespond("accepted")}
                disabled={responding}
                className="text-[11px] px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {responding ? "Updating…" : "Accept"}
              </button>
              <button
                onClick={() => onRespond("declined")}
                disabled={responding}
                className="text-[11px] px-3 py-1.5 rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-60"
              >
                Decline
              </button>
            </div>
          )}

        <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
          {request.request_note || "No additional description provided."}
        </p>
      </div>

      {/* Middle: Resume doc (and AI panel if allowed) */}
      {showAiPanel ? (
        <div className="flex flex-col md:flex-row gap-3">
          {/* "Word document" style area */}
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <div className="text-xs text-slate-500 flex items-center justify-between">
              <span>Resume preview</span>
              {isOwner ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  {
                    localSuggestions.filter(
                      (s) => s.status === "accepted"
                    ).length
                  }{" "}
                  changes applied
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100">
                  Read-only for you
                </span>
              )}
            </div>

            <div className="bg-slate-100 rounded-md p-3 flex justify-center">
              <div className="bg-slate-100 w-full max-w-full overflow-auto rounded-md relative flex-1 h-[800px]">
                {/* Status bar showing if there are pending changes */}
                {localSuggestions.filter(
                  (s) => s.status === "pending"
                ).length > 0 && (
                  <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-[10px] text-amber-700">
                    ⏳{" "}
                    {
                      localSuggestions.filter(
                        (s) => s.status === "pending"
                      ).length
                    }{" "}
                    pending suggestion(s) – accept or dismiss to apply
                    changes
                  </div>
                )}

                {/* Tiptap Editor */}
                <div className="w-full flex-1 relative">
                  <ResumeEditor
                    ref={resumeEditorRef}
                    content={editorContent}
                    onChange={(newContent) => {
                      setEditorContent(newContent);
                    }}
                    editable={isOwner}
                  />
                </div>
              </div>
            </div>

            {isOwner && (
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleExportPdf}
                  className="text-[11px] px-3 py-1.5 rounded-full bg-red-600 text-white hover:bg-red-700"
                >
                  Export to PDF
                </button>
                <button
                  onClick={handleSaveAsNewVersion}
                  className="text-[11px] px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                >
                  Save as new resume version
                </button>
              </div>
            )}
          </div>

          {/* AI suggestions side panel */}
          <aside className="w-full md:w-[260px] shrink-0 border border-slate-200 rounded-lg p-3 bg-slate-50 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                AI suggestions
              </h3>
              {aiFeedback?.score != null && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Score {aiFeedback.score}/100
                </span>
              )}
            </div>

            {aiFeedback?.model && (
              <p className="text-[10px] text-slate-500">
                Model: {aiFeedback.model}
              </p>
            )}

            {!aiFeedback ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="inline-block animate-spin">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-[11px] text-slate-500">
                  Generating suggestions…
                </p>
              </div>
            ) : localSuggestions.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No structured suggestions yet. You can still use the
                feedback summary below to edit your resume.
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {localSuggestions.map((s) => {
                  let statusBadgeClass = "";
                  let statusLabel = "";

                  if (s.status === "accepted") {
                    statusBadgeClass =
                      "bg-emerald-100 text-emerald-700";
                    statusLabel = "✓ Applied";
                  } else if (s.status === "rejected") {
                    statusBadgeClass = "bg-slate-200 text-slate-700";
                    statusLabel = "Dismissed";
                  } else {
                    statusBadgeClass =
                      "bg-amber-100 text-amber-700";
                    statusLabel = "Pending";
                  }

                  return (
                    <div
                      key={s.id}
                      className={`border rounded-md p-2 transition-all ${
                        s.status === "accepted"
                          ? "border-emerald-300 bg-emerald-50"
                          : s.status === "rejected"
                          ? "border-slate-200 bg-slate-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1">
                          <p className="text-[11px] font-semibold text-slate-900">
                            {s.category && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 mr-1">
                                {s.category}
                              </span>
                            )}
                            {s.type}
                          </p>
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            {s.note}
                          </p>
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap font-semibold ${statusBadgeClass}`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      {/* Show before/after for editable changes */}
                      {(s.type === "rewrite" ||
                        s.type === "replace" ||
                        s.type === "remove" ||
                        s.type === "add") && (
                        <div className="space-y-1 mb-2 text-[10px]">
                          {s.original && (
                            <div
                              className={`border rounded p-1.5 ${
                                s.changeApplied
                                  ? "bg-emerald-50 border-emerald-200"
                                  : "bg-rose-50 border-rose-200"
                              }`}
                            >
                              <p
                                className={`font-semibold text-[9px] ${
                                  s.changeApplied
                                    ? "text-emerald-700"
                                    : "text-rose-700"
                                }`}
                              >
                                {s.changeApplied
                                  ? "✓ Found & Replaced:"
                                  : "Original:"}
                              </p>
                              <p className="text-rose-600 text-[9px] line-through">
                                {s.original}
                              </p>
                            </div>
                          )}
                          {s.suggested && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded p-1.5">
                              <p className="text-emerald-700 font-semibold text-[9px]">
                                Suggested:
                              </p>
                              <p className="text-emerald-700 text-[9px] font-medium">
                                {s.suggested}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Show buttons only if pending */}
                      {s.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleAcceptSuggestion(s)
                            }
                            className="flex-1 text-[10px] px-2 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition font-semibold"
                          >
                            ✓ Accept
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleRejectSuggestion(s.id)
                            }
                            className="flex-1 text-[10px] px-2 py-1 rounded-full bg-slate-300 text-slate-800 hover:bg-slate-400 transition font-semibold"
                          >
                            ✕ Dismiss
                          </button>
                        </div>
                      )}

                      {/* Show checkmark badge for accepted */}
                      {s.status === "accepted" && (
                        <div className="flex items-center justify-center pt-1">
                          <span className="text-[9px] text-emerald-700 font-semibold">
                            ✓ Applied to resume
                          </span>
                        </div>
                      )}

                      {s.status === "rejected" && (
                        <div className="flex items-center justify-center pt-1">
                          <span className="text-[9px] text-slate-600 font-semibold">
                            Dismissed
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Feedback summary section */}
            {feedbackSummary && (
              <div className="mt-2 border-t border-slate-200 pt-2">
                <p className="text-[10px] font-semibold text-slate-700 mb-1">
                  Summary
                </p>
                <p className="text-[10px] text-slate-600 mb-1">
                  {feedbackSummary.overall}
                </p>
                {feedbackSummary.strengths?.length > 0 && (
                  <div className="mb-1">
                    <p className="text-[9px] font-semibold text-emerald-700">
                      Strengths:
                    </p>
                    <ul className="text-[9px] text-slate-600 ml-2 list-disc">
                      {feedbackSummary.strengths
                        .slice(0, 2)
                        .map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                    </ul>
                  </div>
                )}
                {feedbackSummary.weaknesses?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-semibold text-rose-700">
                      Areas to improve:
                    </p>
                    <ul className="text-[9px] text-slate-600 ml-2 list-disc">
                      {feedbackSummary.weaknesses
                        .slice(0, 2)
                        .map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      ) : (
        // no AI panel (either not requested or user not allowed)
        <div className="flex flex-col gap-2">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Resume preview</span>
            {isOwner ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                You can edit this during review
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100">
                Read-only for you
              </span>
            )}
          </div>

          <div className="bg-slate-100 rounded-md p-3 flex justify-center">
            <div className="bg-slate-100 w-full max-w-full overflow-auto rounded-md relative flex-1 h-[800px]">
              <div className="w-full flex-1 relative">
                <ResumeEditor
                  content={editorContent}
                  onChange={(newContent) => setEditorContent(newContent)}
                  editable={isOwner}
                />
              </div>
            </div>
          </div>

          {isOwner && (
            <div className="flex justify-end gap-2">
              <button
                onClick={handleExportPdf}
                className="text-[11px] px-3 py-1.5 rounded-full bg-red-600 text-white hover:bg-red-700"
              >
                Export to PDF
              </button>
              <button
                onClick={handleSaveAsNewVersion}
                className="text-[11px] px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800"
              >
                Save as new resume version
              </button>
            </div>
          )}
        </div>
      )}

      {/* Review form */}
      {canDropReview && (
        <div className="border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-900">
              Drop your review
            </h3>
            {!showReviewForm && (
              <button
                onClick={() => setShowReviewForm(true)}
                className="text-xs px-3 py-1 rounded-full bg-slate-900 text-white hover:bg-slate-800"
              >
                Write review
              </button>
            )}
          </div>

          {showReviewForm && (
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  Rating
                </label>
                <select
                  className="border border-slate-300 rounded px-2 py-1 text-xs"
                  value={reviewRating}
                  onChange={(e) =>
                    setReviewRating(Number(e.target.value))
                  }
                >
                  <option value={5}>5 - Excellent</option>
                  <option value={4}>4 - Strong</option>
                  <option value={3}>3 - Decent</option>
                  <option value={2}>2 - Needs work</option>
                  <option value={1}>1 - Major concerns</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  Detailed feedback
                </label>
                <textarea
                  className="w-full border border-slate-300 rounded px-2 py-1 text-xs min-h-[80px]"
                  placeholder="Share what you liked and what could be improved..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onSubmitReview}
                  disabled={reviewSubmitting}
                  className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {reviewSubmitting ? "Submitting…" : "Submit review"}
                </button>
                <button
                  onClick={() => {
                    setShowReviewForm(false);
                    setReviewComment("");
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reviews list */}
      <div className="border border-slate-200 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-900 mb-2">
          Reviews
        </h3>
        {(!reviews || reviews.length === 0) && (
          <p className="text-xs text-slate-500">
            No reviews have been submitted yet.
          </p>
        )}
        <div className="space-y-2">
          {reviews.map((rev) => (
            <ReviewItem
              key={rev.review_id}
              review={rev}
              expanded={expandedReviewId === rev.review_id}
              onToggle={() => onExpandReview(rev)}
              comments={commentsByReview[rev.review_id] || []}
              commentsLoading={commentsLoading}
              canComment={canCommentOnReview(rev)}
              commentDraft={
                expandedReviewId === rev.review_id ? commentDraft : ""
              }
              setCommentDraft={(val) =>
                expandedReviewId === rev.review_id &&
                setCommentDraft(val)
              }
              commentSubmitting={commentSubmitting}
              onSubmitComment={onSubmitComment}
            />
          ))}
        </div>
      </div>

      {/* Save as New Version Modal */}
      {showVersionNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-sm w-full mx-4 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Save as New Version
            </h2>
            <p className="text-xs text-slate-600">
              Give your updated resume a name to save it as a new version.
            </p>

            <input
              type="text"
              placeholder="e.g., Updated Resume, Final Version..."
              value={versionNameInput}
              onChange={(e) => setVersionNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && versionNameInput.trim()) {
                  handleConfirmVersionName();
                }
              }}
              className="w-full text-xs border border-slate-300 rounded px-2 py-1"
              autoFocus
            />

            {versionModalError && (
              <p className="text-xs text-red-500">{versionModalError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowVersionNameModal(false);
                  setVersionNameInput("");
                  setVersionModalError("");
                }}
                disabled={savingAsVersion}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVersionName}
                disabled={savingAsVersion || !versionNameInput.trim()}
                className="text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingAsVersion ? "Saving..." : "Save Version"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewItem({
  review,
  expanded,
  onToggle,
  comments,
  commentsLoading,
  canComment,
  commentDraft,
  setCommentDraft,
  commentSubmitting,
  onSubmitComment,
}) {
  const {
    review_id,
    reviewerFirstName,
    reviewerLastName,
    reviewerType,
    review_rating,
    created_at,
    commentCount,
  } = review;

  return (
    <div className="border border-slate-200 rounded-lg p-2 text-xs">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left flex items-center justify-between gap-2"
      >
        <div>
          <p className="font-semibold text-slate-900">
            {reviewerFirstName} {reviewerLastName}{" "}
            <span className="text-[10px] text-slate-500">
              ({roleLabel(reviewerType)})
            </span>
          </p>
          <p className="text-[11px] text-slate-500">
            Rating: {review_rating}/5 • {formatDate(created_at)}
          </p>
        </div>
        <p className="text-[11px] text-slate-500">
          {commentCount} comments {expanded ? "▲" : "▼"}
        </p>
      </button>

      {expanded && (
        <div className="mt-2 border-t border-slate-100 pt-2 space-y-2">
          {commentsLoading ? (
            <p className="text-[11px] text-slate-500">
              Loading comments…
            </p>
          ) : comments.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              No comments yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {comments.map((c) => (
                <li key={c.review_comment_id}>
                  <p className="text-[11px] text-slate-800">
                    <span className="font-semibold">
                      {c.firstName} {c.lastName}:
                    </span>{" "}
                    {c.comment_text}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {formatDate(c.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {canComment && (
            <div className="space-y-1">
              <textarea
                className="w-full border border-slate-300 rounded px-2 py-1 text-[11px] min-h-[48px]"
                placeholder="Reply or discuss this review..."
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
              />
              <button
                onClick={onSubmitComment}
                disabled={commentSubmitting}
                className="text-[11px] px-3 py-1 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {commentSubmitting ? "Posting…" : "Post comment"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
