// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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

// health
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


// feature routes
app.use("/api/requesters", requesterRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/review-requests", reviewRequestRoutes);
app.use("/api/reviewers", reviewerRoutes);
app.use("/api/ai-feedback", aiFeedbackRoutes);
app.use("/api/resume-versions", resumeVersionRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/directory", directoryRoutes);

app.listen(process.env.PORT, () => {
  console.log(`API running on port ${process.env.PORT}`);
});
