// controllers/reviewRequestController.js
import pool from "../db.js";

/**
 * POST /api/review-requests
 * Body: { resumeVersionsId, reviewerId, requestNote }
 * requester = current logged-in user (from token)
 */
export const createReviewRequest = async (req, res) => {
  try {
    const requesterId = req.user.userId;
    const { resumeVersionsId, reviewerId, requestNote } = req.body;

    if (!resumeVersionsId || !reviewerId) {
      return res
        .status(400)
        .json({ message: "resumeVersionsId and reviewerId are required" });
    }

    // 1) Check that the resume version exists and belongs to requester
    const [rvRows] = await pool.query(
      `
      SELECT rv.resume_versions_id, r.resume_id, r.user_id AS owner_id
      FROM resume_versions rv
      JOIN resume r ON r.resume_id = rv.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [resumeVersionsId]
    );

    if (rvRows.length === 0) {
      return res.status(404).json({ message: "Resume version not found" });
    }

    const rv = rvRows[0];
    if (rv.owner_id !== requesterId) {
      return res
        .status(403)
        .json({ message: "You can only request reviews on your own resume" });
    }

    // 2) Ensure reviewer exists
    const [reviewerRows] = await pool.query(
      `SELECT user_id FROM users WHERE user_id = ?`,
      [reviewerId]
    );
    if (reviewerRows.length === 0) {
      return res.status(404).json({ message: "Reviewer user not found" });
    }

    // 3) Insert review_request (status = 'pending')
    try {
      const [result] = await pool.query(
        `
        INSERT INTO review_request
          (resume_versions_id, requester_id, reviewer_id, request_note, status)
        VALUES (?, ?, ?, ?, 'pending')
        `,
        [resumeVersionsId, requesterId, reviewerId, requestNote || null]
      );

      return res.status(201).json({
        message: "Review request created",
        request_id: result.insertId,
      });
    } catch (err) {
      // handle duplicate active request by unique constraint
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          message:
            "You already have an active request for this reviewer on this version",
        });
      }
      throw err;
    }
  } catch (err) {
    console.error("createReviewRequest error:", err);
    return res.status(500).json({ message: "Error creating review request" });
  }
};

/**
 * GET /api/review-requests/incoming
 * Requests where current user is the invited reviewer.
 * Used for the left-side "feed" of cards.
 */
export const getIncomingRequests = async (req, res) => {
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
        u.user_fname  AS requesterFirstName,
        u.user_lname  AS requesterLastName,
        u.user_type   AS requesterType,
        p.headline    AS requesterHeadline,
        p.avatar_url  AS requesterAvatar
      FROM review_request rr
      JOIN users u ON u.user_id = rr.requester_id
      LEFT JOIN profile p ON p.user_id = u.user_id
      WHERE rr.reviewer_id = ?
      ORDER BY rr.created_at DESC, rr.request_id DESC
      `,
      [userId]
    );

    return res.json({ requests: rows });
  } catch (err) {
    console.error("getIncomingRequests error:", err);
    return res
      .status(500)
      .json({ message: "Error loading incoming review requests" });
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
      JOIN users u ON u.user_id = rr.reviewer_id
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
    const userId = req.user.userId;
    const { id } = req.params;
    const { status } = req.body; // 'accepted', 'declined', 'cancelled', etc.

    const validStatuses = ["accepted", "declined", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // get the existing request to enforce who is allowed to update it
    const [rows] = await pool.query(
      `
      SELECT
        request_id,
        requester_id,
        reviewer_id,
        status
      FROM review_request
      WHERE request_id = ?
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Review request not found" });
    }

    const reqRow = rows[0];
    const isReviewer = reqRow.reviewer_id === userId;
    const isRequester = reqRow.requester_id === userId;

    if (!isReviewer && !isRequester) {
      return res
        .status(403)
        .json({ message: "You are not allowed to update this request" });
    }

    // simple rule: only pending requests can change
    if (reqRow.status !== "pending") {
      return res
        .status(400)
        .json({ message: "This request is no longer pending" });
    }

    // if requester is cancelling, allow status='cancelled'
    // if reviewer, allow accepted/declined
    if (isReviewer && (status === "accepted" || status === "declined")) {
      // ok
    } else if (isRequester && status === "cancelled") {
      // ok
    } else {
      return res
        .status(403)
        .json({ message: "You are not allowed to set this status" });
    }

    const [result] = await pool.query(
      `
      UPDATE review_request
      SET status = ?, responded_at = NOW()
      WHERE request_id = ?
      `,
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res
        .status(400)
        .json({ message: "Failed to update review request" });
    }

    return res.json({ message: "Review request updated", status });
  } catch (err) {
    console.error("respondToReviewRequest error:", err);
    return res
      .status(500)
      .json({ message: "Error responding to review request" });
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

    // Base request + requester + reviewer + resume version/content
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
      JOIN users rev ON rev.user_id = rr.reviewer_id
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

    // Authorization
    const isRequester = userId === base.requester_id;
    const isReviewer = userId === base.reviewer_id;
    const isAdmin = myType === "AD";

    if (!isRequester && !isReviewer && !isAdmin) {
      return res.status(403).json({ message: "Not allowed to view this request" });
    }

    // AI feedback for this resume version
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
    const aiFeedback = aiRows[0] || null;

    // Human reviews for this version
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

    // For each review, count comments
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

    return res.json({
      request: base,
      aiFeedback,
      reviews: reviewsWithCounts,
      canSeeAiFeedback: isRequester || isAdmin,
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

// import pool from "../db.js";

// export const createReviewRequest = async (req, res) => {
//   const { resumeVersionsId, reviewerId, requestNote, visibility, isPublic } =
//     req.body;
//   const requesterId = req.user.userId;

//   if (!resumeVersionsId) {
//     return res
//       .status(400)
//       .json({ message: "resumeVersionsId is required" });
//   }

//   // 1) Determine visibility
//   let finalVisibility = "direct";
//   if (visibility === "public" || isPublic === true) {
//     finalVisibility = "public";
//   }

//   // 2) For direct requests, reviewerId is required
//   if (finalVisibility === "direct" && !reviewerId) {
//     return res
//       .status(400)
//       .json({ message: "reviewerId is required for direct requests" });
//   }

//   // For public, reviewerId can be null
//   const finalReviewerId = finalVisibility === "public" ? null : reviewerId;

//   const conn = await pool.getConnection();
//   try {
//     await conn.beginTransaction();

//     // Ensure resume version exists
//     const [rvRows] = await conn.query(
//       `SELECT resume_versions_id FROM resume_versions WHERE resume_versions_id = ?`,
//       [resumeVersionsId]
//     );
//     if (rvRows.length === 0) {
//       await conn.rollback();
//       return res
//         .status(404)
//         .json({ message: "Resume version not found" });
//     }

//     // Insert review request
//     const [result] = await conn.query(
//       `INSERT INTO review_request 
//         (resume_versions_id, requester_id, reviewer_id, request_note, visibility)
//        VALUES (?, ?, ?, ?, ?)`,
//       [
//         resumeVersionsId,
//         requesterId,
//         finalReviewerId,
//         requestNote || null,
//         finalVisibility,
//       ]
//     );

//     await conn.commit();

//     return res.status(201).json({
//       request_id: result.insertId,
//       visibility: finalVisibility,
//       message:
//         finalVisibility === "public"
//           ? "Public review request created"
//           : "Direct review request created",
//     });
//   } catch (err) {
//     await conn.rollback();
//     console.error("Error creating review request:", err);

//     if (err.code === "ER_DUP_ENTRY") {
//       return res.status(409).json({
//         message: "Request already exists for this reviewer/version",
//       });
//     }

//     // optional: log specific null/foreign key errors more nicely later
//     return res.status(500).json({ message: "Error creating review request" });
//   } finally {
//     conn.release();
//   }
// };



// // GET /api/review-requests/incoming
// export const getIncomingRequests = async (req, res) => {
//   const userId = req.user.userId;

//   try {
//     const [rows] = await pool.query(
//       `
//       SELECT 
//         rr.request_id,
//         rr.resume_versions_id,
//         rr.status,
//         rr.created_at,
//         rr.responded_at,
//         rr.request_note,
//         u.user_id AS requester_id,
//         u.user_fname AS requester_fname,
//         u.user_lname AS requester_lname
//       FROM review_request rr
//       JOIN users u ON rr.requester_id = u.user_id
//       WHERE rr.reviewer_id = ?
//       ORDER BY rr.created_at DESC
//       `,
//       [userId]
//     );

//     return res.json(rows);
//   } catch (err) {
//     console.error("Error fetching incoming requests:", err);
//     return res.status(500).json({ message: "Error fetching incoming requests" });
//   }
// };

// // GET /api/review-requests/outgoing
// export const getOutgoingRequests = async (req, res) => {
//   const userId = req.user.userId;

//   try {
//     const [rows] = await pool.query(
//       `
//       SELECT 
//         rr.request_id,
//         rr.resume_versions_id,
//         rr.status,
//         rr.created_at,
//         rr.responded_at,
//         rr.request_note,
//         u.user_id AS reviewer_id,
//         u.user_fname AS reviewer_fname,
//         u.user_lname AS reviewer_lname
//       FROM review_request rr
//       JOIN users u ON rr.reviewer_id = u.user_id
//       WHERE rr.requester_id = ?
//       ORDER BY rr.created_at DESC
//       `,
//       [userId]
//     );

//     return res.json(rows);
//   } catch (err) {
//     console.error("Error fetching outgoing requests:", err);
//     return res.status(500).json({ message: "Error fetching outgoing requests" });
//   }
// };

// // POST /api/review-requests/:id/respond
// export const respondToReviewRequest = async (req, res) => {
//   const { id } = req.params;
//   const { status } = req.body;
//   const userId = req.user.userId;

//   // Only allow certain status values
//   const allowedStatuses = ["accepted", "declined"];
//   if (!allowedStatuses.includes(status)) {
//     return res.status(400).json({ message: "Invalid status" });
//   }

//   const conn = await pool.getConnection();
//   try {
//     await conn.beginTransaction();

//     // ensure this request exists and belongs to this reviewer
//     const [rows] = await conn.query(
//       `SELECT request_id, reviewer_id, status FROM review_request WHERE request_id = ?`,
//       [id]
//     );

//     if (rows.length === 0) {
//       await conn.rollback();
//       return res.status(404).json({ message: "Review request not found" });
//     }

//     const request = rows[0];
//     if (request.reviewer_id !== userId) {
//       await conn.rollback();
//       return res
//         .status(403)
//         .json({ message: "You are not the reviewer for this request" });
//     }

//     // update status & responded_at
//     await conn.query(
//       `UPDATE review_request 
//        SET status = ?, responded_at = NOW()
//        WHERE request_id = ?`,
//       [status, id]
//     );

//     await conn.commit();

//     return res.json({ message: `Request ${status}` });
//   } catch (err) {
//     await conn.rollback();
//     console.error("Error responding to review request:", err);
//     return res.status(500).json({ message: "Error responding to request" });
//   } finally {
//     conn.release();
//   }
// };
