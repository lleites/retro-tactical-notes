export const HISTORY_LIMIT = 100;

export function createHistory(present) {
  return { past: [], present, future: [] };
}

export function commitHistory(history, next, limit = HISTORY_LIMIT) {
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-limit),
    present: next,
    future: [],
  };
}

export function undoHistory(history) {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1),
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history) {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: history.future[0],
    future: history.future.slice(1),
  };
}

export function updateNote(notes, id, patch, now) {
  let found = false;
  const next = notes.map((note) => {
    if (note.id !== id) return note;
    found = true;
    return { ...note, ...patch, updatedAt: now };
  });
  return found ? next : notes;
}

export function deleteNote(notes, id) {
  const next = notes.filter((note) => note.id !== id);
  return next.length === notes.length ? notes : next;
}

export function filterNotes(notes, filter, search) {
  const needle = search.trim().toLowerCase();
  return notes
    .filter((note) => {
      if (filter === "Archive") return note.folder === "Archive";
      if (note.folder === "Archive") return false;
      if (filter === "Favorites") return note.starred;
      if (typeof filter === "string" && filter.startsWith("tag:")) return note.tags.includes(filter.slice(4));
      return true;
    })
    .filter((note) => !needle || [note.title, note.content, note.folder, note.tags.join(" ")].join(" ").toLowerCase().includes(needle))
    .toSorted((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export function addTagToNote(notes, id, rawTag, now) {
  const tag = rawTag.trim().replace(/^#/, "");
  const note = notes.find((item) => item.id === id);
  if (!note || !tag || note.tags.includes(tag)) return notes;
  return updateNote(notes, id, { tags: [...note.tags, tag] }, now);
}

export function removeTagFromNote(notes, id, tag, now) {
  const note = notes.find((item) => item.id === id);
  if (!note || !note.tags.includes(tag)) return notes;
  return updateNote(notes, id, { tags: note.tags.filter((item) => item !== tag) }, now);
}

export function applyMarkup(content, start, end, prefix, suffix = "", placeholder = "") {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  const selected = content.slice(safeStart, safeEnd) || placeholder;
  return {
    content: `${content.slice(0, safeStart)}${prefix}${selected}${suffix}${content.slice(safeEnd)}`,
    selectionStart: safeStart + prefix.length,
    selectionEnd: safeStart + prefix.length + selected.length,
  };
}

export function applyLinePrefix(content, start, end, prefix, placeholder = "List item") {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  const lineStart = content.lastIndexOf("\n", Math.max(0, safeStart - 1)) + 1;
  const selectionTail = safeEnd > safeStart && content[safeEnd - 1] === "\n" ? safeEnd - 1 : safeEnd;
  const nextBreak = content.indexOf("\n", selectionTail);
  const lineEnd = nextBreak === -1 ? content.length : nextBreak;
  const source = content.slice(lineStart, lineEnd) || placeholder;
  const transformed = source.split("\n").map((line) => `${prefix}${line || placeholder}`).join("\n");
  return {
    content: `${content.slice(0, lineStart)}${transformed}${content.slice(lineEnd)}`,
    selectionStart: lineStart + prefix.length,
    selectionEnd: lineStart + transformed.length,
  };
}

export function insertMarkdownBlock(content, start, end, block) {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  const before = content.slice(0, safeStart);
  const after = content.slice(safeEnd);
  const leading = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const trailing = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
  const trimmedBlock = block.trim();
  const value = `${leading}${trimmedBlock}${trailing}`;
  return {
    content: `${before}${value}${after}`,
    selectionStart: safeStart + leading.length,
    selectionEnd: safeStart + leading.length + trimmedBlock.length,
  };
}

export function serializeNotes(notes, exportedAt) {
  return JSON.stringify({ version: 1, exportedAt, notes }, null, 2);
}

export function parseNotesPayload(value) {
  const payload = typeof value === "string" ? JSON.parse(value) : value;
  const notes = Array.isArray(payload) ? payload : payload?.notes;
  if (!Array.isArray(notes) || !notes.every(isValidNote)) throw new Error("Invalid Retro Tactical Notes backup");
  return notes.map((note) => ({ ...note, tags: [...note.tags] }));
}

export function isValidNote(note) {
  return Boolean(
    note &&
    typeof note.id === "string" &&
    typeof note.title === "string" &&
    typeof note.content === "string" &&
    Array.isArray(note.tags) && note.tags.every((tag) => typeof tag === "string") &&
    typeof note.folder === "string" &&
    typeof note.color === "string" &&
    typeof note.starred === "boolean" &&
    typeof note.createdAt === "string" &&
    typeof note.updatedAt === "string",
  );
}
