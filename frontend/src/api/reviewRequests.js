// src/api/reviewRequests.js
import api from "./axios";

export const fetchIncomingRequests = () =>
  api.get("/api/review-requests/incoming");

export const fetchOutgoingRequests = () =>
  api.get("/api/review-requests/outgoing");

export const fetchRequestDetail = (requestId) =>
  api.get(`/api/review-requests/${requestId}`);

export const submitReview = ({ resumeVersionsId, rating, comment }) =>
  api.post("/api/reviews", {
    resumeVersionsId,
    rating,
    comment,
  });

// create a review request – update to pass visibility + track too
export const createReviewRequest = ({
  resumeVersionsId,
  reviewerId,
  visibility,
  track,
  requestNote,
}) =>
  api.post("/api/review-requests", {
    resumeVersionsId,
    reviewerId,
    visibility,
    track,
    requestNote,
  });

// accept / decline a request
export const respondToRequest = (requestId, status) =>
  api.post(`/api/review-requests/${requestId}/respond`, { status });
