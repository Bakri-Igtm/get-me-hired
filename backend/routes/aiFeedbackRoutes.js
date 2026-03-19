// routes/aiFeedbackRoutes.js
import express from "express";
import {
  upsertAiFeedback,
  generateAiFeedback,
  getAiFeedbackForVersion,
  serveRewritePdf,
  getRewriteLatex,
  listTemplates,
} from "../controllers/aiFeedbackController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// List available resume templates (public — no auth needed)
router.get("/templates", listTemplates);

// Manually save AI feedback (mostly for testing/dev)
router.post("/", verifyToken, upsertAiFeedback);

// Generate via OpenAI, then save
router.post("/generate", verifyToken, generateAiFeedback);

// Get feedback for a specific resume version
router.get("/version/:resumeVersionsId", verifyToken, getAiFeedbackForVersion);

// Serve compiled rewrite PDF
router.get("/rewrite-pdf/:resumeVersionsId", verifyToken, serveRewritePdf);

// Get raw rewrite LaTeX source
router.get("/rewrite-latex/:resumeVersionsId", verifyToken, getRewriteLatex);

export default router;
