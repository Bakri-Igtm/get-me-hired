import express from "express";
import { createResumeVersion } from "../controllers/resumeController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// router.post("/:resumeId/versions", verifyToken, authorizeRoles("RQ"), createResumeVersion);

router.post("/:resumeId/versions", verifyToken, createResumeVersion);
export default router;
