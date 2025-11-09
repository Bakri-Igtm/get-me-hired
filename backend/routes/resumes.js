import express from "express";
import { createResumeVersion, getMyResumeWithVersions, getResumeVersions, getAllMyResumes } from "../controllers/resumeController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// router.post("/:resumeId/versions", verifyToken, authorizeRoles("RQ"), createResumeVersion);

router.post("/:resumeId/versions", verifyToken, createResumeVersion);

router.get("/my", verifyToken, getMyResumeWithVersions);
router.get("/:resumeId/versions", verifyToken, getResumeVersions);
router.get("/mine", verifyToken, getAllMyResumes);

export default router;
