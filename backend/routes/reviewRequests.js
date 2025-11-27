// routes/reviewRequestRoutes.js
import express from "express";
import {
  createReviewRequest,
  getIncomingRequests,
  getOutgoingRequests,
  respondToReviewRequest,
  getReviewRequestDetail,   // ⬅ add this
  updateReviewRequestVersion,
  updateAiSuggestionStatus,
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

// Update which resume version the request points to
router.put("/:id/resume-version", verifyToken, updateReviewRequestVersion);

// 👇 NEW: full detail for one request (used by the feed detail pane)
router.get("/:id", verifyToken, getReviewRequestDetail);

router.patch(
  "/:id/ai-suggestions",
  verifyToken,
  updateAiSuggestionStatus
);

export default router;
