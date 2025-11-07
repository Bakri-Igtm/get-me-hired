// routes/aiFeedbackRoutes.js
import express from "express";
import {
  upsertAiFeedback,
  generateAiFeedback,
  getAiFeedbackForVersion,
} from "../controllers/aiFeedbackController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Manually save AI feedback (mostly for testing/dev)
router.post("/", verifyToken, upsertAiFeedback);

// Generate via OpenAI, then save
router.post("/generate", verifyToken, generateAiFeedback);

// Get feedback for a specific resume version
router.get("/version/:resumeVersionsId", verifyToken, getAiFeedbackForVersion);

export default router;
