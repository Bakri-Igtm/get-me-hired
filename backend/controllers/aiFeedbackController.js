import pool from "../db.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// SYSTEM PROMPT LIVES HERE
const RESUME_FEEDBACK_SYSTEM_PROMPT = `
You are an expert resume reviewer and career coach specializing in tech roles
(software engineering, data, DevOps, product, etc.).

Your job:
- Analyze the candidate's resume text.
- Identify weak, vague, redundant, or poorly structured parts.
- Propose concrete, high-quality edits that improve clarity, impact, and alignment with common hiring and ATS expectations.
- Output a STRICT JSON object with a list of structured suggestions so a UI can show them as “accept / reject” options and apply them to the resume text.

CRITICAL RULES:
- Do NOT invent jobs, degrees, companies, dates, or skills that are not clearly implied by the resume.
- You may rephrase and tighten text, but do not fabricate new accomplishments.
- You can slightly infer realistic numbers only when strongly implied (e.g. “many users” -> “hundreds of users”), but avoid big guesses.
- Preserve the candidate’s career story and intent.
- Use clear, professional language suitable for US-style resumes.
- All output MUST be a single valid JSON object. No markdown, no comments, no extra text.

JSON FORMAT (MUST FOLLOW EXACTLY):

{
  "summary": {
    "overall": "High-level feedback on the entire resume in 2–4 sentences.",
    "strengths": [
      "Bullet point describing a strength.",
      "Another bullet."
    ],
    "weaknesses": [
      "Bullet point describing a weakness or area to improve.",
      "Another bullet."
    ],
    "score": 0-100
  },
  "suggestions": [
    {
      "id": "s1",
      "category": "summary" | "experience" | "projects" | "skills" | "education" | "formatting" | "other",
      "type": "rewrite" | "remove" | "add" | "replace" | "reorder",
      "anchor": "A short snippet copied from the original resume text that this suggestion applies to.",
      "original": "The full original sentence/bullet/phrase, if applicable. Empty string if type is 'add'.",
      "suggested": "The improved/replacement text. Empty string if type is purely 'remove'.",
      "severity": "low" | "medium" | "high",
      "note": "1–3 sentences explaining WHY this change helps (e.g. more impact-focused, more concise, better wording)."
    }
  ]
}

DETAILED GUIDELINES:

- "summary.overall":
  - Briefly describe your impression of the resume’s strength, clarity, and focus.
- "summary.strengths":
  - 2–5 bullets about what is working well.
- "summary.weaknesses":
  - 2–5 bullets about what should be improved (content, structure, clarity, impact).
- "summary.score":
  - Integer 0–100 representing overall quality for typical tech roles.

- "suggestions":
  - Provide 5–20 suggestion objects depending on resume length and quality.
  - "id": must be unique (e.g. "s1", "s2", "s3", ...).
  - "anchor":
    - MUST be an exact or near-exact substring of the original resume text.
    - This is how the application finds the location to apply or highlight the suggestion.
  - "original":
    - Copy the full original sentence/bullet/phrase when changing it.
  - "suggested":
    - Your improved version with better impact, clarity, or structure.
  - "type":
    - "rewrite": improve wording of existing text.
    - "remove": propose removing weak/redundant text.
    - "add": suggest adding a new bullet/line; "original" can be empty.
    - "replace": swapping one snippet with another.
    - "reorder": suggest moving an item/section (describe in note what should move where).
  - "severity":
    - "high" = major issue hurting the resume.
    - "medium" = meaningful improvement but not critical.
    - "low" = nice-to-have polish.

STYLE RULES FOR REWRITES:
- Use strong action verbs and impact-focused language.
- Prefer bullets of the form: ACTION + CONTEXT + RESULT (with numbers if possible).
- Avoid first-person ("I", "my") in experience bullets.
- Avoid generic buzzwords (e.g. "hardworking", "motivated") unless attached to concrete results.

BULLET POINT REWRITE GUIDELINES:
- When suggesting changes to a bullet point, ALWAYS provide the complete replacement bullet point.
- Do NOT suggest replacing just part of a bullet point (e.g., mid-sentence fragments, or the other part of a preamble/colon).
- If a bullet needs improvement, include the entire rewritten bullet in "suggested".
- If rewriting a multi-line bullet, include all lines in your suggestion.
- This ensures the UI can cleanly replace the entire bullet at once, maintaining resume structure.

OUTPUT RULES:
- The ENTIRE response MUST be valid JSON.
- Do NOT wrap JSON in any extra formatting.
- Do NOT include extra keys beyond the schema above.
- Do NOT include any explanations outside the JSON object.
`;

