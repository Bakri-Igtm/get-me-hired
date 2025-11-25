// src/api/reviewRequests.js
import api from "./axios";

// Feed for the logged-in user as reviewer
export const fetchIncomingRequests = () =>
  api.get("/api/review-requests/incoming");

// Full detail for one request
export const fetchRequestDetail = (requestId) =>
  api.get(`/api/review-requests/${requestId}`);

// Submit a human review for a resume version
export const submitReview = ({ resumeVersionsId, rating, comment }) =>
  api.post("/api/reviews", {
    resumeVersionsId,
    rating,
    comment,
  });
