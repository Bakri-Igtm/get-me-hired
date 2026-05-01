import pool from "../db.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// SYSTEM PROMPT LIVES HERE
const RESUME_FEEDBACK_SYSTEM_PROMPT = `
You are an expert resume reviewer and career coach with deep knowledge of hiring standards across all industries (Tech, Finance, Healthcare, Creative, Admin, etc.) and career levels (Entry-level to Executive).

Your job:
- Analyze the candidate's resume text to infer their target role and industry.
- Identify weak, vague, redundant, or poorly structured parts based on industry-specific best practices.
- Propose concrete, high-quality edits that improve clarity, impact, and alignment with modern hiring and ATS expectations.
- Output a STRICT JSON object with a list of structured suggestions so a UI can show them as “accept / reject” options and apply them to the resume text.

CRITICAL RULES:
- Do NOT invent jobs, degrees, companies, dates, or skills that are not clearly implied by the resume.
- You may rephrase and tighten text, but do not fabricate new accomplishments.
- You can slightly infer realistic numbers only when strongly implied (e.g. “many users” -> “hundreds of users”), but avoid big guesses.
- Preserve the candidate’s career story and intent.
- Use clear, professional language suitable for the candidate's likely region (default to US-style if unclear).
- All output MUST be a single valid JSON object. No markdown, no comments, no extra text.

JSON FORMAT (MUST FOLLOW EXACTLY):

{
  "summary": {
    "overall": "High-level feedback on the entire resume in 2–4 sentences, noting the inferred target industry.",
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
  - Briefly describe your impression of the resume’s strength, clarity, and focus. Mention if the resume seems well-tailored to a specific field.
- "summary.strengths":
  - 2–5 bullets about what is working well.
- "summary.weaknesses":
  - 2–5 bullets about what should be improved (content, structure, clarity, impact).
- "summary.score":
  - Integer 0–100 representing overall quality for the inferred career path.

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
- Use strong action verbs and impact-focused language appropriate for the industry.
- For corporate/technical roles: Prefer ACTION + CONTEXT + RESULT (with numbers if possible).
- For creative/academic roles: Ensure clarity and portfolio/publication focus where applicable.
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

// ─── AI REWRITE ───────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { compileAndSave } from "../utils/latexCompiler.js";

// ─── LIST RESUME TEMPLATES ───────────────────────────────────────────────────
export const listTemplates = async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT template_id, name, description, preview_label, tex_filename
       FROM resume_templates
       WHERE is_active = 1
       ORDER BY sort_order`
    );
    return res.json(rows);
  } catch (err) {
    console.error("listTemplates error:", err);
    return res.status(500).json({ message: "Error listing templates" });
  }
};

// ─── HELPER: load preamble + commands-hint for a given template ─────────────
async function loadTemplate(templateId) {
  // 1. Look up template row
  const [rows] = await pool.query(
    `SELECT tex_filename, ai_commands_hint FROM resume_templates WHERE template_id = ?`,
    [templateId]
  );
  if (rows.length === 0) throw new Error(`Template ${templateId} not found`);

  const { tex_filename, ai_commands_hint } = rows[0];

  // 2. Read the .tex file from disk
  const texPath = path.join(process.cwd(), "templates", tex_filename);
  const full = fs.readFileSync(texPath, "utf-8");
  const idx = full.indexOf("\\begin{document}");
  const preamble = idx >= 0 ? full.substring(0, idx) : full;

  return { preamble, commandsHint: ai_commands_hint || "" };
}

