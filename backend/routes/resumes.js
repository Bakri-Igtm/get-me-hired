// routes/resumeRoutes.js
import express from "express";
import multer from "multer";
import path from "path";

import {
  createResumeVersion,
  getMyResumeWithVersions,
  getResumeVersions,
  getAllMyResumes,
  createResumeWithFile,
  createResumeVersionWithFile,
  getResumeVersionFile,
  deleteResumeVersion,
} from "../controllers/resumeController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

// Configure multer for disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/resumes"); // make sure this folder exists
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || "";
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({ storage });

const router = express.Router();

/**
 * NEW: Create a new resume (track) + first version with file upload
 * POST /api/resumes
 */
router.post(
  "/",
  verifyToken,
  upload.single("file"),
  createResumeWithFile
);

/**
 * EXISTING: Create a text-based version (e.g. from AI editor)
 * POST /api/resumes/:resumeId/versions
 * Body: { content }
 */
router.post("/:resumeId/versions", verifyToken, createResumeVersion);

/**
 * NEW: Create a new version from file
 * POST /api/resumes/:resumeId/versions/file
 */
router.post(
  "/:resumeId/versions/file",
  verifyToken,
  upload.single("file"),
  createResumeVersionWithFile
);

// Existing endpoints
router.get("/my", verifyToken, getMyResumeWithVersions);
router.get("/mine", verifyToken, getAllMyResumes);
router.get("/:resumeId/versions", verifyToken, getResumeVersions);

/**
 * NEW: Download/view a specific version's file
 * GET /api/resumes/versions/:versionId/file
 */
router.get(
  "/versions/:versionId/file",
  verifyToken,
  getResumeVersionFile
);

/**
 * NEW: Delete a version
 * DELETE /api/resumes/versions/:versionId
 */
router.delete(
  "/versions/:versionId",
  verifyToken,
  deleteResumeVersion
);

export default router;
