// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";

import requesterRoutes from "./routes/requesters.js";
import resumeRoutes from "./routes/resumes.js";

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

app.listen(process.env.PORT, () => {
  console.log(`API running on port ${process.env.PORT}`);
});
