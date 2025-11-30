// backend/controllers/profileController.js
import pool from "../db.js";

/** GET /api/profile/me */
export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Users basic info (name/email), plus 1:1 profile
    const [userRows] = await pool.query(
      `SELECT u.user_id, u.user_fname AS firstName, u.user_lname AS lastName, u.email, u.user_type
         FROM users u
        WHERE u.user_id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const [profileRows] = await pool.query(
      `SELECT user_id, headline, summary, location, avatar_url,
              website_url, github_url, linkedin_url,
              created_at, updated_at
         FROM profile WHERE user_id = ?`,
      [userId]
    );

    // Child collections
    const [
      [educationRows],
      [experienceRows],
      [linkRows],
      reviewCountObj,
      requestCountObj,
      [requestStatusRows],
      [reviewRatingRows],
      [badgeRules],
    ] = await Promise.all([
      pool.query(
        `SELECT education_id, school, degree, field_of_study, start_date, end_date,
                currently_attending, grade, description, display_order, created_at, updated_at
           FROM education
          WHERE user_id = ?
          ORDER BY display_order ASC, start_date DESC, education_id DESC`,
        [userId]
      ),
      pool.query(
        `SELECT experience_id, title, company, employment_type, location, start_date, end_date,
                currently_working, description, display_order, created_at, updated_at
           FROM experience
          WHERE user_id = ?
          ORDER BY display_order ASC, start_date DESC, experience_id DESC`,
        [userId]
      ),
      pool.query(
        `SELECT link_id, label, url, display_order, created_at, updated_at
           FROM profile_link
          WHERE user_id = ?
          ORDER BY display_order ASC, link_id DESC`,
        [userId]
      ),
      // Count reviews
      pool.query(`SELECT COUNT(*) AS reviewCount FROM review WHERE user_id = ?`, [userId]).then(([rows]) => rows[0]),
      // Count requests
      pool.query(`SELECT COUNT(*) AS requestCount FROM review_request WHERE requester_id = ?`, [userId]).then(([rows]) => rows[0]),
      // Request status breakdown
      pool.query(`SELECT status, COUNT(*) as count FROM review_request WHERE requester_id = ? GROUP BY status`, [userId]),
      // Review rating breakdown
      pool.query(`SELECT review_rating, COUNT(*) as count FROM review WHERE user_id = ? GROUP BY review_rating`, [userId]),
      // Get badge rules
      pool.query(`SELECT * FROM badge`),
    ]);

    const reviewCount = parseInt(reviewCountObj?.reviewCount || 0, 10);
    const requestCount = parseInt(requestCountObj?.requestCount || 0, 10);
    
    // Format breakdowns
    const requestStatus = {};
    (requestStatusRows || []).forEach(r => { requestStatus[r.status] = r.count; });

    const reviewRatings = {};
    (reviewRatingRows || []).forEach(r => { reviewRatings[r.review_rating] = r.count; });

    // Calculate Badges
    const earnedBadges = [];
    const userType = userRows[0].user_type;

    // 1. Review Badge (Everyone can earn, but specifically mentioned for Reviewers)
    const reviewBadges = badgeRules
      .filter((b) => reviewCount >= b.review_count) // e.g. 20 >= 0 (Rookie), 20 < 50 (Sergeant)
      .sort((a, b) => b.review_count - a.review_count); // Descending

    if (reviewBadges.length > 0) {
      // Take the highest one
      earnedBadges.push({ ...reviewBadges[0], category: "Reviewer Badge" });
    } else {
      // Default to Rookie if no badge earned
      earnedBadges.push({ badge_name: "Rookie", category: "Reviewer Badge" });
    }

    // 2. Request Badge (Only Requesters)
    if (userType === "RQ") {
      const requestBadges = badgeRules
        .filter((b) => requestCount >= b.request_count)
        .sort((a, b) => b.request_count - a.request_count);

      if (requestBadges.length > 0) {
        earnedBadges.push({ ...requestBadges[0], category: "Requester Badge" });
      } else {
        // Default to Rookie if no badge earned
        earnedBadges.push({ badge_name: "Rookie", category: "Requester Badge" });
      }
    }

    return res.json({
      user: userRows[0],
      profile: profileRows[0] || null,
      education: educationRows,
      experience: experienceRows,
      links: linkRows,
      badges: earnedBadges,
      stats: { 
        reviewCount, 
        requestCount,
        requestStatus,
        reviewRatings
      },
    });
  } catch (err) {
    console.error("getMyProfile error:", err);
    return res.status(500).json({ message: "Server error loading profile" });
  }
};

/** PUT /api/profile  (upsert core profile) */
export const upsertProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      headline = null,
      summary = null,
      location = null,
      avatar_url = null,
      website_url = null,
      github_url = null,
      linkedin_url = null,
    } = req.body;

    await pool.query(
      `INSERT INTO profile
         (user_id, headline, summary, location, avatar_url, website_url, github_url, linkedin_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         headline = VALUES(headline),
         summary = VALUES(summary),
         location = VALUES(location),
         avatar_url = VALUES(avatar_url),
         website_url = VALUES(website_url),
         github_url = VALUES(github_url),
         linkedin_url = VALUES(linkedin_url),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, headline, summary, location, avatar_url, website_url, github_url, linkedin_url]
    );

    return res.json({ message: "Profile saved" });
  } catch (err) {
    console.error("upsertProfile error:", err);
    return res.status(500).json({ message: "Error saving profile" });
  }
};

