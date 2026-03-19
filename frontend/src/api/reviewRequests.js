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

// create a review request – supports aiMode: 'none' | 'suggestions' | 'rewrite'
export const createReviewRequest = ({
  resumeVersionsId,
  reviewerId,
  visibility,
  track,
  requestNote,
  aiMode,
  templateId,
}) =>
  api.post("/api/review-requests", {
    resumeVersionsId,
    reviewerId,
    visibility,
    track,
    requestNote,
    aiMode,
    templateId,
  });

// fetch available resume templates for AI rewrite
export const fetchTemplates = () => api.get("/api/ai-feedback/templates");

// accept / decline a request
export const respondToRequest = (requestId, status) =>
  api.post(`/api/review-requests/${requestId}/respond`, { status });
