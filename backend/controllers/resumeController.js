// controllers/resumeController.js
import pool from "../db.js";

export const createResumeVersion = async (req, res) => {
  const { resumeId } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ message: "content is required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // get next version number
    const [rows] = await conn.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM resume_versions
       WHERE resume_id = ?`,
      [resumeId]
    );
    const nextVersion = rows[0].max_version + 1;

    // insert version
    const [versionResult] = await conn.query(
      `INSERT INTO resume_versions (resume_id, version_number, content)
       VALUES (?, ?, ?)`,
      [resumeId, nextVersion, content]
    );
    const resumeVersionsId = versionResult.insertId;

    // update latest_version_id on resume
    await conn.query(
      `UPDATE resume
       SET latest_version_id = ?
       WHERE resume_id = ?`,
      [resumeVersionsId, resumeId]
    );

    await conn.commit();

    return res.status(201).json({
      resume_versions_id: resumeVersionsId,
      version_number: nextVersion,
      message: "Resume version created successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ message: "Error creating resume version" });
  } finally {
    conn.release();
  }
};

export const getMyResumeWithVersions = async (req, res) => {
  const { userId } = req.user;

  try {
    // 1) Find resume for this user
    const [resumeRows] = await pool.query(
      `
      SELECT 
        r.resume_id,
        r.track,
        r.latest_version_id,
        r.created_at
      FROM resume r
      WHERE r.user_id = ?
      `,
      [userId]
    );

    if (resumeRows.length === 0) {
      return res.status(404).json({ message: "No resume found for this user" });
    }

    const resume = resumeRows[0];

    // 2) Fetch all versions for this resume
    const [versionRows] = await pool.query(
      `
      SELECT 
        rv.resume_versions_id,
        rv.version_number,
        rv.uploaded_at,
        LENGTH(rv.content) AS content_length
      FROM resume_versions rv
      WHERE rv.resume_id = ?
      ORDER BY rv.version_number DESC
      `,
      [resume.resume_id]
    );

    return res.json({
      resumeId: resume.resume_id,
      track: resume.track,
      createdAt: resume.created_at,
      latestVersionId: resume.latest_version_id,
      versions: versionRows,
    });
  } catch (err) {
    console.error("Error fetching resume for user:", err);
    return res.status(500).json({ message: "Error fetching resume" });
  }
};

/**
 * (Optional) GET /api/resumes/:resumeId/versions
 * If you want a separate endpoint just for versions.
 */
export const getResumeVersions = async (req, res) => {
  const { resumeId } = req.params;
  const { userId } = req.user;

  try {
    // Ensure resume belongs to this user
    const [resumeRows] = await pool.query(
      `SELECT resume_id, user_id FROM resume WHERE resume_id = ?`,
      [resumeId]
    );

    if (resumeRows.length === 0) {
      return res.status(404).json({ message: "Resume not found" });
    }

    if (resumeRows[0].user_id !== userId) {
      return res
        .status(403)
        .json({ message: "You do not have access to this resume" });
    }

    const [versionRows] = await pool.query(
      `
      SELECT 
        rv.resume_versions_id,
        rv.version_number,
        rv.uploaded_at,
        LENGTH(rv.content) AS content_length
      FROM resume_versions rv
      WHERE rv.resume_id = ?
      ORDER BY rv.version_number DESC
      `,
      [resumeId]
    );

    return res.json(versionRows);
  } catch (err) {
    console.error("Error fetching resume versions:", err);
    return res.status(500).json({ message: "Error fetching resume versions" });
  }
};

export const getAllMyResumes = async (req, res) => {
  const { userId } = req.user;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        r.resume_id,
        r.track,
        r.latest_version_id,
        r.created_at
      FROM resume r
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
      `,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(200).json([]);
    }

    return res.json(rows);
  } catch (err) {
    console.error("Error fetching resumes:", err);
    return res.status(500).json({ message: "Error fetching resumes" });
  }
};