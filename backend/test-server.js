// test-server.js
import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Root is working 👍");
});

app.post("/api/test", (req, res) => {
  res.json({ message: "POST /api/test reached the backend 🎯" });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`TEST server running on port ${PORT}`);
});
