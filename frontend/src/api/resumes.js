// src/api/resumes.js
import api from "./axios";

export const fetchMyResumeVersions = () =>
  api.get("/api/resumes/my");

export const createResumeVersion = (resumeId, content) =>
  api.post(`/api/resumes/${resumeId}/versions`, { content });