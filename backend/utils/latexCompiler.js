// utils/latexCompiler.js
// Compiles LaTeX source to PDF using the latex.ytotech.com free API
// Falls back gracefully if the service is unavailable.

import fs from "fs";
import path from "path";

const LATEX_API_URL = "https://latex.ytotech.com/builds/sync";

/**
 * Compile a LaTeX source string into a PDF buffer.
 * @param {string} latexSource  – full .tex document source
 * @returns {Promise<Buffer>}   – the compiled PDF as a Node Buffer
 */
export async function compileLatexToPdf(latexSource) {
  const body = JSON.stringify({
    compiler: "pdflatex",
    resources: [
      {
        main: true,
        content: latexSource,
      },
    ],
  });

  const response = await fetch(LATEX_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `LaTeX compilation failed (HTTP ${response.status}): ${text}`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/pdf")) {
    const text = await response.text().catch(() => "");
    throw new Error(`LaTeX API did not return a PDF. Response: ${text.slice(0, 300)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Compile LaTeX and persist the PDF to disk.
 * @param {string} latexSource
 * @param {string} outputPath – absolute path where the .pdf should be saved
 * @returns {Promise<string>}  – the outputPath on success
 */
export async function compileAndSave(latexSource, outputPath) {
  const pdfBuffer = await compileLatexToPdf(latexSource);

  // Ensure target directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, pdfBuffer);
  return outputPath;
}
