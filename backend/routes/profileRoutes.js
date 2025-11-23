// backend/routes/profileRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
  getMyProfile,
  upsertProfile,
  addEducation,
  updateEducation,
  deleteEducation,
  addExperience,
  updateExperience,
  deleteExperience,
  addLink,
  deleteLink,
  getPublicProfile,
} from "../controllers/profileController.js";

const router = express.Router();

// core profile
router.get("/public/:id", verifyToken, getPublicProfile);
router.get("/me", verifyToken, getMyProfile);
router.put("/", verifyToken, upsertProfile);

// education
router.post("/education", verifyToken, addEducation);
router.put("/education/:id", verifyToken, updateEducation);
router.delete("/education/:id", verifyToken, deleteEducation);

// experience
router.post("/experience", verifyToken, addExperience);
router.put("/experience/:id", verifyToken, updateExperience);
router.delete("/experience/:id", verifyToken, deleteExperience);

// links (simple add/remove)
router.post("/links", verifyToken, addLink);
router.delete("/links/:id", verifyToken, deleteLink);

export default router;
