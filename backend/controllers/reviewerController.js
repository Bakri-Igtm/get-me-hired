import bcrypt from "bcrypt";
import pool from "../db.js";

export const createReviewer = async (req, res) => {
  const { firstName, lastName, email, password, experience, certificates } =
    req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({
      message: "firstName, lastName, email, password are required",
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);

    // 1) Create user row with type RR
    const [userResult] = await conn.query(
      `INSERT INTO users (user_fname, user_lname, email, password_hash, user_type)
       VALUES (?, ?, ?, ?, 'RR')`,
      [firstName, lastName, email, passwordHash]
    );
    const userId = userResult.insertId;

    // 2) Create reviewer subtype row
    await conn.query(
      `INSERT INTO reviewer (user_id, user_type, experience, certificates)
       VALUES (?, 'RR', ?, ?)`,
      [userId, experience || null, certificates || null]
    );

    await conn.commit();

    return res.status(201).json({
      user_id: userId,
      message: "Reviewer created successfully",
    });
  } catch (err) {
    await conn.rollback();
    console.error("Error creating reviewer:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Email already in use" });
    }

    return res.status(500).json({ message: "Error creating reviewer" });
  } finally {
    conn.release();
  }
};
