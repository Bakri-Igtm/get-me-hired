// src/api/profile.js
import api from "./axios";

export const getMyProfile = () => api.get("/api/profile/me");
export const saveProfile = (data) => api.put("/api/profile", data);

// education
export const addEducation = (data) => api.post("/api/profile/education", data);
export const updateEducation = (id, data) => api.put(`/api/profile/education/${id}`, data);
export const deleteEducation = (id) => api.delete(`/api/profile/education/${id}`);

// experience
export const addExperience = (data) => api.post("/api/profile/experience", data);
export const updateExperience = (id, data) => api.put(`/api/profile/experience/${id}`, data);
export const deleteExperience = (id) => api.delete(`/api/profile/experience/${id}`);

// links
export const addLink = (data) => api.post("/api/profile/links", data);
export const deleteLink = (id) => api.delete(`/api/profile/links/${id}`);

//public profile
export const getPublicProfile = (userId) =>
  api.get(`/api/profile/public/${userId}`);
