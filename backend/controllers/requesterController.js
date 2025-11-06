// controllers/requesterController.js
import bcrypt from "bcrypt";
import pool from "../db.js";

export const createRequester = async (req, res) => {
  const { firstName, lastName, email, password, track } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res
      .status(400)
      .json({ message: "firstName, lastName, email, password are required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);

    // 1) create user (RQ)
    const [userResult] = await conn.query(
      `INSERT INTO users (user_fname, user_lname, email, password_hash, user_type)
       VALUES (?, ?, ?, ?, 'RQ')`,
      [firstName, lastName, email, passwordHash]
    );
    const userId = userResult.insertId;

    // 2) requester subtype
    await conn.query(
      `INSERT INTO requester (user_id, user_type)
       VALUES (?, 'RQ')`,
      [userId]
    );

    // 3) base resume
    const [resumeResult] = await conn.query(
      `INSERT INTO resume (user_id, track)
       VALUES (?, ?)`,
      [userId, track || null]
    );

    await conn.commit();

    return res.status(201).json({
      user_id: userId,
      resume_id: resumeResult.insertId,
      message: "Requester and base resume created successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Email already in use" });
    }

    return res.status(500).json({ message: "Error creating requester" });
  } finally {
    conn.release();
  }
};
