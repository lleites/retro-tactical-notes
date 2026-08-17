"use client";

import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
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

type Folder = "Field Notes" | "Projects" | "Personal" | "Ideas" | "Archive";
type Theme = "olive" | "midnight" | "paper";
type Density = "compact" | "comfortable";
type Note = { id: string; title: string; content: string; tags: string[]; folder: Folder; color: string; starred: boolean; createdAt: string; updatedAt: string };
type Preferences = { theme: Theme; density: Density; animations: boolean; sounds: boolean };
type NoteHistory = { past: Note[][]; present: Note[]; future: Note[][] };

const NOTES_KEY = "retro-notes:v1";
const PREFS_KEY = "retro-notes:preferences:v1";
const folders: Folder[] = ["Field Notes", "Projects", "Personal", "Ideas", "Archive"];
const noteColors = ["#d77834", "#d6b43c", "#6e9f70", "#5d8fa7", "#a96d7d"];
const defaultPreferences: Preferences = { theme: "olive", density: "comfortable", animations: true, sounds: false };
const seedNotes: Note[] = [
  { id: "welcome", title: "Welcome to Retro Tactical Notes", content: "Your notes are stored only in this browser.\n\n## Quick start\n\n- Create a note with the orange button\n- Use the folder rail to organize your work\n- Press Ctrl/⌘ + K to search\n- Press Ctrl/⌘ + S to save\n\nNo account. No sync. No tracking.", tags: ["welcome", "local-first"], folder: "Field Notes", color: "#d77834", starred: true, createdAt: "2026-08-17T17:30:00.000Z", updatedAt: "2026-08-17T17:30:00.000Z" },
  { id: "launch-checklist", title: "Launch checklist", content: "## Before release\n\n- [x] Define the core workflow\n- [x] Keep storage local\n- [ ] Test on mobile\n- [ ] Share with the team", tags: ["project", "checklist"], folder: "Projects", color: "#d6b43c", starred: false, createdAt: "2026-08-16T09:15:00.000Z", updatedAt: "2026-08-17T14:08:00.000Z" },
  { id: "weekend-ideas", title: "Weekend ideas", content: "A short list for the next free Saturday:\n\n- Morning market\n- Lakeside walk\n- Find a small record shop\n- Cook something new", tags: ["personal", "weekend"], folder: "Personal", color: "#6e9f70", starred: false, createdAt: "2026-08-14T18:45:00.000Z", updatedAt: "2026-08-16T20:12:00.000Z" },
  { id: "offline-thinking", title: "Offline-first thoughts", content: "A focused tool should feel instant, trustworthy, and quiet. Local browser storage is enough for the first useful version.", tags: ["idea", "product"], folder: "Ideas", color: "#5d8fa7", starred: true, createdAt: "2026-08-13T11:20:00.000Z", updatedAt: "2026-08-15T08:42:00.000Z" },
];

function makeId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `note-${Date.now()}` }
function formatUpdated(iso: string) { return new Intl.DateTimeFormat("en-GB", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(iso)) }
function folderCode(folder: Folder) { return folder.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase() }

