import express from "express";
import { createRequester } from "../controllers/requesterController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// POST /api/requesters
router.post("/", verifyToken, createRequester);

export default router;
