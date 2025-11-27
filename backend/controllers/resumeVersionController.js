import pool from "../db.js";

/**
 * POST /api/resume-versions
 * Create a new resume version with edited content
 * Body: { resumeId, content }
 */
export const createResumeVersion = async (req, res) => {
  const { resumeId, content } = req.body;
  const { userId } = req.user; // from verifyToken

  if (!resumeId || !content) {
    return res.status(400).json({ message: "resumeId and content are required" });
  }

  try {
    // Verify the resume belongs to the logged-in user
    const [resumeRows] = await pool.query(
      `SELECT user_id FROM resume WHERE resume_id = ?`,
      [resumeId]
    );

    if (resumeRows.length === 0) {
      return res.status(404).json({ message: "Resume not found" });
    }

    if (resumeRows[0].user_id !== userId) {
      return res.status(403).json({ message: "You do not own this resume" });
    }

    // Get next version number
    const [versionRows] = await pool.query(
      `SELECT MAX(version_number) as max_version FROM resume_versions WHERE resume_id = ?`,
      [resumeId]
    );

    const nextVersion = (versionRows[0]?.max_version || 0) + 1;

    // Create new resume version
    const [result] = await pool.query(
      `
      INSERT INTO resume_versions (resume_id, version_number, content, uploaded_at)
      VALUES (?, ?, ?, NOW())
      `,
      [resumeId, nextVersion, content]
    );

    return res.status(201).json({
      resume_versions_id: result.insertId,
      resume_id: resumeId,
      version_number: nextVersion,
      message: "Resume version created successfully",
    });
  } catch (err) {
    console.error("Error creating resume version:", err);
    return res.status(500).json({ message: "Error creating resume version" });
  }
};

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
