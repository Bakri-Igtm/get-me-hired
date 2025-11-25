// src/pages/ReviewRequestsPage.jsx
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  fetchIncomingRequests,
  fetchRequestDetail,
  submitReview,
} from "../api/reviewRequests";
import {
  fetchReviewComments,
  addReviewComment,
} from "../api/reviewComments";
import { fetchMembers } from "../api/directory"; // ⬅ for reviewer dropdown

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

  // 🔹 New Request UI state
  const [showNewRequestForm, setShowNewRequestForm] = useState(false);
  const [visibility, setVisibility] = useState("private"); // "private" | "public"
  const [reviewerOptions, setReviewerOptions] = useState([]);
  const [reviewerOptionsLoading, setReviewerOptionsLoading] = useState(false);
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState(null);
  const [newTrack, setNewTrack] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newFile, setNewFile] = useState(null);

  // Load feed
  useEffect(() => {
    (async () => {
      try {
        setLoadingList(true);
        const { data } = await fetchIncomingRequests();
        setRequests(data.requests || []);
        setListError("");
        // auto-select first request
        if (data.requests && data.requests.length > 0) {
          setSelectedId(data.requests[0].request_id);
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
    })();
  }, []);

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
      // reload detail to show new review
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

  // 🔹 Open "Request review" form (fetch reviewers list lazily)
  const handleOpenNewRequestForm = async () => {
    setShowNewRequestForm(true);
    setVisibility("private");
    setReviewerSearch("");
    setSelectedReviewerId(null);
    setNewTrack("");
    setNewNote("");
    setNewFile(null);

    if (!reviewerOptions.length) {
      try {
        setReviewerOptionsLoading(true);
        // get all members (backend already filters to RQ/RR)
        const { data } = await fetchMembers();
        setReviewerOptions(data.members || []);
      } catch (e) {
        console.error("fetchMembers error:", e);
        // UI still works; just no options
      } finally {
        setReviewerOptionsLoading(false);
      }
    }
  };

  const handleCloseNewRequestForm = () => {
    setShowNewRequestForm(false);
  };

  // 🔹 Just UI for now – no backend submit yet
  const handleSubmitNewRequest = () => {
    console.log("New request payload (UI only for now):", {
      visibility,
      selectedReviewerId,
      newTrack,
      newNote,
      newFile,
    });
    alert("Request review UI is ready – backend wiring comes next 🚧");
    setShowNewRequestForm(false);
  };

  // filter reviewer list locally
  const filteredReviewers = reviewerOptions
    .filter((m) => {
      if (!reviewerSearch.trim()) return true;
      const q = reviewerSearch.toLowerCase();
      const fullName = `${m.firstName || ""} ${m.lastName || ""}`.toLowerCase();
      return (
        fullName.includes(q) ||
        (m.headline || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 10); // show up to ~10

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Review Requests
          </h1>
          <p className="text-sm text-slate-600">
            See requests sent to you and drop detailed feedback.
          </p>
        </div>

        {/* 🔹 Request review button – requesters only */}
        {user?.user_type === "RQ" && (
          <button
            onClick={handleOpenNewRequestForm}
            className="text-xs px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
          >
            Request review
          </button>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
        {/* LEFT: Feed of incoming requests */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            Requests for you
          </h2>

          {listError && (
            <p className="text-sm text-red-600">{listError}</p>
          )}
          {loadingList && (
            <p className="text-sm text-slate-500">
              Loading review requests…
            </p>
          )}

          {!loadingList && !listError && requests.length === 0 && (
            <p className="text-sm text-slate-500">
              No review requests yet.
            </p>
          )}

          <div className="space-y-3">
            {requests.map((req) => (
              <RequestCard
                key={req.request_id}
                req={req}
                active={req.request_id === selectedId}
                onClick={() => handleSelect(req.request_id)}
              />
            ))}
          </div>
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
            />
          )}
        </section>
      </div>

      {/* 🔹 New Request Modal (UI only) */}
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
                  <span>Public (visible to all users)</span>
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

            {/* Track */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-700">
                Track / Role focus
              </label>
              <input
                type="text"
                className="w-full text-xs border border-slate-300 rounded px-2 py-1"
                placeholder="e.g., Software Engineering, Data Science, Product Management"
                value={newTrack}
                onChange={(e) => setNewTrack(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-700">
                Describe what you want feedback on
              </label>
              <textarea
                className="w-full text-xs border border-slate-300 rounded px-2 py-2 min-h-[80px]"
                placeholder="Share context, target roles, what you're unsure about, etc."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </div>

            {/* Upload (UI only) */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-700">
                Upload resume (Word document)
              </label>
              <input
                type="file"
                accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="w-full text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setNewFile(file);
                }}
              />
              {newFile && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Selected: {newFile.name}
                </p>
              )}
              <p className="text-[10px] text-slate-400">
                (Upload behavior not wired yet – this is just the UI.)
              </p>
            </div>

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
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor}`}>
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
    user,
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
  } = props;

  const { request, aiFeedback, reviews, canSeeAiFeedback } = detail;

  const canDropReview = detail.isReviewer; // invited reviewer only

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top: requester + note */}
      <div className="border-b border-slate-200 pb-3">
        <p className="text-xs text-slate-500 mb-1">
          Request #{request.request_id} • {formatDate(request.created_at)}
        </p>
        <p className="text-sm font-semibold text-slate-900">
          From: {request.requesterFirstName} {request.requesterLastName}{" "}
          <span className="text-[11px] text-slate-500">
            ({roleLabel(request.requesterType)})
          </span>
        </p>
        <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
          {request.request_note || "No additional description provided."}
        </p>
      </div>

      {/* Resume content */}
      <div className="flex-1 min-h-[140px] max-h-64 border border-slate-200 rounded-lg p-3 bg-slate-50 overflow-auto">
        <h3 className="text-xs font-semibold text-slate-900 mb-1">
          Resume preview
        </h3>
        <p className="text-xs text-slate-800 whitespace-pre-wrap">
          {request.resumeContent || "No resume content available."}
        </p>
      </div>

      {/* AI feedback — only visible to requester / admin */}
      {canSeeAiFeedback && aiFeedback && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-emerald-900 mb-1">
            AI feedback (visible only to you)
          </h3>
          {aiFeedback.score !== null && (
            <p className="text-[11px] text-emerald-700 mb-1">
              Score: {aiFeedback.score}/100 • {aiFeedback.model}
            </p>
          )}
          <p className="text-xs text-emerald-900 whitespace-pre-wrap">
            {aiFeedback.feedback_text}
          </p>
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
                  onChange={(e) => setReviewRating(Number(e.target.value))}
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
              commentDraft={expandedReviewId === rev.review_id ? commentDraft : ""}
              setCommentDraft={(val) =>
                expandedReviewId === rev.review_id && setCommentDraft(val)
              }
              commentSubmitting={commentSubmitting}
              onSubmitComment={onSubmitComment}
            />
          ))}
        </div>
      </div>
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
