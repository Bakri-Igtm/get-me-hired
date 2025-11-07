import pool from "../db.js";

export const createReviewRequest = async (req, res) => {
  const { resumeVersionsId, reviewerId, requestNote, visibility, isPublic } =
    req.body;
  const requesterId = req.user.userId;

  if (!resumeVersionsId) {
    return res
      .status(400)
      .json({ message: "resumeVersionsId is required" });
  }

  // 1) Determine visibility
  let finalVisibility = "direct";
  if (visibility === "public" || isPublic === true) {
    finalVisibility = "public";
  }

  // 2) For direct requests, reviewerId is required
  if (finalVisibility === "direct" && !reviewerId) {
    return res
      .status(400)
      .json({ message: "reviewerId is required for direct requests" });
  }

  // For public, reviewerId can be null
  const finalReviewerId = finalVisibility === "public" ? null : reviewerId;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure resume version exists
    const [rvRows] = await conn.query(
      `SELECT resume_versions_id FROM resume_versions WHERE resume_versions_id = ?`,
      [resumeVersionsId]
    );
    if (rvRows.length === 0) {
      await conn.rollback();
      return res
        .status(404)
        .json({ message: "Resume version not found" });
    }

    // Insert review request
    const [result] = await conn.query(
      `INSERT INTO review_request 
        (resume_versions_id, requester_id, reviewer_id, request_note, visibility)
       VALUES (?, ?, ?, ?, ?)`,
      [
        resumeVersionsId,
        requesterId,
        finalReviewerId,
        requestNote || null,
        finalVisibility,
      ]
    );

    await conn.commit();

    return res.status(201).json({
      request_id: result.insertId,
      visibility: finalVisibility,
      message:
        finalVisibility === "public"
          ? "Public review request created"
          : "Direct review request created",
    });
  } catch (err) {
    await conn.rollback();
    console.error("Error creating review request:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Request already exists for this reviewer/version",
      });
    }

    // optional: log specific null/foreign key errors more nicely later
    return res.status(500).json({ message: "Error creating review request" });
  } finally {
    conn.release();
  }
};



// GET /api/review-requests/incoming
export const getIncomingRequests = async (req, res) => {
  const userId = req.user.userId;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        rr.request_id,
        rr.resume_versions_id,
        rr.status,
        rr.created_at,
        rr.responded_at,
        rr.request_note,
        u.user_id AS requester_id,
        u.user_fname AS requester_fname,
        u.user_lname AS requester_lname
      FROM review_request rr
      JOIN users u ON rr.requester_id = u.user_id
      WHERE rr.reviewer_id = ?
      ORDER BY rr.created_at DESC
      `,
      [userId]
    );

    return res.json(rows);
  } catch (err) {
    console.error("Error fetching incoming requests:", err);
    return res.status(500).json({ message: "Error fetching incoming requests" });
  }
};

// GET /api/review-requests/outgoing
export const getOutgoingRequests = async (req, res) => {
  const userId = req.user.userId;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        rr.request_id,
        rr.resume_versions_id,
        rr.status,
        rr.created_at,
        rr.responded_at,
        rr.request_note,
        u.user_id AS reviewer_id,
        u.user_fname AS reviewer_fname,
        u.user_lname AS reviewer_lname
      FROM review_request rr
      JOIN users u ON rr.reviewer_id = u.user_id
      WHERE rr.requester_id = ?
      ORDER BY rr.created_at DESC
      `,
      [userId]
    );

    return res.json(rows);
  } catch (err) {
    console.error("Error fetching outgoing requests:", err);
    return res.status(500).json({ message: "Error fetching outgoing requests" });
  }
};

// POST /api/review-requests/:id/respond
export const respondToReviewRequest = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.userId;

  // Only allow certain status values
  const allowedStatuses = ["accepted", "declined"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ensure this request exists and belongs to this reviewer
    const [rows] = await conn.query(
      `SELECT request_id, reviewer_id, status FROM review_request WHERE request_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Review request not found" });
    }

    const request = rows[0];
    if (request.reviewer_id !== userId) {
      await conn.rollback();
      return res
        .status(403)
        .json({ message: "You are not the reviewer for this request" });
    }

    // update status & responded_at
    await conn.query(
      `UPDATE review_request 
       SET status = ?, responded_at = NOW()
       WHERE request_id = ?`,
      [status, id]
    );

    await conn.commit();

    return res.json({ message: `Request ${status}` });
  } catch (err) {
    await conn.rollback();
    console.error("Error responding to review request:", err);
    return res.status(500).json({ message: "Error responding to request" });
  } finally {
    conn.release();
  }
};
