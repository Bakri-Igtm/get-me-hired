// routes/reviewRequestRoutes.js
import express from "express";
import {
  createReviewRequest,
  getIncomingRequests,
  getOutgoingRequests,
  respondToReviewRequest,
  getReviewRequestDetail,   // ⬅ add this
} from "../controllers/reviewRequestController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Create a new review request
router.post("/", verifyToken, createReviewRequest);

// Requests sent *to* me
router.get("/incoming", verifyToken, getIncomingRequests);

// Requests I have sent
router.get("/outgoing", verifyToken, getOutgoingRequests);

// Accept / decline
router.post("/:id/respond", verifyToken, respondToReviewRequest);

// 👇 NEW: full detail for one request (used by the feed detail pane)
router.get("/:id", verifyToken, getReviewRequestDetail);

export default router;
