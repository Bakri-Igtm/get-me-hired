// routes/reviewerRoutes.js
import express from "express";
import { createReviewer } from "../controllers/reviewerController.js";

const router = express.Router();

// POST /api/reviewers
router.post("/", createReviewer);

export default router;
