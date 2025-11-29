// controllers/reviewRequestController.js
import pool from "../db.js";
import { generateAiFeedbackAsync } from "./aiFeedbackController.js";

/**
 * POST /api/review-requests
 * Body: { resumeVersionsId, reviewerId, requestNote }
 * requester = current logged-in user (from token)
 */
// POST /api/review-requests
export const createReviewRequest = async (req, res) => {
  const {
    resumeVersionsId,
    reviewerId,   // may be null for public
    visibility,   // 'public' | 'private' (from frontend)
    track,
    requestNote,
    aiRequested,  // 🔹 NEW
  } = req.body;

  const requesterId = req.user.userId;

  if (!resumeVersionsId) {
    return res
      .status(400)
      .json({ message: "resumeVersionsId is required" });
  }

  // 🔹 Normalize / fallback visibility
  const rawVisibility = visibility;
  let vis;

  if (rawVisibility === "public") {
    vis = "public";
  } else if (rawVisibility === "private") {
    vis = "private";
  } else {
    vis = reviewerId ? "private" : "public";
  }

  // 🔹 For PRIVATE: reviewerId is required
  if (vis === "private" && !reviewerId) {
    return res
      .status(400)
      .json({ message: "reviewerId is required for private requests" });
  }

  // normalize aiRequested to 0/1
  const aiFlag = aiRequested ? 1 : 0;

  try {
    // Make sure version exists
    const [vRows] = await pool.query(
      `SELECT resume_versions_id FROM resume_versions WHERE resume_versions_id = ?`,
      [resumeVersionsId]
    );
    if (vRows.length === 0) {
      return res.status(400).json({ message: "Invalid resumeVersionsId" });
    }

    // If private, make sure reviewer exists
    if (vis === "private" && reviewerId) {
      const [uRows] = await pool.query(
        `SELECT user_id FROM users WHERE user_id = ?`,
        [reviewerId]
      );
      if (uRows.length === 0) {
        return res.status(400).json({ message: "Invalid reviewerId" });
      }
    }

    const [result] = await pool.query(
      `
      INSERT INTO review_request
        (resume_versions_id, requester_id, reviewer_id, visibility, track, request_note, ai_requested)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        resumeVersionsId,
        requesterId,
        vis === "private" ? reviewerId : null,
        vis,
        track || null,
        requestNote || null,
        aiFlag,                     // 🔹 NEW
      ]
    );

    // 🔹 TRIGGER AI FEEDBACK GENERATION ASYNCHRONOUSLY (non-blocking)
    if (aiFlag) {
      generateAiFeedbackAsync(resumeVersionsId).catch((err) => {
        console.error(
          `AI feedback generation failed for resume ${resumeVersionsId}:`,
          err.message
        );
      });
    }

    // 🔹 LEADERBOARD: Increment requester points (+1)
    await pool.query(
      `UPDATE users SET points = points + 1 WHERE user_id = ?`,
      [requesterId]
    );

    return res.status(201).json({
      request_id: result.insertId,
      message: "Review request created",
    });
  } catch (err) {
    console.error("createReviewRequest error:", err);
    return res
      .status(500)
      .json({ message: "Error creating review request" });
  }
};


/**
 * GET /api/review-requests/incoming
 * Requests where current user is the invited reviewer.
 * Used for the left-side "feed" of cards.
 */
// GET /api/review-requests/incoming
export const getIncomingRequests = async (req, res) => {
  const userId = req.user.userId;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        rr.request_id,
        rr.resume_versions_id,
        rr.requester_id,
        rr.reviewer_id,
        rr.visibility,
        rr.track,
        rr.status,
        rr.created_at,
        rr.request_note,

        rq.user_fname  AS requesterFirstName,
        rq.user_lname  AS requesterLastName,
        rq.user_type   AS requesterType,
        pr.headline    AS requesterHeadline

      FROM review_request rr
      JOIN users rq ON rq.user_id = rr.requester_id
      LEFT JOIN profile pr ON pr.user_id = rq.user_id

      WHERE
        -- 1) private requests explicitly addressed to me
        (rr.visibility = 'private' AND rr.reviewer_id = ?)

        OR

        -- 2) public requests from other users (feed)
        (rr.visibility = 'public' AND rr.requester_id <> ?)

      ORDER BY rr.created_at DESC
      `,
      [userId, userId]
    );

    return res.json({ requests: rows });
  } catch (err) {
    console.error("getIncomingRequests error:", err);
    return res
      .status(500)
      .json({ message: "Error fetching incoming review requests" });
  }
};



