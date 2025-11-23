// backend/routes/directoryRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { listMembers } from "../controllers/directoryController.js";

const router = express.Router();

// GET /api/directory?role=RQ|RR
router.get("/", verifyToken, listMembers);

export default router;
