// routes/resumes.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { verifyToken } from "../middleware/authMiddleware.js";
import {
  uploadResume,
  getAllMyResumes,
  getAllMyResumeVersions,
  createResumeVersionWithFile,
  createResumeVersionWithContent,
  getResumeVersionFile,
  deleteResumeVersion,
  getResumeVersions,
  extractResumeFile,
  getResumeContent,
  updateResumeContent,
} from "../controllers/resumeController.js";

const router = express.Router();

// ---------- Multer setup ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const RESUME_DIR = path.join(UPLOAD_ROOT, "resumes");

if (!fs.existsSync(RESUME_DIR)) {
  fs.mkdirSync(RESUME_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, RESUME_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = file.originalname
      .replace(ext, "")
      .replace(/[^a-z0-9\-]+/gi, "_")
      .toLowerCase();
    cb(null, `${Date.now()}_${safeBase}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only .doc, .docx, and .txt files are allowed"));
  }
};

const upload = multer({ storage, fileFilter });

// ---------- Routes ----------

// GET /api/resumes/mine  -> list all my resumes + latest version metadata
router.get("/mine", verifyToken, getAllMyResumes);

// GET /api/resumes/my-versions -> get all my resume versions (for creating review request)
router.get("/my-versions", verifyToken, getAllMyResumeVersions);

// POST /api/resumes/upload -> upload a new resume or new version (unified handler)
router.post(
  "/upload",
  verifyToken,
  upload.single("file"),
  uploadResume
);

// POST /api/resumes/extract -> extract HTML preview from uploaded file (no persistence)
router.post(
  "/extract",
  verifyToken,
  upload.single("file"),
  extractResumeFile
);

// POST /api/resumes/:resumeId/versions/file
//    -> upload a new version file under an existing resume track
router.post(
  "/:resumeId/versions/file",
  verifyToken,
  upload.single("file"),
  createResumeVersionWithFile
);

// POST /api/resumes/:resumeId/versions
//    -> create a new version with HTML content directly (no file)
router.post(
  "/:resumeId/versions",
  verifyToken,
  createResumeVersionWithContent
);

// GET /api/resumes/file/:versionId
//   -> stream the stored file to the client
router.get("/file/:versionId", verifyToken, getResumeVersionFile);

// GET /api/resumes/content/:resumeVersionsId
//   -> get the text content of a resume version
router.get("/content/:resumeVersionsId", verifyToken, getResumeContent);

// PATCH /api/resumes/content/:resumeVersionsId
//   -> update the text content of a resume version
router.patch("/content/:resumeVersionsId", verifyToken, updateResumeContent);

// DELETE /api/resumes/version/:resumeVersionsId
//   -> delete a specific version (and its file)
router.delete(
  "/version/:resumeVersionsId",
  verifyToken,
  deleteResumeVersion
);

export default router;
