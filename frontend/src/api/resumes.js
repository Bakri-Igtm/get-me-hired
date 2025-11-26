// src/api/resumes.js
import api from "./axios";

export const fetchMyResumeVersions = () =>
  api.get("/api/resumes/my");
