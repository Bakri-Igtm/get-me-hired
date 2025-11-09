// routes/resumeVersionRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { getResumeVersionById } from "../controllers/resumeVersionController.js";

const router = express.Router();

router.get("/:resumeVersionsId", verifyToken, getResumeVersionById);

export default router;
