// src/api/resumes.js
import api from "./axios";

// ✅ keep your existing functions
export const fetchMyResumeVersions = () =>
  api.get("/api/resumes/my");

export const createResumeVersion = (resumeId, content) =>
  api.post(`/api/resumes/${resumeId}/versions`, { content });

/**
 * NEW: grouped view for "My Resumes" page.
 * Backend should return something like:
 * {
 *   resumes: [
 *     {
 *       resume_id,
 *       trackTitle,
 *       created_at,
 *       versions: [
 *         {
 *           resume_versions_id,
 *           version_number,
 *           version_label,
 *           file_name,
 *           uploaded_at,
 *           file_url
 *         }
 *       ]
 *     }
 *   ],
 *   limits: { maxResumes: 3, maxVersionsPerResume: 5 }
 * }
 */
export const fetchMyResumes = () =>
  api.get("/api/my-resumes");

/**
 * NEW: upload a new resume track or a new version (Word/.txt file).
 * mode: "new" | "existing"
 * - "new"     => create new track (trackTitle required)
 * - "existing" => add version under existing track (resumeId required)
 */
export const uploadResumeFile = (formData) =>
  api.post("/api/resumes/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

/**
 * NEW: delete a specific version (to free up slots)
 */
export const deleteResumeVersion = (resumeVersionsId) =>
  api.delete(`/api/resume-versions/${resumeVersionsId}`);
