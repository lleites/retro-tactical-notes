const taskPattern = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const unorderedPattern = /^\s*[-*+]\s+(.*)$/;
const orderedPattern = /^\s*\d+[.)]\s+(.*)$/;

export function toggleMarkdownTask(content, lineIndex, checked) {
  const lines = content.split("\n");
  if (!taskPattern.test(lines[lineIndex] ?? "")) return content;
  lines[lineIndex] = lines[lineIndex].replace(/\[([ xX])\]/, checked ? "[x]" : "[ ]");
  return lines.join("\n");
}

export function parseMarkdown(content) {
  const lines = content.split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^```\s*([^\s]*)/);
    if (fence) {
      const code = []; const language = fence[1] || "text"; index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) { code.push(lines[index]); index += 1; }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language, text: code.join("\n") }); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { blocks.push({ type: "heading", level: heading[1].length, text: heading[2] }); index += 1; continue; }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ type: "rule" }); index += 1; continue; }
    const task = line.match(taskPattern);
    if (task) {
      const items = [];
      while (index < lines.length) { const match = lines[index].match(taskPattern); if (!match) break; items.push({ checked: match[1].toLowerCase() === "x", text: match[2], lineIndex: index }); index += 1; }
      blocks.push({ type: "task-list", items }); continue;
    }
    const ordered = line.match(orderedPattern);
    if (ordered) {
      const items = [];
      while (index < lines.length) { const match = lines[index].match(orderedPattern); if (!match) break; items.push({ text: match[1] }); index += 1; }
      blocks.push({ type: "ordered-list", items }); continue;
    }
    const unordered = line.match(unorderedPattern);
    if (unordered) {
      const items = [];
      while (index < lines.length && !taskPattern.test(lines[index])) { const match = lines[index].match(unorderedPattern); if (!match) break; items.push({ text: match[1] }); index += 1; }
      blocks.push({ type: "unordered-list", items }); continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const parts = [];
      while (index < lines.length) { const match = lines[index].match(/^>\s?(.*)$/); if (!match) break; parts.push(match[1]); index += 1; }
      blocks.push({ type: "blockquote", text: parts.join(" ") }); continue;
    }
    const parts = [line.trim()]; index += 1;
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s+|```|\s*[-*+]\s+(?:\[[ xX]\]\s+)?|\s*\d+[.)]\s+|>|\s*(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[index])) { parts.push(lines[index].trim()); index += 1; }
    blocks.push({ type: "paragraph", text: parts.join(" ") });
  }
  return blocks;
}
