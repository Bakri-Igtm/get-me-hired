// routes/reviewRoutes.js
import express from "express";
import {
  createOrUpdateReview,
  getReviewsForVersion,
} from "../controllers/reviewController.js";
import {
  listReviewComments,
  addReviewComment,
} from "../controllers/reviewCommentController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Anyone logged-in (RQ/RR/AD) can submit a review
router.post("/", verifyToken, createOrUpdateReview);

// Get all reviews for a specific resume version
router.get("/version/:resumeVersionsId", verifyToken, getReviewsForVersion)
router.get("/:id/comments", verifyToken, listReviewComments);
router.post("/:id/comments", verifyToken, addReviewComment);;

export default router;