/**
 * GET /api/review-requests/outgoing
 * Requests created BY the current user (they are the requester).
 */
export const getOutgoingRequests = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [rows] = await pool.query(
      `
      SELECT
        rr.request_id,
        rr.resume_versions_id,
        rr.requester_id,
        rr.reviewer_id,
        rr.request_note,
        rr.status,
        rr.created_at,
        u.user_fname  AS reviewerFirstName,
        u.user_lname  AS reviewerLastName,
        u.user_type   AS reviewerType,
        p.headline    AS reviewerHeadline,
        p.avatar_url  AS reviewerAvatar
      FROM review_request rr
      LEFT JOIN users u ON u.user_id = rr.reviewer_id
      LEFT JOIN profile p ON p.user_id = u.user_id
      WHERE rr.requester_id = ?
      ORDER BY rr.created_at DESC, rr.request_id DESC
      `,
      [userId]
    );

    return res.json({ requests: rows });
  } catch (err) {
    console.error("getOutgoingRequests error:", err);
    return res
      .status(500)
      .json({ message: "Error loading outgoing review requests" });
  }
};

/**
 * POST /api/review-requests/:id/respond
 * Body: { status: 'accepted' | 'declined' | 'cancelled' }
 * Only reviewer can accept/decline.
 * (Optionally requester could "cancel" their own pending request; included here too.)
 */
