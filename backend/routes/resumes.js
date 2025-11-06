import express from "express";
import { createResumeVersion } from "../controllers/resumeController.js";

const router = express.Router();

// POST /api/resumes/:resumeId/versions
router.post("/:resumeId/versions", createResumeVersion);

export default router;
