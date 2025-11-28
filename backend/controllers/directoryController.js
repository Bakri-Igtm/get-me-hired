// backend/controllers/directoryController.js
import pool from "../db.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// GET /api/directory?role=RQ|RR
export const listMembers = async (req, res) => {
  try {
    const { role } = req.query; // expected 'RQ' or 'RR' (optional)

    const params = [];
    let whereClause = "WHERE 1=1";

    if (role === "RQ" || role === "RR") {
      whereClause += " AND u.user_type = ?";
      params.push(role);
    }

    // We could exclude admins if we want
    // whereClause += " AND u.user_type IN ('RQ', 'RR')";

    const [rows] = await pool.query(
      `
      SELECT
        u.user_id,
        u.user_fname AS firstName,
        u.user_lname AS lastName,
        u.user_type,
        p.headline,
        p.avatar_url
      FROM users u
      LEFT JOIN profile p ON p.user_id = u.user_id
      ${whereClause}
      ORDER BY u.user_fname ASC, u.user_lname ASC
      `,
      params
    );

    return res.json({ members: rows });
  } catch (err) {
    console.error("listMembers error:", err);
    return res.status(500).json({ message: "Error loading directory" });
  }
};

// POST /api/directory/search
export const searchDirectory = async (req, res) => {
  const { query } = req.body;

  if (!query || !query.trim()) {
    return res.status(400).json({ message: "Search query is required" });
  }

  try {
    // 1. Use OpenAI to extract search intent and keywords
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a search query parser for a professional networking site.
          Extract the following from the user's search query:
          - keywords: list of relevant skills, job titles, industries, or topics. IMPORTANT: Include variations, synonyms, and related job titles to maximize matches (e.g. if user says "software engineering", include "software engineer", "developer", "coding", "programmer", "engineering").
          - role: "RQ" (Requester), "RR" (Reviewer), or null. IMPORTANT: Only set this if the user EXPLICITLY asks for a "reviewer", "requester", "mentor", or "candidate". If they just say "looking for someone" or "people" or "expert", set to null.
          - name: if the user is searching for a specific person, extract the name.
          
          Return JSON: { "keywords": [], "role": "RQ"|"RR"|null, "name": string|null }`
        },
        {
          role: "user",
          content: query
        }
      ]
    });

    const searchParams = JSON.parse(completion.choices[0].message.content);
    const { keywords, role, name } = searchParams;

    // 2. Build SQL Query with scoring
    let sql = `
      SELECT
        u.user_id,
        u.user_fname AS firstName,
        u.user_lname AS lastName,
        u.user_type,
        p.headline,
        p.summary,
        p.avatar_url,
        (0
    `;

    const params = [];

    // Scoring logic
    if (name) {
      sql += ` + (CASE WHEN CONCAT(u.user_fname, ' ', u.user_lname) LIKE ? THEN 50 ELSE 0 END)`;
      params.push(`%${name}%`);
    }

    if (keywords && keywords.length > 0) {
      keywords.forEach(kw => {
        const term = `%${kw}%`;
        // Headline matches are high value
        sql += ` + (CASE WHEN p.headline LIKE ? THEN 10 ELSE 0 END)`;
        params.push(term);
        // Summary matches
        sql += ` + (CASE WHEN p.summary LIKE ? THEN 5 ELSE 0 END)`;
        params.push(term);
        // Experience matches (joined table check would be complex, so we'll do a subquery or just check profile for now if we had denormalized data. 
        // For now, let's stick to profile fields to keep it fast, or do a LEFT JOIN check)
      });
    }

    sql += `) as score
      FROM users u
      LEFT JOIN profile p ON p.user_id = u.user_id
      WHERE 1=1
    `;

    // Filter by role if specified
    if (role) {
      sql += ` AND u.user_type = ?`;
      params.push(role);
    }

    // Only return results with score > 0
    sql += ` HAVING score > 0 ORDER BY score DESC LIMIT 20`;

    // If we want to search education/experience, we need to join them.
    // Let's do a more comprehensive query with joins for better "AI" feel.
    // We will group by user_id to avoid duplicates.
    
    let complexSql = `
      SELECT
        u.user_id,
        u.user_fname AS firstName,
        u.user_lname AS lastName,
        u.user_type,
        p.headline,
        p.avatar_url,
        SUM(
          0
    `;
    
    const complexParams = [];

    if (name) {
      complexSql += ` + (CASE WHEN CONCAT(u.user_fname, ' ', u.user_lname) LIKE ? THEN 50 ELSE 0 END)`;
      complexParams.push(`%${name}%`);
    }

    if (keywords && keywords.length > 0) {
      keywords.forEach(kw => {
        const term = `%${kw}%`;
        // Profile matches
        complexSql += ` + (CASE WHEN p.headline LIKE ? THEN 20 ELSE 0 END)`;
        complexParams.push(term);
        complexSql += ` + (CASE WHEN p.summary LIKE ? THEN 10 ELSE 0 END)`;
        complexParams.push(term);
        
        // Experience matches
        complexSql += ` + (CASE WHEN e.title LIKE ? THEN 15 ELSE 0 END)`;
        complexParams.push(term);
        complexSql += ` + (CASE WHEN e.description LIKE ? THEN 5 ELSE 0 END)`;
        complexParams.push(term);
        
        // Education matches
        complexSql += ` + (CASE WHEN edu.field_of_study LIKE ? THEN 10 ELSE 0 END)`;
        complexParams.push(term);
        complexSql += ` + (CASE WHEN edu.school LIKE ? THEN 5 ELSE 0 END)`;
        complexParams.push(term);
      });
    }

    complexSql += `
        ) as score
      FROM users u
      LEFT JOIN profile p ON p.user_id = u.user_id
      LEFT JOIN experience e ON e.user_id = u.user_id
      LEFT JOIN education edu ON edu.user_id = u.user_id
      WHERE 1=1
    `;

    if (role) {
      complexSql += ` AND u.user_type = ?`;
      complexParams.push(role);
    }

    complexSql += `
      GROUP BY u.user_id
      HAVING score > 0
      ORDER BY score DESC
      LIMIT 20
    `;

    const [rows] = await pool.query(complexSql, complexParams);

    return res.json({ 
      members: rows,
      searchMeta: { keywords, role, name }
    });

  } catch (err) {
    console.error("searchDirectory error:", err);
    return res.status(500).json({ message: "Error performing search" });
  }
};