export const respondToReviewRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // "accepted", "declined", or "cancelled"
    const requestId = Number(id);
    const userId = req.user.userId;

    if (!requestId) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    if (!["accepted", "declined", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        request_id,
        requester_id,
        reviewer_id,
        visibility,
        status AS currentStatus
      FROM review_request
      WHERE request_id = ?
      `,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Review request not found" });
    }

    const reqRow = rows[0];

    const isRequester = reqRow.requester_id === userId;
    const isReviewer = reqRow.reviewer_id === userId;

    // 🔹 Public requests should NOT be accepted/declined
    if (reqRow.visibility === "public") {
      return res.status(400).json({
        message:
          "Public requests cannot be accepted or declined. Just leave a review.",
      });
    }

    // 🔹 Only allow updates while pending
    if (reqRow.currentStatus !== "pending") {
      return res
        .status(400)
        .json({ message: "This request is no longer pending" });
    }

    // 🔹 Rules:
    // - "accepted" / "declined": only invited reviewer can do this
    // - "cancelled": only requester can do this
    if (status === "cancelled") {
      if (!isRequester) {
        return res
          .status(403)
          .json({ message: "You are not allowed to cancel this request" });
      }
    } else {
      // accepted / declined
      if (!isReviewer) {
        return res
          .status(403)
          .json({ message: "You are not allowed to update this request" });
      }
    }

    await pool.query(
      `
      UPDATE review_request
      SET status = ?, responded_at = NOW()
      WHERE request_id = ?
      `,
      [status, requestId]
    );

    return res.json({
      message: "Review request updated",
      status,
    });
  } catch (err) {
    console.error("respondToReviewRequest error:", err);
    return res
      .status(500)
      .json({ message: "Error updating review request" });
  }
};


/**
 * GET /api/review-requests/:id
 * Full detail for a single request.
 * Only requester, reviewer, or admin can see.
 * Returns:
 *  {
 *    request: { ... request + requester/reviewer names + resumeContent + resumeTrack },
 *    aiFeedback,
 *    reviews: [ { review_id, reviewerFirstName, reviewerLastName, reviewerType, review_rating, created_at, commentCount } ],
 *    canSeeAiFeedback,
 *    isRequester,
 *    isReviewer,
 *    isAdmin
 *  }
 */
export const getReviewRequestDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const requestId = Number(id);
    const userId = req.user.userId;
    const myType = req.user.userType; // from JWT payload

    if (!requestId) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        rr.request_id,
        rr.resume_versions_id,
        rr.requester_id,
        rr.reviewer_id,
        rr.request_note,
        rr.status,
        rr.created_at,
        rr.visibility,
        rr.track,
        rr.ai_requested,  -- 🔹 NEW

        req.user_fname  AS requesterFirstName,
        req.user_lname  AS requesterLastName,
        req.user_type   AS requesterType,

        rev.user_fname  AS reviewerFirstName,
        rev.user_lname  AS reviewerLastName,
        rev.user_type   AS reviewerType,

        rv.content      AS resumeContent,
        r.resume_id,
        r.track         AS resumeTrack
      FROM review_request rr
      JOIN users req ON req.user_id = rr.requester_id
      LEFT JOIN users rev ON rev.user_id = rr.reviewer_id
      JOIN resume_versions rv ON rv.resume_versions_id = rr.resume_versions_id
      JOIN resume r ON r.resume_id = rv.resume_id
      WHERE rr.request_id = ?
      `,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Review request not found" });
    }

    const base = rows[0];

    const isRequester = userId === base.requester_id;
    let isReviewer = false;

    if (base.visibility === "private") {
      isReviewer = base.reviewer_id === userId;
    } else if (base.visibility === "public") {
      isReviewer = base.requester_id !== userId;
    }

    const isAdmin = myType === "AD";

    if (!isRequester && !isReviewer && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not allowed to view this request" });
    }

    // 🔹 Only fetch AI feedback if it was requested
    let aiFeedback = null;
    if (base.ai_requested) {
      const [aiRows] = await pool.query(
        `
        SELECT
          ai_feedback_id,
          model,
          feedback_text,
          score,
          created_at
        FROM ai_feedback
        WHERE resume_versions_id = ?
        `,
        [base.resume_versions_id]
      );
      aiFeedback = aiRows[0] || null;
    }

    // Human reviews unchanged...
    const [reviewRows] = await pool.query(
      `
      SELECT
        r.review_id,
        r.review_rating,
        r.created_at,
        r.user_id AS reviewer_id,
        u.user_fname  AS reviewerFirstName,
        u.user_lname  AS reviewerLastName,
        u.user_type   AS reviewerType
      FROM review r
      JOIN users u ON u.user_id = r.user_id
      WHERE r.resume_versions_id = ?
      ORDER BY r.created_at ASC
      `,
      [base.resume_versions_id]
    );

    const reviewIds = reviewRows.map((r) => r.review_id);
    let commentsCountByReview = {};
    if (reviewIds.length) {
      const [countRows] = await pool.query(
        `
        SELECT review_id, COUNT(*) AS commentCount
        FROM review_comment
        WHERE review_id IN (?)
        GROUP BY review_id
        `,
        [reviewIds]
      );
      commentsCountByReview = Object.fromEntries(
        countRows.map((c) => [c.review_id, c.commentCount])
      );
    }

    const reviewsWithCounts = reviewRows.map((r) => ({
      ...r,
      commentCount: commentsCountByReview[r.review_id] || 0,
    }));

    // 🔹 AI visibility: only requester (and optionally admin)
    const canSeeAiFeedback =
      !!base.ai_requested && (isRequester || isAdmin);

    return res.json({
      request: base,        // includes ai_requested
      aiFeedback,
      reviews: reviewsWithCounts,
      canSeeAiFeedback,
      isRequester,
      isReviewer,
      isAdmin,
    });
  } catch (err) {
    console.error("getReviewRequestDetail error:", err);
    return res
      .status(500)
      .json({ message: "Error loading review request detail" });
  }
};

/**
 * PUT /api/review-requests/:id/resume-version
 * Update which resume_versions_id the review request is pointing to
 * Body: { resumeVersionsId }
 * Only the requester can update this
 */
