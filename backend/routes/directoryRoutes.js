// backend/routes/directoryRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { listMembers, searchDirectory } from "../controllers/directoryController.js";

const router = express.Router();

// GET /api/directory?role=RQ|RR
router.get("/", verifyToken, listMembers);

// POST /api/directory/search
router.post("/search", verifyToken, searchDirectory);

export default router;
