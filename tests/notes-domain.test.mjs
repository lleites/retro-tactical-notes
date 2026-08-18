import assert from "node:assert/strict";
import test from "node:test";
import {
  HISTORY_LIMIT,
  addTagToNote,
  applyMarkup,
  commitHistory,
  createHistory,
  deleteNote,
  filterNotes,
  isValidNote,
  parseNotesPayload,
  redoHistory,
  removeTagFromNote,
  serializeNotes,
  undoHistory,
  updateNote,
} from "../lib/notes.mjs";
import { parseMarkdown, toggleMarkdownTask } from "../lib/markdown.mjs";

const note = (overrides = {}) => ({
  id: "n1", title: "Alpha plan", content: "First field report", tags: ["alpha"],
  folder: "Projects", color: "#d77834", starred: false,
  createdAt: "2026-08-17T10:00:00.000Z", updatedAt: "2026-08-17T10:00:00.000Z",
  ...overrides,
});

test("history starts with empty undo and redo stacks", () => {
  assert.deepEqual(createHistory([note()]), { past: [], present: [note()], future: [] });
});

test("committing, undoing, and redoing restores complete note snapshots", () => {
  const initial = createHistory([note()]);
  const editedNotes = updateNote(initial.present, "n1", { title: "Edited" }, "2026-08-17T11:00:00.000Z");
  const edited = commitHistory(initial, editedNotes);
  assert.equal(edited.present[0].title, "Edited");
  const undone = undoHistory(edited);
  assert.equal(undone.present[0].title, "Alpha plan");
  const redone = redoHistory(undone);
  assert.equal(redone.present[0].title, "Edited");
});

test("a new edit after undo clears redo history", () => {
  const first = commitHistory(createHistory([note()]), [note({ title: "First edit" })]);
  const undone = undoHistory(first);
  const branched = commitHistory(undone, [note({ title: "Different edit" })]);
  assert.equal(branched.future.length, 0);
  assert.strictEqual(redoHistory(branched), branched);
});

test("undo and redo are safe no-ops at stack boundaries", () => {
  const history = createHistory([note()]);
  assert.strictEqual(undoHistory(history), history);
  assert.strictEqual(redoHistory(history), history);
});

test("history retains only the configured number of snapshots", () => {
  let history = createHistory(0);
  for (let i = 1; i <= HISTORY_LIMIT + 8; i += 1) history = commitHistory(history, i);
  assert.equal(history.past.length, HISTORY_LIMIT);
  assert.equal(history.past[0], 8);
});

test("updateNote changes only the target and refreshes updatedAt", () => {
  const second = note({ id: "n2", title: "Second" });
  const notes = [note(), second];
  const result = updateNote(notes, "n1", { starred: true }, "2026-08-17T12:00:00.000Z");
  assert.equal(result[0].starred, true);
  assert.equal(result[0].updatedAt, "2026-08-17T12:00:00.000Z");
  assert.strictEqual(result[1], second);
  assert.strictEqual(updateNote(notes, "missing", {}, "now"), notes);
});

test("deleteNote removes only the requested note", () => {
  const notes = [note(), note({ id: "n2" })];
  assert.deepEqual(deleteNote(notes, "n1").map(({ id }) => id), ["n2"]);
  assert.strictEqual(deleteNote(notes, "missing"), notes);
});

test("filterNotes filters folders, favorites, title, content, and tags", () => {
  const notes = [
    note({ id: "old", updatedAt: "2026-08-17T09:00:00.000Z" }),
    note({ id: "new", title: "Weekend", content: "Lake trip", folder: "Personal", tags: ["travel"], starred: true, updatedAt: "2026-08-17T12:00:00.000Z" }),
  ];
  assert.deepEqual(filterNotes(notes, "All", "").map(({ id }) => id), ["new", "old"]);
  assert.deepEqual(filterNotes(notes, "Favorites", "").map(({ id }) => id), ["new"]);
  assert.deepEqual(filterNotes(notes, "Projects", "").map(({ id }) => id), ["old"]);
  assert.deepEqual(filterNotes(notes, "All", "lake").map(({ id }) => id), ["new"]);
  assert.deepEqual(filterNotes(notes, "All", "TRAVEL").map(({ id }) => id), ["new"]);
});

test("tag helpers normalize, deduplicate, add, and remove tags", () => {
  const notes = [note()];
  const added = addTagToNote(notes, "n1", " #roadmap ", "later");
  assert.deepEqual(added[0].tags, ["alpha", "roadmap"]);
  assert.strictEqual(addTagToNote(added, "n1", "roadmap", "later"), added);
  assert.strictEqual(addTagToNote(added, "n1", "   ", "later"), added);
  assert.deepEqual(removeTagFromNote(added, "n1", "alpha", "later")[0].tags, ["roadmap"]);
});

test("applyMarkup wraps selections and clamps invalid ranges", () => {
  assert.deepEqual(applyMarkup("hello world", 6, 11, "**", "**"), { content: "hello **world**", selectionStart: 8, selectionEnd: 13 });
  assert.deepEqual(applyMarkup("abc", -5, 99, "_", "_"), { content: "_abc_", selectionStart: 1, selectionEnd: 4 });
});

test("backup serialization round-trips valid notes", () => {
  const notes = [note()];
  const json = serializeNotes(notes, "2026-08-17T12:00:00.000Z");
  assert.deepEqual(parseNotesPayload(json), notes);
  assert.deepEqual(parseNotesPayload(notes), notes);
});

test("backup parser rejects malformed payloads and invalid note fields", () => {
  assert.throws(() => parseNotesPayload("{}"), /Invalid Retro Tactical Notes backup/);
  assert.throws(() => parseNotesPayload([{ ...note(), starred: "yes" }]), /Invalid Retro Tactical Notes backup/);
  assert.throws(() => parseNotesPayload("not json"), SyntaxError);
  assert.equal(isValidNote(note()), true);
  assert.equal(isValidNote({ ...note(), tags: [7] }), false);
});

test("markdown parser recognizes headings, task lists, ordered lists, quotes, and code", () => {
  const blocks = parseMarkdown("## Plan\n\n- [ ] Draft\n- [x] Ship\n\n1. First\n2. Second\n\n> Ready\n\n```js\nalert('test')\n```");
  assert.deepEqual(blocks.map(({ type }) => type), ["heading", "task-list", "ordered-list", "blockquote", "code"]);
  assert.deepEqual(blocks[1].items, [{ checked: false, text: "Draft", lineIndex: 2 }, { checked: true, text: "Ship", lineIndex: 3 }]);
  assert.equal(blocks[4].language, "js");
});

test("task toggling changes only a valid checkbox line", () => {
  const content = "Intro\n- [ ] Verify autosave\n- ordinary item";
  assert.equal(toggleMarkdownTask(content, 1, true), "Intro\n- [x] Verify autosave\n- ordinary item");
  assert.equal(toggleMarkdownTask(content, 2, true), content);
});