// Build the rewrite system prompt dynamically per-template
function buildRewritePrompt(commandsHint) {
  return `
You are an expert resume writer. You will receive the text content of a candidate's resume.
Your job:
1. Rewrite and improve the resume content (better action verbs, quantified achievements, concise language, ATS-friendly).
2. Output the resume body as LaTeX code that uses ONLY the custom commands listed below.
3. Do NOT output the preamble, \\documentclass, \\usepackage, or any command definitions — only the body between \\begin{document} and \\end{document} (inclusive).
4. Do NOT invent jobs, degrees, skills, or accomplishments that are not present or clearly implied.
5. Preserve the candidate's career story.
6. The ENTIRE resume MUST fit on exactly ONE page. Be concise — trim low-impact bullets, merge similar items, and keep descriptions tight. Never let content overflow to a second page.
7. Use the \\resumeHeading command for the name and contact header, following the EXACT format shown in the HEADER line of the commands list below. Include only contact info present in the original resume — do NOT invent any.

Available custom commands (already defined in the preamble):
  ${commandsHint}

CRITICAL LATEX STRUCTURE RULES:
- Every section containing subheadings (\\resumeSubheading, \\resumeProjectHeading, etc.) MUST be wrapped in \\resumeSubHeadingListStart / \\resumeSubHeadingListEnd.
- Bullet items (\\resumeItem) under any heading MUST be wrapped in \\resumeItemListStart / \\resumeItemListEnd. NEVER place \\resumeItem outside of an itemize list environment.
- For \\resumeProjectHeading, ALWAYS bold the project name: \\resumeProjectHeading{\\textbf{Project Name} $|$ \\emph{Tech Stack Used}}{Date or Link}
- Correct section pattern:
  \\section{Section Name}
  \\resumeSubHeadingListStart
    \\resumeSubheading{Title}{Date}{Subtitle}{Location}
    \\resumeItemListStart
      \\resumeItem{Bullet text here}
    \\resumeItemListEnd
  \\resumeSubHeadingListEnd
- Correct project pattern:
  \\section{Projects}
  \\resumeSubHeadingListStart
    \\resumeProjectHeading{\\textbf{Name} $|$ \\emph{Tech}}{Date}
    \\resumeItemListStart
      \\resumeItem{Bullet text here}
    \\resumeItemListEnd
  \\resumeSubHeadingListEnd

CRITICAL LATEX ESCAPING RULES:
- The % character is a COMMENT in LaTeX — ALWAYS write \\% when you mean a percent sign (e.g. 80\\%, 15\\%).
- The & character must be \\& outside of tabular environments.
- The # character must be \\# in text.
- The \\resumeSubheading command requires EXACTLY 4 arguments: {Title}{Date}{Subtitle}{Date}. If an argument is empty, use {}.

EXPERIENCE BULLET RULES:
- Every role in the Experience section MUST have at least 3 bullet points.
- At least 1 bullet per role MUST follow the XYZ format: "Accomplished [X] by implementing [Y], resulting in [Z]" — where X is what you did, Y is how you did it, and Z is a measurable outcome (numbers, percentages, dollar amounts, time saved, etc.).
- The remaining bullets should use strong action verbs and be impact-focused.
- Each bullet should be 1–2 lines max. Be concise but specific.
- If quantified results aren't explicitly stated in the original, you may reasonably infer a realistic metric only when strongly implied (e.g. "managed a team" → "Led a team of 5+").

ONE-PAGE RULES:
- Keep 3–5 bullet points per role, each 1–2 lines max.
- If the resume has many roles/projects, keep only the most impactful bullets and trim projects/skills sections to stay within one page.
- Use \\vspace{-Xpt} between sections to tighten spacing if needed.
- Prefer shorter, punchier phrasing over verbose descriptions.

Output ONLY valid LaTeX starting with \\begin{document} and ending with \\end{document}.
Do NOT wrap in markdown code fences. No explanation text — pure LaTeX only.
`;
}

/**
 * Generate an AI-rewritten resume as LaTeX → compile to PDF, store both.
 * Called asynchronously after review-request creation.
 * @param {number} resumeVersionsId
 * @param {number|null} templateId — FK to resume_templates; defaults to 1 (Classic)
 */