export default function Home() {
  const [history, setHistory] = useState<NoteHistory>(() => createHistory(seedNotes) as NoteHistory);
  const notes = history.present;
  const [selectedId, setSelectedId] = useState(seedNotes[0].id);
  const [filter, setFilter] = useState<"All" | "Favorites" | Folder>("All");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"notes" | "settings">("notes");
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState("LOCAL / READY");
  const [tagDraft, setTagDraft] = useState("");
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
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;
  const wordCount = selectedNote?.content.trim() ? selectedNote.content.trim().split(/\s+/).length : 0;

  function setNotes(updater: Note[] | ((current: Note[]) => Note[])) {
    setSaveState("LOCAL / SAVING…");
    setHistory((current) => {
      const next = typeof updater === "function" ? updater(current.present) : updater;
      return commitHistory(current, next) as NoteHistory;
    });
  }
  function updateSelected(patch: Partial<Note>) { if (!selectedNote) return; setNotes((current) => updateNote(current, selectedNote.id, patch, new Date().toISOString()) as Note[]) }
  function createNote() {
    const now = new Date().toISOString(); const folder: Folder = folders.includes(filter as Folder) ? filter as Folder : "Field Notes";
    const note: Note = { id: makeId(), title: "Untitled transmission", content: "", tags: [], folder, color: noteColors[0], starred: false, createdAt: now, updatedAt: now };
    setNotes((current) => [note, ...current]); setSelectedId(note.id); setFilter("All"); setView("notes"); window.setTimeout(() => editorRef.current?.focus(), 60);
  }
  function deleteSelected() { if (!selectedNote || !window.confirm(`Delete “${selectedNote.title}”? You can undo this action.`)) return; const remaining = deleteNote(notes, selectedNote.id) as Note[]; setNotes(remaining); setSelectedId(remaining[0]?.id ?? "") }
  function insertMarkup(prefix: string, suffix = "") { if (!selectedNote || !editorRef.current) return; const textarea = editorRef.current; const result = applyMarkup(selectedNote.content, textarea.selectionStart, textarea.selectionEnd, prefix, suffix); updateSelected({ content: result.content }); window.setTimeout(() => { textarea.focus(); textarea.setSelectionRange(result.selectionStart, result.selectionEnd) }) }
  function addTag(event: KeyboardEvent<HTMLInputElement>) { if (event.key !== "Enter" || !selectedNote) return; event.preventDefault(); setNotes((current) => addTagToNote(current, selectedNote.id, tagDraft, new Date().toISOString()) as Note[]); setTagDraft("") }
  function exportNotes() { const blob = new Blob([serializeNotes(notes, new Date().toISOString())], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `retro-tactical-notes-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url) }
  function importNotes(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = parseNotesPayload(String(reader.result)) as Note[]; setNotes(imported); setSelectedId(imported[0]?.id ?? ""); setSaveState("LOCAL / IMPORTED") } catch { window.alert("That file is not a valid Retro Tactical Notes backup.") } }; reader.readAsText(file); event.target.value = "" }
  function clearAll() { if (!window.confirm("Erase every note stored in this browser? This cannot be undone.")) return; setNotes([]); setSelectedId(""); localStorage.removeItem(NOTES_KEY) }
  function saveNow() { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); setSaveState("LOCAL / SAVED") }
  function undo() { if (!history.past.length) return; setSaveState("LOCAL / SAVING…"); setHistory((current) => undoHistory(current) as NoteHistory) }
  function redo() { if (!history.future.length) return; setSaveState("LOCAL / SAVING…"); setHistory((current) => redoHistory(current) as NoteHistory) }

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
            <div className="section-label">ARCHIVE</div>
            <button className={`folder-button ${filter === "All" ? "active" : ""}`} onClick={() => setFilter("All")}><span className="folder-glyph">ALL</span><span>All notes</span><b>{notes.length}</b></button>
            <button className={`folder-button ${filter === "Favorites" ? "active" : ""}`} onClick={() => setFilter("Favorites")}><span className="folder-glyph star">★</span><span>Favorites</span><b>{notes.filter((note) => note.starred).length}</b></button>
            <div className="folder-divider" />
            {folders.map((folder) => <button key={folder} className={`folder-button ${filter === folder ? "active" : ""}`} onClick={() => setFilter(folder)}><span className="folder-glyph">{folderCode(folder)}</span><span>{folder}</span><b>{notes.filter((note) => note.folder === folder).length}</b></button>)}
            <div className="local-card"><span className="local-card-icon">▣</span><strong>DEVICE STORAGE</strong><p>Nothing leaves this browser.</p></div>
          </aside>

          <section className="note-browser">
            <div className="list-controls"><label className="search-box"><span aria-hidden="true">⌕</span><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SEARCH ARCHIVE…" aria-label="Search notes" /><kbd>⌘ K</kbd></label><button className="primary-button hazard" onClick={createNote}><span>＋</span> NEW NOTE</button></div>
            <div className="list-heading"><div><span className="eyebrow">CURRENT FILTER</span><h1>{filter}</h1></div><span className="result-count">{filteredNotes.length.toString().padStart(2, "0")} RECORDS</span></div>
            <div className="note-list" role="list">
              {filteredNotes.map((note) => <button key={note.id} className={`note-row ${note.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(note.id)} role="listitem"><span className="note-swatch" style={{ background: note.color }} aria-hidden="true" /><span className="note-copy"><span className="note-title-line"><strong>{note.title || "Untitled note"}</strong><span>{note.starred ? "★" : "☆"}</span></span><span className="note-preview">{note.content.replace(/[#*\-[\]]/g, " ").trim() || "Empty field note"}</span><span className="note-meta"><em>{note.folder}</em>{note.tags.slice(0, 2).map((tag) => <i key={tag}>#{tag}</i>)}</span></span><time dateTime={note.updatedAt}>{formatUpdated(note.updatedAt)}</time></button>)}
              {!filteredNotes.length && <div className="empty-list"><span>∅</span><strong>NO RECORDS FOUND</strong><p>Adjust the filter or start a new note.</p></div>}
            </div>
          </section>

          <section className="editor-panel">
            {selectedNote ? <>
              <div className="editor-topline"><div className="editor-file-status"><strong>{selectedNote.title || "UNTITLED TRANSMISSION"}</strong><span>{saveState} · {formatUpdated(selectedNote.updatedAt)}</span></div><label><span>FOLDER</span><select value={selectedNote.folder} onChange={(event) => updateSelected({ folder: event.target.value as Folder })}>{folders.map((folder) => <option key={folder}>{folder}</option>)}</select></label><div className="editor-actions"><button className={`star-button ${selectedNote.starred ? "active" : ""}`} onClick={() => updateSelected({ starred: !selectedNote.starred })} aria-label={selectedNote.starred ? "Remove favorite" : "Add favorite"}>★</button><button className="danger-button" onClick={deleteSelected}>DELETE</button><button className="save-button" onClick={saveNow}>▣ SAVE</button></div></div>
              <div className="editor-toolbar" aria-label="Formatting shortcuts"><button className="history-tool" onClick={undo} disabled={!history.past.length} aria-label="Undo">↶</button><button className="history-tool" onClick={redo} disabled={!history.future.length} aria-label="Redo">↷</button><span className="tool-separator" /><button onClick={() => insertMarkup("**", "**")} aria-label="Bold"><b>B</b></button><button onClick={() => insertMarkup("_", "_")} aria-label="Italic"><i>I</i></button><button onClick={() => insertMarkup("<u>", "</u>")} aria-label="Underline"><u>U</u></button><button onClick={() => insertMarkup("## ")} aria-label="Heading">H2</button><button onClick={() => insertMarkup("- ")} aria-label="Bulleted list">• LIST</button><button onClick={() => insertMarkup("1. ")} aria-label="Numbered list">1. LIST</button><button onClick={() => insertMarkup("- [ ] ")} aria-label="Checklist">☐ TASK</button><button onClick={() => insertMarkup("`", "`")} aria-label="Code">&lt;/&gt;</button><button onClick={() => insertMarkup("[", "](url)")} aria-label="Link">↗ LINK</button><span>MARKDOWN FIELD EDITOR</span></div>
              <article className="paper-sheet"><div className="paper-stamp">LOCAL FILE · {selectedNote.id.slice(0, 6).toUpperCase()}</div><input className="title-input" value={selectedNote.title} onChange={(event) => updateSelected({ title: event.target.value })} aria-label="Note title" placeholder="Untitled transmission" /><textarea ref={editorRef} value={selectedNote.content} onChange={(event) => updateSelected({ content: event.target.value })} placeholder="Begin field note…" aria-label="Note content" spellCheck="true" /><div className="tag-row">{selectedNote.tags.map((tag) => <button key={tag} onClick={() => setNotes((current) => removeTagFromNote(current, selectedNote.id, tag, new Date().toISOString()) as Note[])} title="Remove tag">#{tag} ×</button>)}<input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={addTag} placeholder="+ tag" aria-label="Add tag" /></div></article>
              <footer className="editor-footer"><div className="palette" aria-label="Note color"><span>MARKER</span>{noteColors.map((color) => <button key={color} style={{ background: color }} className={selectedNote.color === color ? "active" : ""} onClick={() => updateSelected({ color })} aria-label={`Use color ${color}`} />)}</div><div className="document-stats"><span>{wordCount} WORDS</span><span>{selectedNote.content.length} CHARACTERS</span><span>UPDATED {formatUpdated(selectedNote.updatedAt)}</span></div></footer>
            </> : <div className="empty-editor"><div className="empty-badge">RT</div><h2>NO FILE SELECTED</h2><p>Create a new note or choose a record from the archive.</p><button className="primary-button" onClick={createNote}>＋ NEW NOTE</button></div>}
          </section>
        </div>
      )}
      <input ref={importRef} className="visually-hidden" type="file" accept="application/json" onChange={importNotes} />
    </main>
    </div>
  );
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
        <div className="about-strip"><span className="brand-mark">RT</span><div><strong>RETRO TACTICAL NOTES · MK-II</strong><p>An original local-first notebook. Auto-save and 100-step undo history run entirely on this device.</p></div><small>BUILD 1.3.0</small></div>
      </div>
    </div>
  </section>;
}