export const updateReviewRequestVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const { resumeVersionsId } = req.body;
    const userId = req.user.userId;

    if (!id || !resumeVersionsId) {
      return res.status(400).json({ message: "id and resumeVersionsId are required" });
    }

    // Verify the user is the requester
    const [requestRows] = await pool.query(
      `SELECT requester_id, request_id FROM review_request WHERE request_id = ?`,
      [id]
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: "Review request not found" });
    }

    if (requestRows[0].requester_id !== userId) {
      return res.status(403).json({ message: "Only the requester can update this" });
    }

    // Verify the new resume version exists
    const [vRows] = await pool.query(
      `SELECT resume_versions_id FROM resume_versions WHERE resume_versions_id = ?`,
      [resumeVersionsId]
    );

    if (vRows.length === 0) {
      return res.status(404).json({ message: "Resume version not found" });
    }

    // Update the review_request
    await pool.query(
      `UPDATE review_request SET resume_versions_id = ? WHERE request_id = ?`,
      [resumeVersionsId, id]
    );

    return res.status(200).json({
      message: "Review request resume version updated successfully",
      request_id: id,
      resume_versions_id: resumeVersionsId,
    });
  } catch (err) {
    console.error("Error updating review request version:", err);
    return res.status(500).json({ message: "Error updating review request version" });
  }
};

export const updateAiSuggestionStatus = async (req, res) => {
  try {
    const { id } = req.params; // review_request.request_id
    const { suggestionId, status } = req.body;
    const requestId = Number(id);
    const userId = req.user.userId;
    const userType = req.user.userType; // 'RQ' | 'RR' | 'AD' etc.

    if (!requestId || !suggestionId) {
      return res
        .status(400)
        .json({ message: "requestId and suggestionId are required" });
    }

    if (!["accepted", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    // 1) Load the review_request to check permissions + find resume_versions_id
    const [reqRows] = await pool.query(
      `
      SELECT
        rr.request_id,
        rr.requester_id,
        rr.resume_versions_id,
        rr.ai_requested
      FROM review_request rr
      WHERE rr.request_id = ?
      `,
      [requestId]
    );

    if (reqRows.length === 0) {
      return res.status(404).json({ message: "Review request not found" });
    }

    const reqRow = reqRows[0];

    // Only requester or admin can update AI suggestions
    const isRequester = reqRow.requester_id === userId;
    const isAdmin = userType === "AD";

    if (!isRequester && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not allowed to update AI suggestions" });
    }

    if (!reqRow.ai_requested) {
      return res
        .status(400)
        .json({ message: "AI feedback was not requested for this review" });
    }

    // 2) Load the ai_feedback for this resume version
    const [aiRows] = await pool.query(
      `
      SELECT
        ai_feedback_id,
        feedback_text
      FROM ai_feedback
      WHERE resume_versions_id = ?
      `,
      [reqRow.resume_versions_id]
    );

    if (aiRows.length === 0) {
      return res
        .status(404)
        .json({ message: "AI feedback not found for this request" });
    }

    const aiRow = aiRows[0];

    // 3) Parse the JSON, update the matching suggestion's status
    let json;
    try {
      json = JSON.parse(aiRow.feedback_text || "{}");
    } catch (err) {
      console.error("Failed to parse ai_feedback.feedback_text:", err);
      return res
        .status(500)
        .json({ message: "Stored AI feedback is invalid JSON" });
    }

    if (!Array.isArray(json.suggestions)) {
      return res
        .status(400)
        .json({ message: "AI feedback has no suggestions array" });
    }

    let found = false;
    json.suggestions = json.suggestions.map((s) => {
      if (String(s.id) === String(suggestionId)) {
        found = true;
        return {
          ...s,
          status, // overwrite
        };
      }
      return s;
    });

    if (!found) {
      return res
        .status(404)
        .json({ message: "Suggestion with that id not found" });
    }

    // 4) Save updated JSON back to ai_feedback
    const updatedText = JSON.stringify(json);

    await pool.query(
      `
      UPDATE ai_feedback
      SET feedback_text = ?
      WHERE ai_feedback_id = ?
      `,
      [updatedText, aiRow.ai_feedback_id]
    );

    return res.json({
      message: "AI suggestion status updated",
      suggestionId,
      status,
    });
  } catch (err) {
    console.error("updateAiSuggestionStatus error:", err);
    return res
      .status(500)
      .json({ message: "Error updating AI suggestion status" });
  }
};