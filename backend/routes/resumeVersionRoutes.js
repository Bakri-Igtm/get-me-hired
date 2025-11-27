// routes/resumeVersionRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { createResumeVersion, getResumeVersionById } from "../controllers/resumeVersionController.js";

const router = express.Router();

router.post("/", verifyToken, createResumeVersion);
router.get("/:resumeVersionsId", verifyToken, getResumeVersionById);

export default router;
