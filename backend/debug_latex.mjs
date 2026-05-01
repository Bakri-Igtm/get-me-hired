import pool from './db.js';
import fs from 'fs';
import { compileLatexToPdf } from './utils/latexCompiler.js';

const [rows] = await pool.query('SELECT rewrite_latex FROM ai_feedback WHERE resume_versions_id = 29');
let latex = rows[0]?.rewrite_latex || '';

console.log('Before sanitization:');
// Count unescaped %
const unescapedPercents = (latex.match(/(?<!\\)%/g) || []).length;
console.log('  Unescaped % count:', unescapedPercents);

// Apply the same sanitization as the controller
latex = latex.replace(/(?<!\\)%/g, '\\%');
latex = latex.replace(/(?<!\\)#(?!\d)/g, '\\#');
latex = latex.replace(
  /\\resumeSubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}(?!\s*\{)/g,
  '\\resumeSubheading{$1}{$2}{$3}{}'
);

console.log('After sanitization:');
const unescapedPercents2 = (latex.match(/(?<!\\)%/g) || []).length;
console.log('  Unescaped % count:', unescapedPercents2);

// Write sanitized latex for inspection
fs.writeFileSync('uploads/rewrites/sanitized_29.tex', latex, 'utf-8');
console.log('  Sanitized LaTeX written to uploads/rewrites/sanitized_29.tex');

// Try compiling
try {
  const pdf = await compileLatexToPdf(latex);
  console.log('✓ Compilation succeeded! PDF size:', pdf.length);
  fs.writeFileSync('uploads/rewrites/test_29.pdf', pdf);
  console.log('  PDF written to uploads/rewrites/test_29.pdf');
} catch (err) {
  const jsonStart = err.message.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const errObj = JSON.parse(err.message.substring(jsonStart));
      const log = errObj.log_files?.['__main_document__.log'] || '';
      const logLines = log.split('\\n');
      const errorLines = logLines.filter(l => l.startsWith('!') || l.includes('Runaway'));
      console.log('\\n=== LATEX ERRORS ===');
      errorLines.forEach(l => console.log(l));
    } catch(e) {
      console.log('Parse error:', err.message.substring(0, 500));
    }
  }
}

await pool.end();
