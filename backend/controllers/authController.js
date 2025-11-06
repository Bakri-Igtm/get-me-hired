// controllers/authController.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";

export const login = async (req, res) => {
  const { email, password } = req.body;

  // basic validation
  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required" });
  }

  try {
    // 1) find user by email
    const [rows] = await pool.query(
      `SELECT user_id, user_fname, user_lname, email, password_hash, user_type
       FROM users
       WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      // don't reveal if email exists or not
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];

    // 2) check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // 3) create JWT
    const payload = {
      userId: user.user_id,
      userType: user.user_type,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    });

    // 4) send response (omit password_hash)
    return res.json({
      token,
      user: {
        user_id: user.user_id,
        firstName: user.user_fname,
        lastName: user.user_lname,
        email: user.email,
        user_type: user.user_type, // 'RQ', 'RR', 'AD'
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error during login" });
  }
};