/** POST /api/profile/education */
export const addEducation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      school,
      degree = null,
      field_of_study = null,
      start_date = null,
      end_date = null,
      currently_attending = 0,
      grade = null,
      description = null,
      display_order = 0,
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO education
         (user_id, school, degree, field_of_study, start_date, end_date,
          currently_attending, grade, description, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, school, degree, field_of_study, start_date, end_date, currently_attending, grade, description, display_order]
    );

    return res.status(201).json({ education_id: result.insertId });
  } catch (err) {
    console.error("addEducation error:", err);
    return res.status(500).json({ message: "Error adding education" });
  }
};

/** PUT /api/profile/education/:id */
export const updateEducation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const fields = [
      "school","degree","field_of_study","start_date","end_date",
      "currently_attending","grade","description","display_order"
    ];
    const updates = [];
    const params = [];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    });
    if (updates.length === 0) return res.json({ message: "No changes" });

    params.push(userId, id);
    const [r] = await pool.query(
      `UPDATE education SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND education_id = ?`,
      params
    );
    if (r.affectedRows === 0) return res.status(404).json({ message: "Education not found" });
    return res.json({ message: "Education updated" });
  } catch (err) {
    console.error("updateEducation error:", err);
    return res.status(500).json({ message: "Error updating education" });
  }
};

/** DELETE /api/profile/education/:id */
export const deleteEducation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const [r] = await pool.query(
      `DELETE FROM education WHERE user_id = ? AND education_id = ?`,
      [userId, id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ message: "Education not found" });
    return res.json({ message: "Education removed" });
  } catch (err) {
    console.error("deleteEducation error:", err);
    return res.status(500).json({ message: "Error deleting education" });
  }
};

/** POST /api/profile/experience */
export const addExperience = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      title,
      company,
      employment_type = "Other",
      location = null,
      start_date = null,
      end_date = null,
      currently_working = 0,
      description = null,
      display_order = 0,
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO experience
         (user_id, title, company, employment_type, location, start_date, end_date,
          currently_working, description, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, company, employment_type, location, start_date, end_date, currently_working, description, display_order]
    );

    return res.status(201).json({ experience_id: result.insertId });
  } catch (err) {
    console.error("addExperience error:", err);
    return res.status(500).json({ message: "Error adding experience" });
  }
};

/** PUT /api/profile/experience/:id */
export const updateExperience = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const fields = [
      "title","company","employment_type","location","start_date","end_date",
      "currently_working","description","display_order"
    ];
    const updates = [];
    const params = [];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    });
    if (updates.length === 0) return res.json({ message: "No changes" });

    params.push(userId, id);
    const [r] = await pool.query(
      `UPDATE experience SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND experience_id = ?`,
      params
    );
    if (r.affectedRows === 0) return res.status(404).json({ message: "Experience not found" });
    return res.json({ message: "Experience updated" });
  } catch (err) {
    console.error("updateExperience error:", err);
    return res.status(500).json({ message: "Error updating experience" });
  }
};

/** DELETE /api/profile/experience/:id */
export const deleteExperience = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const [r] = await pool.query(
      `DELETE FROM experience WHERE user_id = ? AND experience_id = ?`,
      [userId, id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ message: "Experience not found" });
    return res.json({ message: "Experience removed" });
  } catch (err) {
    console.error("deleteExperience error:", err);
    return res.status(500).json({ message: "Error deleting experience" });
  }
};

/** POST /api/profile/links */
export const addLink = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { label, url, display_order = 0 } = req.body;
    const [r] = await pool.query(
      `INSERT INTO profile_link (user_id, label, url, display_order)
       VALUES (?, ?, ?, ?)`,
      [userId, label, url, display_order]
    );
    return res.status(201).json({ link_id: r.insertId });
  } catch (err) {
    console.error("addLink error:", err);
    return res.status(500).json({ message: "Error adding link" });
  }
};

/** DELETE /api/profile/links/:id */
export const deleteLink = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const [r] = await pool.query(
      `DELETE FROM profile_link WHERE user_id = ? AND link_id = ?`,
      [userId, id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ message: "Link not found" });
    return res.json({ message: "Link removed" });
  } catch (err) {
    console.error("deleteLink error:", err);
    return res.status(500).json({ message: "Error deleting link" });
  }
};

