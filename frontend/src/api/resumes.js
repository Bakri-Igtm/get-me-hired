// src/api/resumes.js
import api from "./axios";

// list all resumes (tracks) + latest version info
export const fetchMyResumes = () => api.get("/api/resumes/mine");

// fetch all my resume versions for creating a review request
export const fetchMyResumeVersions = () => api.get("/api/resumes/my-versions");

// upload a new version file under a resume track
export const uploadResumeFile = (formData) => {
  return api.post(`/api/resumes/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// extract HTML content from an uploaded file (preview only)
export const extractResumeFile = (formData) => {
  return api.post(`/api/resumes/extract`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// get the text content of a resume version
export const fetchResumeContent = (resumeVersionsId) =>
  api.get(`/api/resumes/content/${resumeVersionsId}`);

// update the text content of a resume version
export const updateResumeContent = (resumeVersionsId, content) =>
  api.patch(`/api/resumes/content/${resumeVersionsId}`, { content });

// stream a file (for viewing)
export const getResumeFileUrl = (resumeVersionsId) =>
  `/api/resumes/file/${resumeVersionsId}`;

// download a file
export const downloadResumeFile = (resumeVersionsId) =>
  api.get(`/api/resumes/file/${resumeVersionsId}`, { responseType: "blob" });

// delete a version
export const deleteResumeVersion = (resumeVersionsId) =>
  api.delete(`/api/resumes/version/${resumeVersionsId}`);
