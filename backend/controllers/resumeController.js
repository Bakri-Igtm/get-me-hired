// controllers/resumeController.js
import pool from "../db.js";
import path from "path";
import fs from "fs";

// Allowed file types
const ALLOWED_MIME_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

// Small helper
function isAllowedFile(file) {
  if (!file) return false;
  return ALLOWED_MIME_TYPES.includes(file.mimetype);
}

/**
 * NEW: Create a brand-new resume (track) + first version from an uploaded file.
 * POST /api/resumes
 * form-data: track, file
 * Auth: verifyToken
 */
export const createResumeWithFile = async (req, res) => {
  const { userId } = req.user;
  const { track } = req.body;
  const file = req.file;

  if (!track || !track.trim()) {
    return res.status(400).json({ message: "Track (resume title) is required" });
  }

  if (!file) {
    return res.status(400).json({ message: "Resume file is required" });
  }

  if (!isAllowedFile(file)) {
    return res.status(400).json({
      message: "Only .doc, .docx or .txt files are allowed",
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Enforce max 3 resumes per user
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM resume WHERE user_id = ?`,
      [userId]
    );
    if (countRows[0].cnt >= 3) {
      await conn.rollback();
      return res
        .status(400)
        .json({ message: "You can only have up to 3 resumes (tracks)" });
    }

    // Insert resume
    const [resumeResult] = await conn.query(
      `INSERT INTO resume (user_id, track) VALUES (?, ?)`,
      [userId, track.trim()]
    );
    const resumeId = resumeResult.insertId;

    // First version is 1
    const versionNumber = 1;

    // Insert version with file metadata
    const [versionResult] = await conn.query(
      `
      INSERT INTO resume_versions
        (resume_id, version_number, content, file_name, file_path, file_mime, file_size)
      VALUES (?, ?, NULL, ?, ?, ?, ?)
      `,
      [
        resumeId,
        versionNumber,
        file.originalname,
        file.path, // stored by multer
        file.mimetype,
        file.size,
      ]
    );
    const resumeVersionsId = versionResult.insertId;

    // Update resume.latest_version_id
    await conn.query(
      `UPDATE resume SET latest_version_id = ? WHERE resume_id = ?`,
      [resumeVersionsId, resumeId]
    );

    await conn.commit();

    return res.status(201).json({
      resume_id: resumeId,
      track: track.trim(),
      latest_version_id: resumeVersionsId,
      first_version: {
        resume_versions_id: resumeVersionsId,
        version_number: versionNumber,
        uploaded_at: new Date(),
        file_name: file.originalname,
        file_mime: file.mimetype,
        file_size: file.size,
      },
      message: "Resume created successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error("Error creating resume with file:", err);

    // Handle duplicate track name (unique constraint)
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ message: "You already have a resume with this track name" });
    }

    return res.status(500).json({ message: "Error creating resume" });
  } finally {
    conn.release();
  }
};

/**
 * NEW: Create a new version for an existing resume from an uploaded file.
 * POST /api/resumes/:resumeId/versions/file
 */
export const createResumeVersionWithFile = async (req, res) => {
  const { userId } = req.user;
  const { resumeId } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "Resume file is required" });
  }

  if (!isAllowedFile(file)) {
    return res.status(400).json({
      message: "Only .doc, .docx or .txt files are allowed",
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure resume belongs to this user
    const [resumeRows] = await conn.query(
      `SELECT resume_id, user_id FROM resume WHERE resume_id = ?`,
      [resumeId]
    );
    if (resumeRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Resume not found" });
    }
    if (resumeRows[0].user_id !== userId) {
      await conn.rollback();
      return res
        .status(403)
        .json({ message: "You do not have access to this resume" });
    }

    // Enforce max 5 versions per resume
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM resume_versions WHERE resume_id = ?`,
      [resumeId]
    );
    if (countRows[0].cnt >= 5) {
      await conn.rollback();
      return res
        .status(400)
        .json({ message: "You can only have up to 5 versions per resume" });
    }

    // next version # = max + 1
    const [rows] = await conn.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM resume_versions
       WHERE resume_id = ?`,
      [resumeId]
    );
    const nextVersion = rows[0].max_version + 1;

    const [versionResult] = await conn.query(
      `
      INSERT INTO resume_versions
        (resume_id, version_number, content, file_name, file_path, file_mime, file_size)
      VALUES (?, ?, NULL, ?, ?, ?, ?)
      `,
      [
        resumeId,
        nextVersion,
        file.originalname,
        file.path,
        file.mimetype,
        file.size,
      ]
    );
    const resumeVersionsId = versionResult.insertId;

    // Update latest_version_id on resume
    await conn.query(
      `UPDATE resume SET latest_version_id = ? WHERE resume_id = ?`,
      [resumeVersionsId, resumeId]
    );

    await conn.commit();

    return res.status(201).json({
      resume_versions_id: resumeVersionsId,
      version_number: nextVersion,
      file_name: file.originalname,
      file_mime: file.mimetype,
      file_size: file.size,
      message: "Resume version created successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error("Error creating resume version with file:", err);
    return res.status(500).json({ message: "Error creating resume version" });
  } finally {
    conn.release();
  }
};

/**
 * EXISTING: create resume version from TEXT content (used by AI editor, etc.)
 * POST /api/resumes/:resumeId/versions   (JSON body)
 */
export const createResumeVersion = async (req, res) => {
  const { resumeId } = req.params;
  const { content } = req.body;
  const { userId } = req.user;

  if (!content) {
    return res.status(400).json({ message: "content is required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure resume belongs to this user
    const [resumeRows] = await conn.query(
      `SELECT resume_id, user_id FROM resume WHERE resume_id = ?`,
      [resumeId]
    );
    if (resumeRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Resume not found" });
    }
    if (resumeRows[0].user_id !== userId) {
      await conn.rollback();
      return res
        .status(403)
        .json({ message: "You do not have access to this resume" });
    }

    // Enforce max 5 versions per resume
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM resume_versions WHERE resume_id = ?`,
      [resumeId]
    );
    if (countRows[0].cnt >= 5) {
      await conn.rollback();
      return res
        .status(400)
        .json({ message: "You can only have up to 5 versions per resume" });
    }

    // get next version number
    const [rows] = await conn.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM resume_versions
       WHERE resume_id = ?`,
      [resumeId]
    );
    const nextVersion = rows[0].max_version + 1;

    // insert version (text-only)
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

/**
 * EXISTING: Get single resume + its versions for current user
 * GET /api/resumes/my
 * (kept for backward compatibility)
 */
export const getMyResumeWithVersions = async (req, res) => {
  const { userId } = req.user;

  try {
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

    const [versionRows] = await pool.query(
      `
      SELECT 
        rv.resume_versions_id,
        rv.version_number,
        rv.uploaded_at,
        LENGTH(rv.content) AS content_length,
        rv.file_name,
        rv.file_mime,
        rv.file_size
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
 * EXISTING: GET /api/resumes/:resumeId/versions
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
        LENGTH(rv.content) AS content_length,
        rv.file_name,
        rv.file_mime,
        rv.file_size
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

/**
 * EXISTING: get all resumes (tracks) for this user
 * GET /api/resumes/mine
 */
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

    return res.json(rows);
  } catch (err) {
    console.error("Error fetching resumes:", err);
    return res.status(500).json({ message: "Error fetching resumes" });
  }
};

