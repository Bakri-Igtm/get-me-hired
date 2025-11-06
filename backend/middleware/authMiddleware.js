// middleware/authMiddleware.js
import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  try {
    // Check for token in Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.split(" ")[1];

    // Verify token using JWT_SECRET
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.user = decoded; // { userId, userType, iat, exp }

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