export async function generateAiRewriteAsync(resumeVersionsId, templateId) {
  try {
    // 0. Default to Classic (id=1) if no template specified
    const tplId = templateId || 1;

    // Load template preamble + commands hint
    const { preamble, commandsHint } = await loadTemplate(tplId);
    const systemPrompt = buildRewritePrompt(commandsHint);

    // 1. Fetch resume text
    const [rows] = await pool.query(
      `SELECT rv.resume_versions_id, rv.content, r.user_id AS owner_id
       FROM resume_versions rv
       JOIN resume r ON rv.resume_id = r.resume_id
       WHERE rv.resume_versions_id = ?`,
      [resumeVersionsId]
    );
    if (rows.length === 0) throw new Error("Resume version not found");

    const resumeText = rows[0].content || "";
    if (!resumeText.trim()) throw new Error("Resume version has no content to rewrite.");

    // Strip HTML tags so the LLM gets clean text
    const plainText = resumeText.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

    const chosenModel = "gpt-4o-mini";

    // 2. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: chosenModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the resume text to rewrite:\n\n${plainText}` },
      ],
    });

    let latexBody = completion.choices[0]?.message?.content || "";
    if (!latexBody.trim()) throw new Error("AI returned empty LaTeX.");

    // Clean markdown fences if AI added them anyway
    latexBody = latexBody.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();

    // Sanitize common AI LaTeX mistakes:
    // 1. Escape bare % that aren't already escaped (\%) — % is a comment in LaTeX
    latexBody = latexBody.replace(/(?<!\\)%/g, "\\%");
    // 2. Escape bare # not already escaped
    latexBody = latexBody.replace(/(?<!\\)#(?!\d)/g, "\\#");
    // 3. Escape bare & not already escaped (except inside tabular environments)
    // Skip this one — & is used legitimately in tabular* and section titles like \&
    // 4. Escape bare ~ not already escaped (rare, but can cause issues)
    // 5. Fix \resumeSubheading with only 3 args: {A}{B}{C} → {A}{B}{C}{}
    latexBody = latexBody.replace(
      /\\resumeSubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}(?!\s*\{)/g,
      "\\resumeSubheading{$1}{$2}{$3}{}"
    );

    // 3. Combine preamble + body
    const fullLatex = preamble + "\n" + latexBody;

    // 4. Compile to PDF
    const REWRITE_DIR = path.join(process.cwd(), "uploads", "rewrites");
    if (!fs.existsSync(REWRITE_DIR)) fs.mkdirSync(REWRITE_DIR, { recursive: true });
    const pdfFilename = `rewrite_${resumeVersionsId}_${Date.now()}.pdf`;
    const pdfPath = path.join(REWRITE_DIR, pdfFilename);

    try {
      await compileAndSave(fullLatex, pdfPath);
      console.log(`✓ Compiled rewrite PDF for resume ${resumeVersionsId}`);
    } catch (compileErr) {
      console.error(`✗ LaTeX compilation failed for resume ${resumeVersionsId}:`, compileErr.message);
      // Still save the LaTeX so the user can download/fix it
    }

    const relativePdfPath = fs.existsSync(pdfPath) ? `uploads/rewrites/${pdfFilename}` : null;

    // 5. Upsert into ai_feedback
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.query(
        `SELECT ai_feedback_id FROM ai_feedback WHERE resume_versions_id = ?`,
        [resumeVersionsId]
      );

      if (existing.length > 0) {
        await conn.query(
          `UPDATE ai_feedback
           SET model = ?, rewrite_latex = ?, rewrite_pdf_path = ?, created_at = NOW()
           WHERE ai_feedback_id = ?`,
          [chosenModel, fullLatex, relativePdfPath, existing[0].ai_feedback_id]
        );
      } else {
        await conn.query(
          `INSERT INTO ai_feedback (resume_versions_id, model, rewrite_latex, rewrite_pdf_path)
           VALUES (?, ?, ?, ?)`,
          [resumeVersionsId, chosenModel, fullLatex, relativePdfPath]
        );
      }

      await conn.commit();
      console.log(`✓ AI rewrite saved for resume ${resumeVersionsId}`);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(`✗ AI rewrite generation failed for resume ${resumeVersionsId}:`, err.message);
    throw err;
  }
}

/**
 * GET /api/ai-feedback/rewrite-pdf/:resumeVersionsId
 * Serve the compiled rewrite PDF to the browser.
 */
export const serveRewritePdf = async (req, res) => {
  const { resumeVersionsId } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT rewrite_pdf_path FROM ai_feedback WHERE resume_versions_id = ?`,
      [resumeVersionsId]
    );

    if (rows.length === 0 || !rows[0].rewrite_pdf_path) {
      return res.status(404).json({ message: "No rewrite PDF found" });
    }

    const absPath = path.join(process.cwd(), rows[0].rewrite_pdf_path);
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ message: "Rewrite PDF file missing from disk" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    console.error("serveRewritePdf error:", err);
    return res.status(500).json({ message: "Error serving rewrite PDF" });
  }
};

/**
 * GET /api/ai-feedback/rewrite-latex/:resumeVersionsId
 * Return the raw LaTeX source so the user can copy/download it.
 */
export const getRewriteLatex = async (req, res) => {
  const { resumeVersionsId } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT rewrite_latex FROM ai_feedback WHERE resume_versions_id = ?`,
      [resumeVersionsId]
    );

    if (rows.length === 0 || !rows[0].rewrite_latex) {
      return res.status(404).json({ message: "No rewrite LaTeX found" });
    }

    return res.json({ latex: rows[0].rewrite_latex });
  } catch (err) {
    console.error("getRewriteLatex error:", err);
    return res.status(500).json({ message: "Error fetching rewrite LaTeX" });
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
