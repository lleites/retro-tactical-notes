"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  addTagToNote,
  applyMarkup,
  commitHistory,
  createHistory,
  deleteNote,
  filterNotes,
  parseNotesPayload,
  redoHistory,
  removeTagFromNote,
  serializeNotes,
  undoHistory,
  updateNote,
} from "@/lib/notes.mjs";
import { LLM_MODEL, requestCompletion } from "@/lib/llmClient.mjs";
import { parseMarkdown, toggleMarkdownTask } from "@/lib/markdown.mjs";

type Folder = "Field Notes" | "Projects" | "Personal" | "Ideas" | "Archive";
type ActiveFolder = Exclude<Folder, "Archive">;
type NoteFilter = "All" | "Favorites" | "Archive" | `tag:${string}`;
type Theme = "olive" | "midnight" | "paper";
type Density = "compact" | "comfortable";
type Note = { id: string; title: string; content: string; tags: string[]; folder: Folder; archivedFrom?: ActiveFolder; color: string; starred: boolean; createdAt: string; updatedAt: string };
type Preferences = { theme: Theme; density: Density; animations: boolean; sounds: boolean };
type NoteHistory = { past: Note[][]; present: Note[]; future: Note[][] };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type ChatMode = "ask" | "rewrite";
type EditorMode = "edit" | "preview";
type MarkdownBlock = { type: string; level?: number; text?: string; language?: string; items?: { text: string; checked?: boolean; lineIndex?: number }[]; headers?: string[]; alignments?: ("left" | "center" | "right")[]; rows?: string[][] };

const NOTES_KEY = "retro-notes:v1";
const PREFS_KEY = "retro-notes:preferences:v1";
const noteColors = ["#d77834", "#d6b43c", "#6e9f70", "#5d8fa7", "#a96d7d"];
const defaultPreferences: Preferences = { theme: "olive", density: "comfortable", animations: true, sounds: false };
const seedNotes: Note[] = [
  { id: "welcome", title: "Welcome to Retro Tactical Notes", content: "Your notes are stored only in this browser.\n\n## Quick start\n\n- Create a note with the orange button\n- Use tags to organize your work\n- Press Ctrl/⌘ + K to search\n- Changes save automatically\n\nNo account. No sync. No tracking.", tags: ["welcome", "local-first"], folder: "Field Notes", color: "#d77834", starred: true, createdAt: "2026-08-17T17:30:00.000Z", updatedAt: "2026-08-17T17:30:00.000Z" },
  { id: "launch-checklist", title: "Launch checklist", content: "## Before release\n\n- [x] Define the core workflow\n- [x] Keep storage local\n- [ ] Test on mobile\n- [ ] Share with the team", tags: ["project", "checklist"], folder: "Projects", color: "#d6b43c", starred: false, createdAt: "2026-08-16T09:15:00.000Z", updatedAt: "2026-08-17T14:08:00.000Z" },
  { id: "weekend-ideas", title: "Weekend ideas", content: "A short list for the next free Saturday:\n\n- Morning market\n- Lakeside walk\n- Find a small record shop\n- Cook something new", tags: ["personal", "weekend"], folder: "Personal", color: "#6e9f70", starred: false, createdAt: "2026-08-14T18:45:00.000Z", updatedAt: "2026-08-16T20:12:00.000Z" },
  { id: "offline-thinking", title: "Offline-first thoughts", content: "A focused tool should feel instant, trustworthy, and quiet. Local browser storage is enough for the first useful version.", tags: ["idea", "product"], folder: "Ideas", color: "#5d8fa7", starred: true, createdAt: "2026-08-13T11:20:00.000Z", updatedAt: "2026-08-15T08:42:00.000Z" },
];

