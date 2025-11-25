// src/api/reviewComments.js
import api from "./axios";

export const fetchReviewComments = (reviewId) =>
  api.get(`/api/reviews/${reviewId}/comments`);

export const addReviewComment = (reviewId, comment_text) =>
  api.post(`/api/reviews/${reviewId}/comments`, { comment_text });
