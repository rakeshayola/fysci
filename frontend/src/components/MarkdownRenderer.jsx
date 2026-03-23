import { useMemo } from "react";

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
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return out;
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|");
}

function isTableSeparator(line) {
  const trimmed = line.trim();
  return /^\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|$/.test(trimmed);
}

function parseTableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(tableLines) {
  if (tableLines.length < 2) {
    return `<p>${tableLines.map((l) => renderInline(l)).join("<br/>")}</p>`;
  }

  const headerCells = parseTableCells(tableLines[0]);

  // Find separator row (could be row 1 or missing)
  let separatorIdx = -1;
  for (let j = 1; j < tableLines.length && j <= 2; j++) {
    if (isTableSeparator(tableLines[j])) {
      separatorIdx = j;
      break;
    }
  }

  // Parse alignment from separator
  const alignments = [];
  if (separatorIdx >= 0) {
    const sepCells = parseTableCells(tableLines[separatorIdx]);
    for (const cell of sepCells) {
      const left = cell.startsWith(":");
      const right = cell.endsWith(":");
      if (left && right) alignments.push("center");
      else if (right) alignments.push("right");
      else alignments.push("left");
    }
  }

  const dataStartIdx = separatorIdx >= 0 ? separatorIdx + 1 : 1;
  const dataRows = tableLines.slice(dataStartIdx);

  let html = '<div class="md-table-wrap"><table class="md-table">';

  // Header
  html += "<thead><tr>";
  headerCells.forEach((cell, ci) => {
    const align = alignments[ci] ? ` style="text-align:${alignments[ci]}"` : "";
    html += `<th${align}>${renderInline(cell)}</th>`;
  });
  html += "</tr></thead>";

  // Body
  if (dataRows.length > 0) {
    html += "<tbody>";
    for (const row of dataRows) {
      const cells = parseTableCells(row);
      html += "<tr>";
      cells.forEach((cell, ci) => {
        const align = alignments[ci] ? ` style="text-align:${alignments[ci]}"` : "";
        html += `<td${align}>${renderInline(cell)}</td>`;
      });
      html += "</tr>";
    }
    html += "</tbody>";
  }

  html += "</table></div>";
  return html;
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
      i++;
      result.push(
        `<pre class="md-code-block"><code${lang ? ` class="language-${lang}"` : ""}>${codeLines.join("\n")}</code></pre>`
      );
      continue;
    }

    // Table
    if (isTableRow(line)) {
      const tableLines = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      result.push(renderTable(tableLines));
      continue;
    }

    // Horizontal rule (must check AFTER table since separator rows contain dashes)
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

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      result.push(`<blockquote>${renderInline(quoteLines.join(" "))}</blockquote>`);
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

    // Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !isTableRow(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^(\s*[-*_]){3,}\s*$/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
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
