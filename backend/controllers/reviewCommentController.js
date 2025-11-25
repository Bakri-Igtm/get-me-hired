// controllers/reviewCommentController.js
import pool from "../db.js";

// GET /api/reviews/:id/comments
export const listReviewComments = async (req, res) => {
  try {
    const { id } = req.params;
    const reviewId = Number(id);
    if (!reviewId) return res.status(400).json({ message: "Invalid review id" });

    const [rows] = await pool.query(
      `
      SELECT
        rc.review_comment_id,
        rc.review_id,
        rc.user_id,
        rc.comment_text,
        rc.created_at,
        u.user_fname AS firstName,
        u.user_lname AS lastName
      FROM review_comment rc
      JOIN users u ON u.user_id = rc.user_id
      WHERE rc.review_id = ?
      ORDER BY rc.created_at ASC
      `,
      [reviewId]
    );

    return res.json({ comments: rows });
  } catch (err) {
    console.error("listReviewComments error:", err);
    return res.status(500).json({ message: "Error loading comments" });
  }
};

// POST /api/reviews/:id/comments
export const addReviewComment = async (req, res) => {
  try {
    const { id } = req.params;
    const reviewId = Number(id);
    const userId = req.user.userId;
    const { comment_text } = req.body;

    if (!reviewId || !comment_text) {
      return res
        .status(400)
        .json({ message: "Review id and comment_text are required" });
    }

    // Get review + requester for permission check
    const [reviewRows] = await pool.query(
      `
      SELECT
        r.review_id,
        r.user_id AS reviewAuthorId,
        rr.requester_id
      FROM review r
      JOIN review_request rr ON rr.resume_versions_id = r.resume_versions_id
      WHERE r.review_id = ?
      `,
      [reviewId]
    );
    if (reviewRows.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }
    const review = reviewRows[0];

    // Only review author or requester can comment
    if (userId !== review.reviewAuthorId && userId !== review.requester_id) {
      return res
        .status(403)
        .json({ message: "You are not allowed to comment on this review" });
    }

    const [result] = await pool.query(
      `
      INSERT INTO review_comment (review_id, user_id, comment_text)
      VALUES (?, ?, ?)
      `,
      [reviewId, userId, comment_text]
    );

    return res
      .status(201)
      .json({ review_comment_id: result.insertId, message: "Comment added" });
  } catch (err) {
    console.error("addReviewComment error:", err);
    return res.status(500).json({ message: "Error adding comment" });
  }
};
