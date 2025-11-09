import pool from "../db.js";

/**
 * GET /api/resume-versions/:resumeVersionsId
 * Return full content + metadata for a single resume version,
 * only if it belongs to the logged-in user.
 */
export const getResumeVersionById = async (req, res) => {
  const { resumeVersionsId } = req.params;
  const { userId } = req.user; // from verifyToken

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        rv.resume_versions_id,
        rv.resume_id,
        rv.version_number,
        rv.uploaded_at,
        rv.content,
        r.user_id AS owner_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [resumeVersionsId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Resume version not found" });
    }

    const version = rows[0];

    // Make sure this version belongs to the logged-in user
    if (version.owner_id !== userId) {
      return res
        .status(403)
        .json({ message: "You do not have access to this resume version" });
    }

    return res.json({
      resumeVersionsId: version.resume_versions_id,
      resumeId: version.resume_id,
      versionNumber: version.version_number,
      uploadedAt: version.uploaded_at,
      content: version.content || "",
    });
  } catch (err) {
    console.error("Error fetching resume version:", err);
    return res.status(500).json({ message: "Error fetching resume version" });
  }
};
