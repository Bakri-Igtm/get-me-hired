import api from "./axios";

export const fetchMembers = (role) => {
  const params = {};
  if (role === "RQ" || role === "RR") {
    params.role = role;
  }
  return api.get("/api/directory", { params });
};

export const searchDirectory = (query) => {
  return api.post("/api/directory/search", { query });
};