function makeId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `note-${Date.now()}` }
function formatUpdated(iso: string) { return new Intl.DateTimeFormat("en-GB", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(iso)) }
function cleanRewrite(value: string) { return value.replace(/^```(?:markdown|md|text)?\s*/i, "").replace(/\s*```$/, "").trim() }
function renderInline(value: string): ReactNode[] {
  const tokenPattern = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*|_[^_]+_)/g;
  return value.split(tokenPattern).filter(Boolean).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/); if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export default function Home() {
  const [history, setHistory] = useState<NoteHistory>(() => createHistory(seedNotes) as NoteHistory);
  const notes = history.present;
  const [selectedId, setSelectedId] = useState(seedNotes[0].id);
  const [filter, setFilter] = useState<NoteFilter>("All");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"notes" | "settings">("notes");
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState("LOCAL / READY");
  const [tagDraft, setTagDraft] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatByNote, setChatByNote] = useState<Record<string, ChatMessage[]>>({});
  const [qaMobile, setQaMobile] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes }, [notes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setQaMobile(new URLSearchParams(window.location.search).get("qa") === "mobile");
        const storedNotes = localStorage.getItem(NOTES_KEY); const storedPrefs = localStorage.getItem(PREFS_KEY);
        if (storedNotes) { const parsed = parseNotesPayload(storedNotes) as Note[]; setHistory(createHistory(parsed) as NoteHistory); setSelectedId(parsed[0]?.id ?? "") }
        if (storedPrefs) setPreferences({ ...defaultPreferences, ...JSON.parse(storedPrefs) });
      } catch { setSaveState("LOCAL / RECOVERED") } finally { setHydrated(true) }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); setSaveState("LOCAL / SAVED") }, 350);
    return () => window.clearTimeout(timer);
  }, [notes, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)) }, [preferences, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    const flush = () => localStorage.setItem(NOTES_KEY, JSON.stringify(notesRef.current));
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flush() };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onVisibilityChange) };
  }, [hydrated]);

  const filteredNotes = useMemo(() => {
    return filterNotes(notes, filter, search) as Note[];
  }, [filter, notes, search]);
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    notes.filter((note) => note.folder !== "Archive").forEach((note) => note.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag));
  }, [notes]);
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;
  const filterLabel = filter.startsWith("tag:") ? `#${filter.slice(4)}` : filter;
  const chatMessages = selectedNote ? chatByNote[selectedNote.id] ?? [] : [];
  const wordCount = selectedNote?.content.trim() ? selectedNote.content.trim().split(/\s+/).length : 0;

  function setNotes(updater: Note[] | ((current: Note[]) => Note[])) {
    setSaveState("LOCAL / SAVING…");
    setHistory((current) => {
      const next = typeof updater === "function" ? updater(current.present) : updater;
      return commitHistory(current, next) as NoteHistory;
    });
  }
  function updateSelected(patch: Partial<Note>) { if (!selectedNote) return; setNotes((current) => updateNote(current, selectedNote.id, patch, new Date().toISOString()) as Note[]) }
  function selectFilter(nextFilter: NoteFilter) { setFilter(nextFilter); setSelectedId((filterNotes(notes, nextFilter, search) as Note[])[0]?.id ?? "") }
  function createNote() {
    const now = new Date().toISOString();
    const note: Note = { id: makeId(), title: "Untitled transmission", content: "", tags: [], folder: "Field Notes", color: noteColors[0], starred: false, createdAt: now, updatedAt: now };
    setNotes((current) => [note, ...current]); setSelectedId(note.id); setFilter("All"); setView("notes"); window.setTimeout(() => editorRef.current?.focus(), 60);
  }
  function archiveSelected() { if (!selectedNote || selectedNote.folder === "Archive") return; const nextId = filteredNotes.find((note) => note.id !== selectedNote.id)?.id ?? ""; updateSelected({ folder: "Archive", archivedFrom: selectedNote.folder }); setSelectedId(nextId) }
  function restoreSelected() { if (!selectedNote || selectedNote.folder !== "Archive") return; updateSelected({ folder: selectedNote.archivedFrom ?? "Field Notes", archivedFrom: undefined }); setFilter("All") }
  function deleteSelected() { if (!selectedNote || selectedNote.folder !== "Archive" || !window.confirm(`Permanently delete “${selectedNote.title}”?`)) return; const remaining = deleteNote(notes, selectedNote.id) as Note[]; setNotes(remaining); setSelectedId(remaining.find((note) => note.folder === "Archive")?.id ?? "") }
  function insertMarkup(prefix: string, suffix = "") { if (!selectedNote || !editorRef.current) return; const textarea = editorRef.current; const result = applyMarkup(selectedNote.content, textarea.selectionStart, textarea.selectionEnd, prefix, suffix); updateSelected({ content: result.content }); window.setTimeout(() => { textarea.focus(); textarea.setSelectionRange(result.selectionStart, result.selectionEnd) }) }
  function addTag(event: KeyboardEvent<HTMLInputElement>) { if (event.key !== "Enter" || !selectedNote) return; event.preventDefault(); setNotes((current) => addTagToNote(current, selectedNote.id, tagDraft, new Date().toISOString()) as Note[]); setTagDraft("") }
  function exportNotes() { const blob = new Blob([serializeNotes(notes, new Date().toISOString())], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `retro-tactical-notes-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url) }
  function importNotes(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = parseNotesPayload(String(reader.result)) as Note[]; setNotes(imported); setSelectedId(imported[0]?.id ?? ""); setSaveState("LOCAL / IMPORTED") } catch { window.alert("That file is not a valid Retro Tactical Notes backup.") } }; reader.readAsText(file); event.target.value = "" }
  function clearAll() { if (!window.confirm("Erase every note stored in this browser? This cannot be undone.")) return; setNotes([]); setSelectedId(""); localStorage.removeItem(NOTES_KEY) }
  function saveNow() { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); setSaveState("LOCAL / SAVED") }
  function undo() { if (!history.past.length) return; setSaveState("LOCAL / SAVING…"); setHistory((current) => undoHistory(current) as NoteHistory) }
  function redo() { if (!history.future.length) return; setSaveState("LOCAL / SAVING…"); setHistory((current) => redoHistory(current) as NoteHistory) }
  function toggleTask(lineIndex: number, checked: boolean) { if (selectedNote) updateSelected({ content: toggleMarkdownTask(selectedNote.content, lineIndex, checked) }) }
  function appendChat(noteId: string, message: ChatMessage) { setChatByNote((current) => ({ ...current, [noteId]: [...(current[noteId] ?? []), message] })) }
  async function sendChat(mode: ChatMode) {
    const target = selectedNote; const instruction = chatDraft.trim();
    if (!target || !instruction || chatLoading) return;
    const priorMessages = chatByNote[target.id] ?? [];
    const userMessage: ChatMessage = { id: makeId(), role: "user", content: instruction };
    appendChat(target.id, userMessage); setChatDraft(""); setChatError(""); setChatLoading(true);
    const noteContext = `Title: ${target.title || "Untitled note"}\n\nNote content:\n${target.content || "(empty note)"}`;
    const system = mode === "rewrite"
      ? `You rewrite a single Markdown note. Apply the user's requested changes while preserving useful information that was not targeted. Return only the complete replacement note content, without commentary or code fences.\n\n${noteContext}`
      : `You are a concise assistant discussing one note. Use the supplied note as the primary context. If the answer is not in the note, say so. Do not claim to edit the note; the interface has a separate rewrite action.\n\n${noteContext}`;
    const conversation = priorMessages.slice(-6).map(({ role, content }) => ({ role, content }));
    try {
      const response = await requestCompletion([{ role: "system", content: system }, ...conversation, { role: "user", content: instruction }]);
      if (mode === "rewrite") {
        const rewritten = cleanRewrite(response);
        setNotes((current) => updateNote(current, target.id, { content: rewritten }, new Date().toISOString()) as Note[]);
        appendChat(target.id, { id: makeId(), role: "assistant", content: "Rewrite applied to the note. You can use Undo to restore the previous version." });
      } else appendChat(target.id, { id: makeId(), role: "assistant", content: response });
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "The AI request failed. Try again.");
    } finally { setChatLoading(false) }
  }
  function submitChat(event: FormEvent) { event.preventDefault(); void sendChat("ask") }

  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus() }
      if (event.key.toLowerCase() === "n") { event.preventDefault(); createNote() }
      if (event.key.toLowerCase() === "s") { event.preventDefault(); if (hydrated) saveNow() }
      if (event.key.toLowerCase() === "z" && event.shiftKey) { event.preventDefault(); redo() }
      else if (event.key.toLowerCase() === "z") { event.preventDefault(); undo() }
      if (event.key.toLowerCase() === "y") { event.preventDefault(); redo() }
    };
    window.addEventListener("keydown", onShortcut); return () => window.removeEventListener("keydown", onShortcut);
  });

  return (
    <div className={qaMobile ? "app-shell qa-shell" : "app-shell"}>
    <main className={`retro-app density-${preferences.density} ${preferences.animations ? "with-motion" : ""}`} data-theme={preferences.theme}>
      <header className="topbar riveted">
        <button className="brand" onClick={() => setView("notes")} aria-label="Open notes"><span className="brand-mark" aria-hidden="true">RT</span><span><strong>RETRO TACTICAL NOTES</strong><small>LOCAL FIELD LOG / MK-II</small></span></button>
        <div className="topbar-actions"><span className="storage-status"><i /> {saveState}</span><button className={`icon-button ${view === "settings" ? "active" : ""}`} onClick={() => setView(view === "settings" ? "notes" : "settings")} aria-label="Settings">⚙</button></div>
      </header>

      {view === "settings" ? <SettingsPanel preferences={preferences} setPreferences={setPreferences} noteCount={notes.length} exportNotes={exportNotes} importNotes={() => importRef.current?.click()} clearAll={clearAll} close={() => setView("notes")} /> : (
        <div className="workspace">
          <aside className="folder-rail riveted" aria-label="Note folders">
            <div className="section-label">NOTES</div>
            <button className={`folder-button ${filter === "All" ? "active" : ""}`} onClick={() => selectFilter("All")}><span className="folder-glyph">ALL</span><span>All notes</span><b>{notes.filter((note) => note.folder !== "Archive").length}</b></button>
            <button className={`folder-button ${filter === "Favorites" ? "active" : ""}`} onClick={() => selectFilter("Favorites")}><span className="folder-glyph star">★</span><span>Favorites</span><b>{notes.filter((note) => note.starred && note.folder !== "Archive").length}</b></button>
            <button className={`folder-button ${filter === "Archive" ? "active" : ""}`} onClick={() => selectFilter("Archive")}><span className="folder-glyph">ARC</span><span>Archive</span><b>{notes.filter((note) => note.folder === "Archive").length}</b></button>
            <div className="folder-divider" />
            <div className="section-label tag-section-label">TAGS</div>
            <div className="tag-navigation">{allTags.map(({ tag, count }) => <button key={tag} className={filter === `tag:${tag}` ? "active" : ""} onClick={() => selectFilter(`tag:${tag}`)}><span>#{tag}</span><b>{count}</b></button>)}{!allTags.length && <small>NO TAGS YET</small>}</div>
            <div className="local-card"><span className="local-card-icon">▣</span><strong>DEVICE STORAGE</strong><p>Notes stay here unless sent to AI.</p></div>
          </aside>

          <section className="note-browser">
            <div className="list-controls"><label className="search-box"><span aria-hidden="true">⌕</span><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SEARCH ARCHIVE…" aria-label="Search notes" /><kbd>⌘ K</kbd></label><button className="primary-button hazard" onClick={createNote}><span>＋</span> NEW NOTE</button></div>
            <div className="list-heading"><div><span className="eyebrow">CURRENT FILTER</span><h1>{filterLabel}</h1></div><span className="result-count">{filteredNotes.length.toString().padStart(2, "0")} RECORDS</span></div>
            <div className="note-list" role="list">
              {filteredNotes.map((note) => <button key={note.id} className={`note-row ${note.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(note.id)} role="listitem"><span className="note-swatch" style={{ background: note.color }} aria-hidden="true" /><span className="note-copy"><span className="note-title-line"><strong>{note.title || "Untitled note"}</strong><span>{note.starred ? "★" : "☆"}</span></span><span className="note-preview">{note.content.replace(/[#*\-[\]]/g, " ").trim() || "Empty field note"}</span><span className="note-meta">{note.tags.slice(0, 3).map((tag) => <i key={tag}>#{tag}</i>)}</span></span><time dateTime={note.updatedAt}>{formatUpdated(note.updatedAt)}</time></button>)}
              {!filteredNotes.length && <div className="empty-list"><span>∅</span><strong>NO RECORDS FOUND</strong><p>Adjust the filter or start a new note.</p></div>}
            </div>
          </section>

          <section className="editor-panel">
            {selectedNote ? <>
              <div className="editor-topline"><div className="editor-file-status"><strong>{selectedNote.title || "UNTITLED TRANSMISSION"}</strong><span>{selectedNote.folder === "Archive" ? "ARCHIVED" : saveState} · {formatUpdated(selectedNote.updatedAt)}</span></div><div className="editor-actions"><button className="chat-button" onClick={() => { setChatOpen(true); setChatError("") }} aria-label="Chat with note">✦ CHAT</button><button className={`star-button ${selectedNote.starred ? "active" : ""}`} onClick={() => updateSelected({ starred: !selectedNote.starred })} aria-label={selectedNote.starred ? "Remove favorite" : "Add favorite"}>★</button>{selectedNote.folder === "Archive" ? <><button className="restore-button" onClick={restoreSelected}>↥ RESTORE</button><button className="danger-button" onClick={deleteSelected}>DELETE</button></> : <button className="archive-button" onClick={archiveSelected}>▣ ARCHIVE</button>}</div></div>
              {editorMode === "edit" && <div className="editor-toolbar" aria-label="Formatting shortcuts"><button className="history-tool" onClick={undo} disabled={!history.past.length} aria-label="Undo">↶</button><button className="history-tool" onClick={redo} disabled={!history.future.length} aria-label="Redo">↷</button><span className="tool-separator" /><button onClick={() => insertMarkup("**", "**")} aria-label="Bold"><b>B</b></button><button onClick={() => insertMarkup("_", "_")} aria-label="Italic"><i>I</i></button><button onClick={() => insertMarkup("<u>", "</u>")} aria-label="Underline"><u>U</u></button><button onClick={() => insertMarkup("## ")} aria-label="Heading">H2</button><button onClick={() => insertMarkup("- ")} aria-label="Bulleted list">• LIST</button><button onClick={() => insertMarkup("1. ")} aria-label="Numbered list">1. LIST</button><button onClick={() => insertMarkup("- [ ] ")} aria-label="Checklist">☐ TASK</button><button onClick={() => insertMarkup("`", "`")} aria-label="Code">&lt;/&gt;</button><button onClick={() => insertMarkup("[", "](url)")} aria-label="Link">↗ LINK</button><button onClick={() => insertMarkup("| Column | Value |\n| --- | --- |\n| Item | Value |\n")} aria-label="Table">▦ TABLE</button><span>MARKDOWN FIELD EDITOR</span></div>}
              <article className="paper-sheet"><div className="paper-stamp">LOCAL FILE · {selectedNote.id.slice(0, 6).toUpperCase()}</div><input className="title-input" value={selectedNote.title} onChange={(event) => updateSelected({ title: event.target.value })} aria-label="Note title" placeholder="Untitled transmission" /><div className="mode-switch" aria-label="Editor view"><button className={editorMode === "edit" ? "active" : ""} onClick={() => setEditorMode("edit")}>EDIT</button><button className={editorMode === "preview" ? "active" : ""} onClick={() => setEditorMode("preview")}>PREVIEW</button></div>{editorMode === "edit" ? <textarea ref={editorRef} value={selectedNote.content} onChange={(event) => updateSelected({ content: event.target.value })} placeholder="Begin field note…" aria-label="Note content" spellCheck="true" /> : <MarkdownPreview content={selectedNote.content} onToggleTask={toggleTask} />}<div className="tag-row">{selectedNote.tags.map((tag) => <button key={tag} onClick={() => setNotes((current) => removeTagFromNote(current, selectedNote.id, tag, new Date().toISOString()) as Note[])} title="Remove tag">#{tag} ×</button>)}<input list="known-tags" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={addTag} placeholder="+ tag" aria-label="Add tag" /><datalist id="known-tags">{allTags.filter(({ tag }) => !selectedNote.tags.includes(tag)).map(({ tag }) => <option key={tag} value={tag} />)}</datalist></div></article>
              <footer className="editor-footer"><div className="palette" aria-label="Note color"><span>MARKER</span>{noteColors.map((color) => <button key={color} style={{ background: color }} className={selectedNote.color === color ? "active" : ""} onClick={() => updateSelected({ color })} aria-label={`Use color ${color}`} />)}</div><div className="document-stats"><span>{wordCount} WORDS</span><span>{selectedNote.content.length} CHARACTERS</span><span>UPDATED {formatUpdated(selectedNote.updatedAt)}</span></div></footer>
              {chatOpen && <aside className="chat-panel" role="dialog" aria-label={`Chat with ${selectedNote.title || "note"}`}>
                <header><div><span className="eyebrow">NOTE LINK ACTIVE</span><strong>TACTICAL AI</strong><small>{LLM_MODEL} · ANONYMOUS</small></div><button onClick={() => setChatOpen(false)} aria-label="Close note chat">×</button></header>
                <div className="chat-context"><span>IN CONTEXT</span><strong>{selectedNote.title || "Untitled note"}</strong><small>The current title and content are sent to OVHcloud only when you submit.</small></div>
                <div className="chat-log" aria-live="polite">
                  {!chatMessages.length && <div className="chat-empty"><span>✦</span><strong>ASK ABOUT THIS NOTE</strong><p>Discuss its contents, or enter an instruction and choose Rewrite note to replace the body.</p></div>}
                  {chatMessages.map((message) => <div key={message.id} className={`chat-message ${message.role}`}><span>{message.role === "user" ? "YOU" : "AI"}</span><p>{message.content}</p></div>)}
                  {chatLoading && <div className="chat-loading"><i /><span>CONTACTING OVH ENDPOINT…</span></div>}
                </div>
                {chatError && <div className="chat-error" role="alert">{chatError}</div>}
                <form onSubmit={submitChat}><textarea value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Ask or describe the rewrite…" aria-label="Message about note" disabled={chatLoading} /><div><small>Anonymous limit: 2 requests/minute per IP and model.</small><span><button type="submit" className="secondary-button" disabled={!chatDraft.trim() || chatLoading}>ASK</button><button type="button" className="primary-button" onClick={() => void sendChat("rewrite")} disabled={!chatDraft.trim() || chatLoading}>↻ REWRITE NOTE</button></span></div></form>
              </aside>}
            </> : <div className="empty-editor"><div className="empty-badge">RT</div><h2>NO FILE SELECTED</h2><p>Create a new note or choose a record from the archive.</p><button className="primary-button" onClick={createNote}>＋ NEW NOTE</button></div>}
          </section>
        </div>
      )}
      <input ref={importRef} className="visually-hidden" type="file" accept="application/json" onChange={importNotes} />
    </main>
    </div>
  );
}

function MarkdownPreview({ content, onToggleTask }: { content: string; onToggleTask: (lineIndex: number, checked: boolean) => void }) {
  const blocks = parseMarkdown(content) as MarkdownBlock[];
  if (!blocks.length) return <div className="markdown-preview empty">Nothing to preview yet.</div>;
  return <div className="markdown-preview" aria-label="Rendered note preview">{blocks.map((block, blockIndex) => {
    if (block.type === "heading") { const Heading = `h${block.level}` as keyof React.JSX.IntrinsicElements; return <Heading key={blockIndex}>{renderInline(block.text ?? "")}</Heading> }
    if (block.type === "paragraph") return <p key={blockIndex}>{renderInline(block.text ?? "")}</p>;
    if (block.type === "blockquote") return <blockquote key={blockIndex}>{renderInline(block.text ?? "")}</blockquote>;
    if (block.type === "rule") return <hr key={blockIndex} />;
    if (block.type === "code") return <pre key={blockIndex} data-language={block.language}><code>{block.text}</code></pre>;
    if (block.type === "table") return <div className="table-scroll" key={blockIndex}><table><thead><tr>{block.headers?.map((header, cellIndex) => <th key={cellIndex} style={{ textAlign: block.alignments?.[cellIndex] }}>{renderInline(header)}</th>)}</tr></thead><tbody>{block.rows?.map((row, rowIndex) => <tr key={rowIndex}>{block.headers?.map((_, cellIndex) => <td key={cellIndex} style={{ textAlign: block.alignments?.[cellIndex] }}>{renderInline(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody></table></div>;
    if (block.type === "task-list") return <ul key={blockIndex} className="task-list">{block.items?.map((item) => <li key={item.lineIndex}><label><input type="checkbox" checked={item.checked} onChange={(event) => onToggleTask(item.lineIndex ?? 0, event.target.checked)} /><span>{renderInline(item.text)}</span></label></li>)}</ul>;
    if (block.type === "ordered-list") return <ol key={blockIndex}>{block.items?.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item.text)}</li>)}</ol>;
    if (block.type === "unordered-list") return <ul key={blockIndex}>{block.items?.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item.text)}</li>)}</ul>;
    return null;
  })}</div>;
}

function SettingsPanel({ preferences, setPreferences, noteCount, exportNotes, importNotes, clearAll, close }: { preferences: Preferences; setPreferences: (preferences: Preferences) => void; noteCount: number; exportNotes: () => void; importNotes: () => void; clearAll: () => void; close: () => void }) {
  return <section className="settings-wrap">
    <div className="settings-header"><div><span className="eyebrow">SYSTEM CONTROL</span><h1>Settings</h1></div><button className="secondary-button" onClick={close}>← BACK TO NOTES</button></div>
    <div className="settings-grid"><aside className="settings-nav riveted"><strong>CONFIGURATION</strong><span className="active">01 / Appearance</span><span>02 / Editor</span><span>03 / Local backup</span><span>04 / About</span></aside>
      <div className="settings-content">
        <section className="setting-card"><div><span className="eyebrow">DISPLAY PROFILE</span><h2>Interface theme</h2><p>Choose the field-kit finish that suits your workspace.</p></div><div className="theme-options">{(["olive", "midnight", "paper"] as Theme[]).map((theme) => <button key={theme} className={`theme-card theme-${theme} ${preferences.theme === theme ? "active" : ""}`} onClick={() => setPreferences({ ...preferences, theme })}><span><i /><i /><i /></span><strong>{theme === "olive" ? "BUNKER OLIVE" : theme === "midnight" ? "MIDNIGHT STEEL" : "FIELD PAPER"}</strong><small>{preferences.theme === theme ? "● ACTIVE" : "SELECT"}</small></button>)}</div></section>
        <section className="setting-card two-column"><div><span className="eyebrow">PIXEL DENSITY</span><h2>Spacing</h2><p>Control how much information fits on screen.</p></div><div className="segmented"><button className={preferences.density === "compact" ? "active" : ""} onClick={() => setPreferences({ ...preferences, density: "compact" })}>COMPACT</button><button className={preferences.density === "comfortable" ? "active" : ""} onClick={() => setPreferences({ ...preferences, density: "comfortable" })}>COMFORTABLE</button></div></section>
        <section className="setting-card two-column"><div><span className="eyebrow">INTERFACE EFFECTS</span><h2>Motion & sound</h2><p>Keep the desk quiet or add a little arcade response.</p></div><div className="toggle-stack"><label><span><strong>Animations</strong><small>Panel and selection movement</small></span><input type="checkbox" checked={preferences.animations} onChange={(event) => setPreferences({ ...preferences, animations: event.target.checked })} /></label><label><span><strong>Interface sounds</strong><small>Reserved for a future update</small></span><input type="checkbox" checked={preferences.sounds} onChange={(event) => setPreferences({ ...preferences, sounds: event.target.checked })} /></label></div></section>
        <section className="setting-card backup-card"><div><span className="eyebrow">LOCAL STORAGE ONLY</span><h2>Backup & restore</h2><p>{noteCount} notes are stored on this device. Export a JSON file before clearing browser data or moving devices.</p></div><div className="backup-actions"><button className="primary-button" onClick={exportNotes}>↓ EXPORT JSON</button><button className="secondary-button" onClick={importNotes}>↑ IMPORT JSON</button><button className="danger-button" onClick={clearAll}>ERASE ALL DATA</button></div></section>
        <div className="about-strip"><span className="brand-mark">RT</span><div><strong>RETRO TACTICAL NOTES · MK-II</strong><p>Notes stay local. Optional AI sends only the active note and chat messages when requested.</p></div><small>BUILD 1.4.0</small></div>
      </div>
    </div>
  </section>;
}
