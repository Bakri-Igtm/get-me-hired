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
