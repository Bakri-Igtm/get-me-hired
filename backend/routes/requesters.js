import express from "express";
import { createRequester } from "../controllers/requesterController.js";

const router = express.Router();

// POST /api/requesters
router.post("/", createRequester);

export default router;
