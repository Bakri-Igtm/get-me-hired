// controllers/resumeController.js
import pool from "../db.js";
import path from "path";
import fs from "fs";
import mammoth from "mammoth";

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

// Extract text/HTML content from uploaded file
async function extractFileContent(file) {
  try {
    if (file.mimetype === "text/plain") {
      // For .txt files, read directly
      return fs.readFileSync(file.path, "utf-8");
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "application/msword"
    ) {
      // For .docx/.doc files, use mammoth to extract HTML (preserves formatting)
      // Use styleMap to preserve more formatting
      const result = await mammoth.convertToHtml({ 
        path: file.path,
        styleMap: [
          "u => u",  // Preserve underline
          "hr => hr",  // Preserve horizontal rules as <hr>
          "b => strong",
          "i => em",
        ]
      });
      return result.value || "";
    }
    return ""; // Default return for unknown types
  } catch (err) {
    console.error("Error extracting file content:", err);
    return "";
  }
}

// Lightweight endpoint: extract file content for preview (does not persist file)
export const extractResumeFile = async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    const content = await extractFileContent(file);
    // Remove the uploaded temporary file to avoid clutter
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      // non-fatal
      console.warn("Could not remove temp file:", file.path, e.message);
    }

    return res.json({ content });
  } catch (err) {
    console.error("extractResumeFile error:", err);
    // attempt to remove file even on error
    try {
      fs.unlinkSync(file.path);
    } catch (e) {}
    return res.status(500).json({ message: "Failed to extract file content" });
  }
};


/**
 * UNIFIED: Upload handler for both creating new resume and new version
 * POST /api/resumes/upload
 * form-data: mode ("new" | "existing"), trackTitle (if new), resumeId (if existing), file, versionLabel (optional)
 * Auth: verifyToken
 */