// 🔁 Helper to upsert AI feedback given a feedback object
async function saveAiFeedback({ resumeVersionsId, model, feedback, userId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure resume version exists and get owner
    const [rvRows] = await conn.query(
      `
      SELECT 
        rv.resume_versions_id,
        r.user_id AS owner_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [resumeVersionsId]
    );

    if (rvRows.length === 0) {
      await conn.rollback();
      throw new Error("Resume version not found");
    }

    const { owner_id } = rvRows[0];

    // Load user type (for auth)
    const [userRows] = await conn.query(
      `SELECT user_type FROM users WHERE user_id = ?`,
      [userId]
    );
    if (userRows.length === 0) {
      await conn.rollback();
      throw new Error("User not found");
    }

    const userType = userRows[0].user_type;

    // Only owner or admin can save feedback
    if (userId !== owner_id && userType !== "AD") {
      await conn.rollback();
      const err = new Error("Only the resume owner or an admin can attach AI feedback.");
      err.statusCode = 403;
      throw err;
    }

    // Upsert AI feedback row
    const [existingRows] = await conn.query(
      `SELECT ai_feedback_id 
       FROM ai_feedback 
       WHERE resume_versions_id = ?`,
      [resumeVersionsId]
    );

    const feedbackText = JSON.stringify(feedback);
    const finalScore =
      typeof feedback?.summary?.score === "number"
        ? feedback.summary.score
        : null;

    let aiFeedbackId;

    if (existingRows.length > 0) {
      aiFeedbackId = existingRows[0].ai_feedback_id;
      await conn.query(
        `UPDATE ai_feedback
         SET model = ?, feedback_text = ?, score = ?, created_at = NOW()
         WHERE ai_feedback_id = ?`,
        [model, feedbackText, finalScore, aiFeedbackId]
      );
    } else {
      const [result] = await conn.query(
        `INSERT INTO ai_feedback (resume_versions_id, model, feedback_text, score)
         VALUES (?, ?, ?, ?)`,
        [resumeVersionsId, model, feedbackText, finalScore]
      );
      aiFeedbackId = result.insertId;
    }

    await conn.commit();
    return aiFeedbackId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// 1) Manual upsert endpoint (for testing with Postman)
export const upsertAiFeedback = async (req, res) => {
  const { resumeVersionsId, model, feedback } = req.body;
  const { userId } = req.user;

  if (!resumeVersionsId || !model || !feedback) {
    return res.status(400).json({
      message: "resumeVersionsId, model, and feedback are required",
    });
  }

  if (typeof feedback !== "object") {
    return res.status(400).json({
      message: "feedback must be a JSON object (not a string)",
    });
  }

  try {
    const aiFeedbackId = await saveAiFeedback({
      resumeVersionsId,
      model,
      feedback,
      userId,
    });

    return res.status(201).json({
      ai_feedback_id: aiFeedbackId,
      message: "AI feedback saved successfully",
    });
  } catch (err) {
    console.error("Error saving AI feedback:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({ message: err.message || "Error saving AI feedback" });
  }
};

// 2) HELPER: Generate AI feedback (internal, non-blocking use)
export async function generateAiFeedbackAsync(resumeVersionsId) {
  try {
    // Look up resume text
    const [rows] = await pool.query(
      `
      SELECT 
        rv.resume_versions_id,
        rv.content,
        r.user_id AS owner_id
      FROM resume_versions rv
      JOIN resume r ON rv.resume_id = r.resume_id
      WHERE rv.resume_versions_id = ?
      `,
      [resumeVersionsId]
    );

    if (rows.length === 0) {
      throw new Error("Resume version not found");
    }

    const resumeText = rows[0].content || "";

    if (!resumeText || resumeText.trim().length === 0) {
      throw new Error("Resume version has no content to analyze.");
    }

    const chosenModel = "gpt-4o-mini";

    // Call OpenAI with system prompt + resume text
    const completion = await openai.chat.completions.create({
      model: chosenModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: RESUME_FEEDBACK_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Here is the resume text to review:\n\n${resumeText}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("AI did not return any content.");
    }

    let feedback;
    try {
      feedback = JSON.parse(content);
    } catch (err) {
      console.error("Failed to parse AI JSON:", content);
      throw new Error("AI returned invalid JSON.");
    }

    // Save directly to DB
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existingRows] = await conn.query(
        `SELECT ai_feedback_id 
         FROM ai_feedback 
         WHERE resume_versions_id = ?`,
        [resumeVersionsId]
      );

      const feedbackText = JSON.stringify(feedback);
      const finalScore = feedback?.summary?.score || null;

      if (existingRows.length > 0) {
        await conn.query(
          `UPDATE ai_feedback
           SET model = ?, feedback_text = ?, score = ?, created_at = NOW()
           WHERE resume_versions_id = ?`,
          [chosenModel, feedbackText, finalScore, resumeVersionsId]
        );
      } else {
        await conn.query(
          `INSERT INTO ai_feedback (resume_versions_id, model, feedback_text, score)
           VALUES (?, ?, ?, ?)`,
          [resumeVersionsId, chosenModel, feedbackText, finalScore]
        );
      }

      await conn.commit();
      console.log(`✓ AI feedback generated for resume ${resumeVersionsId}`);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(
      `✗ AI feedback generation failed for resume ${resumeVersionsId}:`,
      err.message
    );
    throw err;
  }
}

// 2B) AUTO-GENERATE endpoint: call AI model via helper, then save
export const generateAiFeedback = async (req, res) => {
  const { resumeVersionsId, model } = req.body;
  const { userId } = req.user;

  if (!resumeVersionsId) {
    return res.status(400).json({
      message: "resumeVersionsId is required",
    });
  }

  try {
    await generateAiFeedbackAsync(resumeVersionsId);
    return res.status(201).json({
      message: "AI feedback generated and saved successfully",
    });
  } catch (err) {
    console.error("Error generating AI feedback:", err);
    return res.status(500).json({ message: err.message || "Error generating AI feedback" });
  }
};

// 3) Fetch feedback for a version
export const getAiFeedbackForVersion = async (req, res) => {
  const { resumeVersionsId } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        ai_feedback_id,
        resume_versions_id,
        model,
        feedback_text,
        score,
        created_at
      FROM ai_feedback
      WHERE resume_versions_id = ?
      `,
      [resumeVersionsId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "No AI feedback found" });
    }

    const row = rows[0];

    let parsedFeedback = null;
    try {
      parsedFeedback = JSON.parse(row.feedback_text);
    } catch (e) {
      parsedFeedback = null;
    }

    return res.json({
      ai_feedback_id: row.ai_feedback_id,
      resume_versions_id: row.resume_versions_id,
      model: row.model,
      score: row.score,
      created_at: row.created_at,
      feedback: parsedFeedback,
    });
  } catch (err) {
    console.error("Error fetching AI feedback:", err);
    return res.status(500).json({ message: "Error fetching AI feedback" });
  }
};
