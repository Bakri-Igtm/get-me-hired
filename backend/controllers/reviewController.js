import pool from "../db.js";

export const createOrUpdateReview = async (req, res) => {
  const { resumeVersionsId, rating, comment } = req.body;
  const { userId, userType } = req.user; // from JWT

  if (!resumeVersionsId || rating == null) {
    return res
      .status(400)
      .json({ message: "resumeVersionsId and rating are required" });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: "rating must be between 1 and 5" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Get resume version + owner
    const [rvRows] = await conn.query(
      `
      SELECT 
        rv.resume_versions_id,
        r.resume_id,
        r.user_id AS owner_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [resumeVersionsId]
    );

    if (rvRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Resume version not found" });
    }

    const { owner_id } = rvRows[0];

    // 2) Owner can always review their own resume
    if (userId !== owner_id) {
      // Non-owner: must be either public or directly requested
      const [reqRows] = await conn.query(
        `
        SELECT request_id, visibility, reviewer_id, status
        FROM review_request
        WHERE resume_versions_id = ?
          AND (
            visibility = 'public'
            OR (
              visibility = 'direct'
              AND reviewer_id = ?
              AND status IN ('pending','accepted')
            )
          )
        `,
        [resumeVersionsId, userId]
      );

      if (reqRows.length === 0) {
        await conn.rollback();
        return res.status(403).json({
          message:
            "You don't have permission to review this resume version (not public and no direct request for you).",
        });
      }
    }

    // 3) Upsert review (one per user per version)
    const [existingRows] = await conn.query(
      `SELECT review_id FROM review
       WHERE resume_versions_id = ? AND user_id = ?`,
      [resumeVersionsId, userId]
    );

    let reviewId;

    if (existingRows.length > 0) {
      // update existing rating
      reviewId = existingRows[0].review_id;
      await conn.query(
        `UPDATE review SET review_rating = ? WHERE review_id = ?`,
        [rating, reviewId]
      );
    } else {
      // create new review
      const [result] = await conn.query(
        `INSERT INTO review (resume_versions_id, user_id, review_rating)
         VALUES (?, ?, ?)`,
        [resumeVersionsId, userId, rating]
      );
      reviewId = result.insertId;
    }

    // 4) Optional comment
    if (comment && comment.trim() !== "") {
      await conn.query(
        `INSERT INTO review_comment (review_id, user_id, comment_text)
         VALUES (?, ?, ?)`,
        [reviewId, userId, comment.trim()]
      );
    }

    await conn.commit();

    return res.status(201).json({
      review_id: reviewId,
      message: "Review saved successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error("Error creating/updating review:", err);
    return res.status(500).json({ message: "Error saving review" });
  } finally {
    conn.release();
  }
};


// GET /api/reviews/version/:resumeVersionsId
export const getReviewsForVersion = async (req, res) => {
  const { resumeVersionsId } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        rv.review_id,
        rv.resume_versions_id,
        rv.user_id AS reviewer_id,
        u.user_fname AS reviewer_fname,
        u.user_lname AS reviewer_lname,
        u.user_type,
        rv.review_rating,
        rv.created_at,
        rc.comment_text
      FROM review rv
      JOIN users u ON rv.user_id = u.user_id
      LEFT JOIN review_comment rc ON rc.review_id = rv.review_id
      WHERE rv.resume_versions_id = ?
      ORDER BY rv.created_at DESC
      `,
      [resumeVersionsId]
    );

    const mapped = rows.map((row) => ({
      review_id: row.review_id,
      resume_versions_id: row.resume_versions_id,
      reviewer_id: row.reviewer_id,
      reviewer_name: `${row.reviewer_fname} ${row.reviewer_lname}`,
      user_type: row.user_type, // "RQ" or "RR"
      review_rating: row.review_rating,
      comment_text: row.comment_text,
      created_at: row.created_at,
    }));

    return res.json(mapped);
  } catch (err) {
    console.error("Error fetching reviews:", err);
    return res.status(500).json({ message: "Error fetching reviews" });
  }
};