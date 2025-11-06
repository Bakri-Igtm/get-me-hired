import pool from "../db.js";

// POST /api/reviews
export const createOrUpdateReview = async (req, res) => {
  const { resumeVersionsId, rating, comment } = req.body;
  const userId = req.user.userId; // from JWT

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

    // ensure resume version exists (optional but helpful)
    const [rvRows] = await conn.query(
      `SELECT resume_versions_id FROM resume_versions WHERE resume_versions_id = ?`,
      [resumeVersionsId]
    );
    if (rvRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Resume version not found" });
    }

    // check if this user already has a review for this version
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

    // if there's a comment, add it as a separate row
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
        r.review_id,
        r.review_rating,
        r.created_at,
        u.user_id,
        u.user_fname,
        u.user_lname,
        u.user_type,
        rc.review_comment_id,
        rc.comment_text,
        rc.created_at AS comment_created_at
      FROM review r
      JOIN users u ON r.user_id = u.user_id
      LEFT JOIN review_comment rc ON rc.review_id = r.review_id
      WHERE r.resume_versions_id = ?
      ORDER BY r.created_at DESC, rc.created_at ASC
      `,
      [resumeVersionsId]
    );

    // group comments under each review
    const reviewsMap = new Map();

    for (const row of rows) {
      if (!reviewsMap.has(row.review_id)) {
        reviewsMap.set(row.review_id, {
          review_id: row.review_id,
          rating: row.review_rating,
          created_at: row.created_at,
          reviewer: {
            user_id: row.user_id,
            firstName: row.user_fname,
            lastName: row.user_lname,
            user_type: row.user_type, // 'RQ' or 'RR' → this is how you tell who wrote it
          },
          comments: [],
        });
      }

      if (row.review_comment_id) {
        reviewsMap.get(row.review_id).comments.push({
          review_comment_id: row.review_comment_id,
          comment_text: row.comment_text,
          created_at: row.comment_created_at,
        });
      }
    }

    return res.json(Array.from(reviewsMap.values()));
  } catch (err) {
    console.error("Error fetching reviews:", err);
    return res.status(500).json({ message: "Error fetching reviews" });
  }
};
