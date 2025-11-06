import express from "express";
import { createResumeVersion } from "../controllers/resumeController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// POST /api/resumes/:resumeId/versions
router.post("/:resumeId/versions", verifyToken, createResumeVersion);

export default router;