export const uploadResume = async (req, res) => {
  const { userId } = req.user;
  const { mode, trackTitle, resumeId, versionLabel } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  if (!isAllowedFile(file)) {
    return res.status(400).json({
      message: "Only .doc, .docx or .txt files are allowed",
    });
  }

  // Extract content from file
  let fileContent = "";
  try {
    fileContent = await extractFileContent(file);
    console.log(`✓ Extracted ${fileContent.length} characters from ${file.originalname}`);
  } catch (err) {
    console.error("Error extracting content:", err);
    fileContent = ""; // Proceed with empty content if extraction fails
  }

  // Determine which path to take
  if (mode === "new") {
    // Create new resume (track)
    if (!trackTitle || !trackTitle.trim()) {
      return res.status(400).json({ message: "Track title is required for new resume" });
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
        return res.status(400).json({ message: "You can only have up to 3 resumes (tracks)" });
      }

      // Insert resume
      const [resumeResult] = await conn.query(
        `INSERT INTO resume (user_id, track) VALUES (?, ?)`,
        [userId, trackTitle.trim()]
      );
      const newResumeId = resumeResult.insertId;

      // First version is 1
      const versionNumber = 1;

      // Insert version with file metadata and content
      const [versionResult] = await conn.query(
        `
        INSERT INTO resume_versions
          (resume_id, version_number, version_name, content, file_name, file_path, file_mime, file_size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          newResumeId,
          versionNumber,
          versionLabel ? versionLabel.trim() : `Version ${versionNumber}`,
          fileContent,
          file.originalname,
          file.path,
          file.mimetype,
          file.size,
        ]
      );
      const resumeVersionsId = versionResult.insertId;
      console.log(`✓ Created version ${versionNumber} for resume ${newResumeId} with ${fileContent.length} chars`);

      // Update resume.latest_version_id
      await conn.query(
        `UPDATE resume SET latest_version_id = ? WHERE resume_id = ?`,
        [resumeVersionsId, newResumeId]
      );

      await conn.commit();

      return res.status(201).json({
        resume_id: newResumeId,
        track: trackTitle.trim(),
        latest_version_id: resumeVersionsId,
        resume_versions_id: resumeVersionsId,
        version_number: versionNumber,
        message: "Resume created successfully",
      });
    } catch (err) {
      await conn.rollback();
      console.error("Error creating resume with file:", err);

      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ message: "You already have a resume with this track name" });
      }

      return res.status(500).json({ message: "Error creating resume" });
    } finally {
      conn.release();
    }
  } else if (mode === "existing") {
    // Create new version under existing resume
    if (!resumeId) {
      return res.status(400).json({ message: "Resume ID is required for new version" });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Verify resume belongs to user
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
        return res.status(403).json({ message: "Not your resume" });
      }

      // Enforce max 5 versions per resume
      const [countRows] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM resume_versions WHERE resume_id = ?`,
        [resumeId]
      );
      if (countRows[0].cnt >= 5) {
        await conn.rollback();
        return res.status(400).json({ message: "You can only have up to 5 versions per resume" });
      }

      // Get next version number
      const [maxRows] = await conn.query(
        `SELECT COALESCE(MAX(version_number), 0) AS max_version
         FROM resume_versions
         WHERE resume_id = ?`,
        [resumeId]
      );
      const nextVersion = maxRows[0].max_version + 1;

      // Insert version with file metadata and content
      const [versionResult] = await conn.query(
        `
        INSERT INTO resume_versions
          (resume_id, version_number, version_name, content, file_name, file_path, file_mime, file_size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          resumeId,
          nextVersion,
          versionLabel ? versionLabel.trim() : `Version ${nextVersion}`,
          fileContent,
          file.originalname,
          file.path,
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
        resume_versions_id: resumeVersionsId,
        version_number: nextVersion,
        message: "Resume version uploaded successfully",
      });
    } catch (err) {
      await conn.rollback();
      console.error("Error uploading resume version:", err);
      return res.status(500).json({ message: "Error uploading resume version" });
    } finally {
      conn.release();
    }
  } else {
    return res.status(400).json({ message: "Invalid mode. Must be 'new' or 'existing'" });
  }
};

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
 * NEW: Download a specific version's file
 * GET /api/resumes/versions/:versionId/file
 */
export const getResumeVersionFile = async (req, res) => {
  const { versionId } = req.params;
  const { userId } = req.user;

  try {
    const [rows] = await pool.query(
      `
      SELECT rv.file_path, rv.file_name, rv.file_mime, rv.content, r.user_id
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

    let filePath = row.file_path;
    let fileName = row.file_name || "resume";
    let fileMime = row.file_mime || "application/octet-stream";

    // Fallback: Check if content has JSON metadata (legacy support)
    if (!filePath && row.content) {
      try {
        const meta = JSON.parse(row.content);
        if (meta.storedName) {
          filePath = path.join(process.cwd(), "uploads", "resumes", meta.storedName);
          fileName = meta.originalName || fileName;
          fileMime = meta.mimeType || fileMime;
        }
      } catch (e) {
        // Content is likely plain text, not JSON
      }
    }

    if (!filePath) {
      return res
        .status(400)
        .json({ message: "This version does not have a file attached" });
    }

    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`File not found at path: ${absolutePath}`);
      return res.status(404).json({ message: "File not found on server" });
    }

    res.setHeader("Content-Type", fileMime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`
    );

    return res.sendFile(absolutePath);
  } catch (err) {
    console.error("Error serving resume file:", err);
    return res.status(500).json({ message: "Error downloading file" });
  }
};

// already have: getAllMyResumes — we’ll slightly adjust it to include counts
export const getAllMyResumes = async (req, res) => {
  const { userId } = req.user;

  try {
    // Get all resumes for this user
    const [resumeRows] = await pool.query(
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

    // For each resume, get all versions
    const resumes = await Promise.all(
      resumeRows.map(async (resume) => {
        const [versions] = await pool.query(
          `
          SELECT 
            resume_versions_id,
            version_number,
            version_name,
            content,
            uploaded_at,
            file_name,
            file_path,
            file_mime,
            file_size
          FROM resume_versions
          WHERE resume_id = ?
          ORDER BY version_number DESC
          `,
          [resume.resume_id]
        );

        return {
          resume_id: resume.resume_id,
          trackTitle: resume.track,
          track: resume.track,
          created_at: resume.created_at,
          latest_version_id: resume.latest_version_id,
          versions: versions.map((v) => {
            // Determine if a file exists for this version
            const hasFile = !!v.file_path || (v.content && v.content.trim().startsWith("{") && v.content.includes('"storedName"'));
            
            return {
              resume_versions_id: v.resume_versions_id,
              version_number: v.version_number,
              version_name: v.version_name,
              content: v.content,
              uploaded_at: v.uploaded_at,
              file_name: v.file_name,
              file_path: v.file_path,
              file_mime: v.file_mime,
              file_size: v.file_size,
              file_url: hasFile ? `/api/resumes/file/${v.resume_versions_id}` : null,
            };
          }),
        };
      })
    );

    return res.json({ resumes, limits: { maxResumes: 3, maxVersionsPerResume: 5 } });
  } catch (err) {
    console.error("Error fetching resumes:", err);
    return res.status(500).json({ message: "Error fetching resumes" });
  }
};

// Get all my resume versions (flat list, for review request form)
export const getAllMyResumeVersions = async (req, res) => {
  const { userId } = req.user;

  try {
    const [versionRows] = await pool.query(
      `
      SELECT 
        rv.resume_versions_id,
        rv.version_number,
        rv.version_name,
        rv.uploaded_at,
        rv.file_name,
        rv.file_mime,
        rv.file_size,
        rv.file_path,
        rv.content,
        r.resume_id,
        r.track
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC, rv.version_number DESC
      `,
      [userId]
    );

    const versions = versionRows.map((v) => {
      const hasFile = !!v.file_path || (v.content && v.content.trim().startsWith("{") && v.content.includes('"storedName"'));
      
      return {
        resume_versions_id: v.resume_versions_id,
        resume_id: v.resume_id,
        track: v.track,
        version_number: v.version_number,
        version_name: v.version_name,
        uploaded_at: v.uploaded_at,
        file_name: v.file_name,
        file_mime: v.file_mime,
        file_size: v.file_size,
        file_url: hasFile ? `/api/resumes/file/${v.resume_versions_id}` : null,
      };
    });

    return res.json({ versions });
  } catch (err) {
    console.error("Error fetching resume versions:", err);
    return res.status(500).json({ message: "Error fetching resume versions" });
  }
};

// Create a new version for an existing resume track using an uploaded file
export const createResumeVersionWithFile = async (req, res) => {
  const { resumeId } = req.params;
  const { userId } = req.user;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // confirm resume belongs to user
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
      return res.status(403).json({ message: "Not your resume" });
    }

    // enforce max 5 versions per resume
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

    // next version_number
    const [maxRows] = await conn.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM resume_versions
       WHERE resume_id = ?`,
      [resumeId]
    );
    const nextVersion = maxRows[0].max_version + 1;

    // store file path and metadata in content (or separate columns if you add them)
    const fileMeta = {
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
    };

    const [versionResult] = await conn.query(
      `
      INSERT INTO resume_versions (resume_id, version_number, content)
      VALUES (?, ?, ?)
      `,
      [resumeId, nextVersion, JSON.stringify(fileMeta)]
    );

    const resumeVersionsId = versionResult.insertId;

    // update latest_version_id
    await conn.query(
      `
      UPDATE resume
      SET latest_version_id = ?
      WHERE resume_id = ?
      `,
      [resumeVersionsId, resumeId]
    );

    await conn.commit();

    return res.status(201).json({
      resume_versions_id: resumeVersionsId,
      version_number: nextVersion,
      file: fileMeta,
      message: "Resume version uploaded successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error("Error uploading resume version:", err);
    return res
      .status(500)
      .json({ message: "Error uploading resume version" });
  } finally {
    conn.release();
  }
};

// Create a new resume version with HTML content directly (no file)
export const createResumeVersionWithContent = async (req, res) => {
  const { resumeId } = req.params;
  const { userId } = req.user;
  const { content, version_name } = req.body;

  if (!content || typeof content !== "string") {
    return res.status(400).json({ message: "Content is required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // confirm resume belongs to user
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
      return res.status(403).json({ message: "Not your resume" });
    }

    // enforce max 5 versions per resume
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

    // next version_number
    const [maxRows] = await conn.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM resume_versions
       WHERE resume_id = ?`,
      [resumeId]
    );
    const nextVersion = maxRows[0].max_version + 1;

    // Create version with HTML content
    const [versionResult] = await conn.query(
      `
      INSERT INTO resume_versions (resume_id, version_number, version_name, content)
      VALUES (?, ?, ?, ?)
      `,
      [resumeId, nextVersion, version_name || null, content]
    );

    const resumeVersionsId = versionResult.insertId;

    // update latest_version_id
    await conn.query(
      `
      UPDATE resume
      SET latest_version_id = ?
      WHERE resume_id = ?
      `,
      [resumeVersionsId, resumeId]
    );

    await conn.commit();

    return res.status(201).json({
      resume_versions_id: resumeVersionsId,
      version_number: nextVersion,
      message: "Resume version saved successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error("Error saving resume version:", err);
    return res
      .status(500)
      .json({ message: "Error saving resume version" });
  } finally {
    conn.release();
  }
};

// Get resume content (text) for a given resume_versions_id
export const getResumeContent = async (req, res) => {
  const { resumeVersionsId } = req.params;
  const { userId } = req.user;

  try {
    const [rows] = await pool.query(
      `
      SELECT rv.content, r.user_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [resumeVersionsId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Resume version not found" });
    }

    if (rows[0].user_id !== userId) {
      return res.status(403).json({ message: "You do not have access to this version" });
    }

    return res.json({ content: rows[0].content || "" });
  } catch (err) {
    console.error("Error fetching resume content:", err);
    return res.status(500).json({ message: "Error fetching resume content" });
  }
};

// Update resume content for a given resume_versions_id
export const updateResumeContent = async (req, res) => {
  const { resumeVersionsId } = req.params;
  const { userId } = req.user;
  const { content } = req.body;

  if (!content || typeof content !== "string") {
    return res.status(400).json({ message: "Content is required" });
  }

  try {
    // Verify ownership
    const [rows] = await pool.query(
      `
      SELECT r.user_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [resumeVersionsId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Resume version not found" });
    }

    if (rows[0].user_id !== userId) {
      return res.status(403).json({ message: "You do not have access to this version" });
    }

    // Update content
    await pool.query(
      `UPDATE resume_versions SET content = ? WHERE resume_versions_id = ?`,
      [content, resumeVersionsId]
    );

    return res.json({ message: "Resume content updated successfully" });
  } catch (err) {
    console.error("Error updating resume content:", err);
    return res.status(500).json({ message: "Error updating resume content" });
  }
};

// Stream the file for a given resume_versions_id
export const getResumeFile = async (req, res) => {
  const { resumeVersionsId } = req.params;
  const { userId } = req.user;

  try {
    const [rows] = await pool.query(
      `
      SELECT rv.content, r.user_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [resumeVersionsId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Resume version not found" });
    }

    if (rows[0].user_id !== userId) {
      return res
        .status(403)
        .json({ message: "You do not have access to this file" });
    }

    let fileMeta;
    try {
      fileMeta = JSON.parse(rows[0].content);
    } catch {
      return res
        .status(400)
        .json({ message: "This version does not have a stored file" });
    }

    const filePath = path.join(process.cwd(), "uploads", "resumes", fileMeta.storedName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found on disk" });
    }

    res.setHeader("Content-Type", fileMeta.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${fileMeta.originalName || "resume"}"`
    );

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error("Error streaming resume file:", err);
    return res.status(500).json({ message: "Error streaming resume file" });
  }
};

// Delete a resume version (and remove file)
export const deleteResumeVersion = async (req, res) => {
  const { resumeVersionsId } = req.params;
  const { userId } = req.user;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `
      SELECT rv.resume_id, rv.content, r.user_id, r.latest_version_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [resumeVersionsId]
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

    let fileMeta;
    try {
      fileMeta = JSON.parse(row.content);
    } catch {
      fileMeta = null;
    }

    await conn.query(
      `DELETE FROM resume_versions WHERE resume_versions_id = ?`,
      [resumeVersionsId]
    );

    // if we just deleted latest_version, update resume.latest_version_id
    if (row.latest_version_id === Number(resumeVersionsId)) {
      const [maxRows] = await conn.query(
        `
        SELECT resume_versions_id
        FROM resume_versions
        WHERE resume_id = ?
        ORDER BY version_number DESC
        LIMIT 1
        `,
        [row.resume_id]
      );

      const newLatest = maxRows.length ? maxRows[0].resume_versions_id : null;
      
      // If no versions left, delete the resume track entirely
      if (!newLatest) {
        await conn.query(
          `DELETE FROM resume WHERE resume_id = ?`,
          [row.resume_id]
        );
      } else {
        await conn.query(
          `UPDATE resume SET latest_version_id = ? WHERE resume_id = ?`,
          [newLatest, row.resume_id]
        );
      }
    }

    await conn.commit();

    // delete file on disk (after commit)
    if (fileMeta && fileMeta.storedName) {
      const filePath = path.join(process.cwd(), "uploads", "resumes", fileMeta.storedName);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, () => {});
      }
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