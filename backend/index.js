// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import pool from "./db.js";

import requesterRoutes from "./routes/requesters.js";
import resumeRoutes from "./routes/resumes.js";
import authRoutes from "./routes/authRoutes.js";
import reviewRoutes from "./routes/reviews.js";
import reviewRequestRoutes from "./routes/reviewRequests.js";
import reviewerRoutes from "./routes/reviewerRoutes.js";
import aiFeedbackRoutes from "./routes/aiFeedbackRoutes.js";
import resumeVersionRoutes from "./routes/resumeVersionRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import directoryRoutes from "./routes/directoryRoutes.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ===== Upload folders setup =====
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const RESUME_DIR = path.join(UPLOAD_ROOT, "resumes");

// Make sure uploads/resumes exists for Multer
if (!fs.existsSync(RESUME_DIR)) {
  fs.mkdirSync(RESUME_DIR, { recursive: true });
}

// Optional: serve uploaded files statically (useful for debugging / viewing)
app.use("/uploads", express.static(UPLOAD_ROOT));

// ===== Health + test routes =====
app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: rows[0].ok });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error" });
  }
});

app.post("/api/test", (req, res) => {
  res.json({ message: "POST /api/test reached the backend 🎯" });
});

// ===== Feature routes =====
app.use("/api/requesters", requesterRoutes);
app.use("/api/resumes", resumeRoutes);            // <-- resumes (with uploads)
app.use("/api/auth", authRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/review-requests", reviewRequestRoutes);
app.use("/api/reviewers", reviewerRoutes);
app.use("/api/ai-feedback", aiFeedbackRoutes);
app.use("/api/resume-versions", resumeVersionRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/directory", directoryRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
