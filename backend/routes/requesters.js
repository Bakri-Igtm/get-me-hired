import express from "express";
import { createRequester } from "../controllers/requesterController.js";

const router = express.Router();

// POST /api/requesters
// Public endpoint for requester signup (no token required)
router.post("/", createRequester);

export default router;