/**
 * NEW: Download a specific version's file
 * GET /api/resumes/versions/:versionId/file
 */
export const getResumeVersionFile = async (req, res) => {
  const { versionId } = req.params;
  const { userId } = req.user;

  try {
    const [rows] = await pool.query(
      `
      SELECT rv.file_path, rv.file_name, rv.file_mime, r.user_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [versionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Resume version not found" });
    }

    const row = rows[0];

    if (row.user_id !== userId) {
      return res
        .status(403)
        .json({ message: "You do not have access to this file" });
    }

    if (!row.file_path) {
      return res
        .status(400)
        .json({ message: "This version does not have a file attached" });
    }

    const absolutePath = path.resolve(row.file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: "File not found on server" });
    }

    res.setHeader("Content-Type", row.file_mime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(row.file_name || "resume")}"`,
    );

    return res.sendFile(absolutePath);
  } catch (err) {
    console.error("Error serving resume file:", err);
    return res.status(500).json({ message: "Error downloading file" });
  }
};

/**
 * NEW: Delete a resume version (and keep constraints sane)
 * DELETE /api/resumes/versions/:versionId
 */
export const deleteResumeVersion = async (req, res) => {
  const { versionId } = req.params;
  const { userId } = req.user;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `
      SELECT rv.resume_id, rv.file_path, r.user_id, r.latest_version_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [versionId]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Resume version not found" });
    }

    const row = rows[0];

    if (row.user_id !== userId) {
      await conn.rollback();
      return res
        .status(403)
        .json({ message: "You do not have access to this version" });
    }

    // Delete the version row
    await conn.query(
      `DELETE FROM resume_versions WHERE resume_versions_id = ?`,
      [versionId]
    );

    // If this was the latest version, update latest_version_id
    if (row.latest_version_id === Number(versionId)) {
      const [latestRows] = await conn.query(
        `
        SELECT resume_versions_id
        FROM resume_versions
        WHERE resume_id = ?
        ORDER BY version_number DESC
        LIMIT 1
        `,
        [row.resume_id]
      );

      const newLatestId = latestRows.length ? latestRows[0].resume_versions_id : null;

      await conn.query(
        `UPDATE resume SET latest_version_id = ? WHERE resume_id = ?`,
        [newLatestId, row.resume_id]
      );
    }

    // If no versions remain, you might choose to delete the resume itself
    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM resume_versions WHERE resume_id = ?`,
      [row.resume_id]
    );
    if (countRows[0].cnt === 0) {
      await conn.query(`DELETE FROM resume WHERE resume_id = ?`, [
        row.resume_id,
      ]);
    }

    await conn.commit();

    // Optionally delete the file from disk
    if (row.file_path && fs.existsSync(row.file_path)) {
      fs.unlink(row.file_path, (err) => {
        if (err) console.error("Error deleting file:", err);
      });
    }

    return res.json({ message: "Resume version deleted successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("Error deleting resume version:", err);
    return res.status(500).json({ message: "Error deleting resume version" });
  } finally {
    conn.release();
  }
};
