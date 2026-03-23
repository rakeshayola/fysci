import { useMemo } from "react";

/**
 * Lightweight Markdown renderer — handles headings, bold, italic, code blocks,
 * inline code, lists, horizontal rules, and paragraphs.
 */
export default function MarkdownRenderer({ content }) {
  const html = useMemo(() => renderMarkdown(content || ""), [content]);
  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text) {
  let out = escapeHtml(text);
  // inline code
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // bold + italic
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // bold
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // italic
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // links
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return out;
}

function renderMarkdown(src) {
  const lines = src.split("\n");
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      result.push(
        `<pre class="md-code-block"><code${lang ? ` class="language-${lang}"` : ""}>${codeLines.join("\n")}</code></pre>`
      );
      continue;
    }

    // Horizontal rule
    if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
      result.push("<hr/>");
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      result.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(
          `<li>${renderInline(lines[i].replace(/^\s*[-*+]\s+/, ""))}</li>`
        );
        i++;
      }
      result.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(
          `<li>${renderInline(lines[i].replace(/^\s*\d+[.)]\s+/, ""))}</li>`
        );
        i++;
      }
      result.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^(\s*[-*_]){3,}\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      result.push(`<p>${renderInline(paraLines.join(" "))}</p>`);
    }
  }

  return result.join("\n");
}