export const getPublicProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = Number(id);
    if (!userId) {
      return res.status(400).json({ message: "Invalid member id" });
    }

    // 1) basic user info
    const [userRows] = await pool.query(
      `SELECT u.user_id, u.user_fname AS firstName, u.user_lname AS lastName, u.email, u.user_type
         FROM users u
        WHERE u.user_id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2) profile row
    const [profileRows] = await pool.query(
      `SELECT user_id, headline, summary, location, avatar_url,
              website_url, github_url, linkedin_url,
              created_at, updated_at
         FROM profile WHERE user_id = ?`,
      [userId]
    );

    // 3) child collections
    const [
      [educationRows],
      [experienceRows],
      [linkRows],
      reviewCountObj,
      requestCountObj,
      [badgeRules],
    ] = await Promise.all([
      pool.query(
        `SELECT education_id, school, degree, field_of_study, start_date, end_date,
                currently_attending, grade, description, display_order, created_at, updated_at
           FROM education
          WHERE user_id = ?
          ORDER BY display_order ASC, start_date DESC, education_id DESC`,
        [userId]
      ),
      pool.query(
        `SELECT experience_id, title, company, employment_type, location, start_date, end_date,
                currently_working, description, display_order, created_at, updated_at
           FROM experience
          WHERE user_id = ?
          ORDER BY display_order ASC, start_date DESC, experience_id DESC`,
        [userId]
      ),
      pool.query(
        `SELECT link_id, label, url, display_order, created_at, updated_at
           FROM profile_link
          WHERE user_id = ?
          ORDER BY display_order ASC, link_id DESC`,
        [userId]
      ),
      pool.query(`SELECT COUNT(*) AS reviewCount FROM review WHERE user_id = ?`, [userId]).then(([rows]) => rows[0]),
      pool.query(`SELECT COUNT(*) AS requestCount FROM review_request WHERE requester_id = ?`, [userId]).then(([rows]) => rows[0]),
      pool.query(`SELECT * FROM badge`),
    ]);

    const reviewCount = parseInt(reviewCountObj?.reviewCount || 0, 10);
    const requestCount = parseInt(requestCountObj?.requestCount || 0, 10);

    // Calculate Badges
    const earnedBadges = [];
    const userType = userRows[0].user_type;

    // 1. Review Badge
    const reviewBadges = badgeRules
      .filter((b) => reviewCount >= b.review_count)
      .sort((a, b) => b.review_count - a.review_count);

    if (reviewBadges.length > 0) {
      earnedBadges.push({ ...reviewBadges[0], category: "Reviewer Badge" });
    } else {
      earnedBadges.push({ badge_name: "Rookie", category: "Reviewer Badge" });
    }

    // 2. Request Badge (Only Requesters)
    if (userType === "RQ") {
      const requestBadges = badgeRules
        .filter((b) => requestCount >= b.request_count)
        .sort((a, b) => b.request_count - a.request_count);

      if (requestBadges.length > 0) {
        earnedBadges.push({ ...requestBadges[0], category: "Requester Badge" });
      } else {
        earnedBadges.push({ badge_name: "Rookie", category: "Requester Badge" });
      }
    }

    return res.json({
      user: userRows[0],
      profile: profileRows[0] || null,
      education: educationRows,
      experience: experienceRows,
      links: linkRows,
      badges: earnedBadges,
      stats: { reviewCount, requestCount },
    });
  } catch (err) {
    console.error("getPublicProfile error:", err);
    return res
      .status(500)
      .json({ message: "Server error loading public profile" });
  }
};

/** GET /api/profile/leaderboard */
export const getLeaderboard = async (req, res) => {
  try {
    const { userType } = req.user; // 'RQ', 'RR', 'AD'

    let showRequesters = false;
    let showReviewers = false;

    if (userType === "RQ") {
      showRequesters = true;
    } else if (userType === "RR") {
      showReviewers = true;
    } else if (userType === "AD") {
      showRequesters = true;
      showReviewers = true;
    }

    const response = {
      requesters: [],
      reviewers: [],
    };

    if (showRequesters) {
      const [rows] = await pool.query(
        `SELECT user_id, user_fname, user_lname, points, user_type
         FROM users
         WHERE user_type = 'RQ'
         ORDER BY points DESC
         LIMIT 10`
      );
      response.requesters = rows;
    }

    if (showReviewers) {
      const [rows] = await pool.query(
        `SELECT user_id, user_fname, user_lname, points, user_type
         FROM users
         WHERE user_type = 'RR'
         ORDER BY points DESC
         LIMIT 10`
      );
      response.reviewers = rows;
    }

    return res.json(response);
  } catch (err) {
    console.error("getLeaderboard error:", err);
    return res.status(500).json({ message: "Error loading leaderboard" });
  }
};