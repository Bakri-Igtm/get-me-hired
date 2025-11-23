// backend/controllers/directoryController.js
import pool from "../db.js";

// GET /api/directory?role=RQ|RR
export const listMembers = async (req, res) => {
  try {
    const { role } = req.query; // expected 'RQ' or 'RR' (optional)

    const params = [];
    let whereClause = "WHERE 1=1";

    if (role === "RQ" || role === "RR") {
      whereClause += " AND u.user_type = ?";
      params.push(role);
    }

    // We could exclude admins if we want
    // whereClause += " AND u.user_type IN ('RQ', 'RR')";

    const [rows] = await pool.query(
      `
      SELECT
        u.user_id,
        u.user_fname AS firstName,
        u.user_lname AS lastName,
        u.user_type,
        p.headline,
        p.avatar_url
      FROM users u
      LEFT JOIN profile p ON p.user_id = u.user_id
      ${whereClause}
      ORDER BY u.user_fname ASC, u.user_lname ASC
      `,
      params
    );

    return res.json({ members: rows });
  } catch (err) {
    console.error("listMembers error:", err);
    return res.status(500).json({ message: "Error loading directory" });
  }
};
