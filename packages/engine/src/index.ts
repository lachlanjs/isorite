// @isorite/engine: the public surface.

export { Conflict, EngineError, MAX_FILE_BYTES, MAX_IMAGE_BYTES } from "./api.ts";
export type { AgentLook, AgentChange, Api, CodeSlice, FileBytes, PictureInfo, Conversation, ConversationSummary, EngineEvent, LensSummary, Listing, MapReport, NoteSource, NoteSummary, Saved, SearchHit, FindHit, FindResult, Session, TerminalItem, TerminalPermission, TerminalTurn, TerminalView, AgentRecord, AgentSession, Whereabouts } from "./api.ts";
export { Engine, MAX_NOTE_BYTES, checkNoteId, notesOfTurns, type ArtifactRun } from "./engine.ts";
export type { Elsewhere, EngineOptions } from "./engine.ts";
export { MemoryFiles, systemClock } from "./ports.ts";
export type { Clock, FileInfo, Files } from "./ports.ts";
export { Lookup, baseOf } from "./lookup.ts";
export type { Away, How, Similar, Step, ToolDef } from "./lookup.ts";
export { INLINE, Meaning, pieces } from "./meaning.ts";
export type { Embedder, Found, Hit, Piece } from "./meaning.ts";
export { editRegions, regionsOf, writeRegions } from "./agent.ts";
export { ARTIFACTS, CONVERSATIONS_DIR, ISORITE, LEARNING, MODES, PRACTICE, conversationPath, readTurns } from "./turn.ts";
export type { Decision, Given, Mode, Tier, Turn, TurnItem, TurnLine } from "./turn.ts";
export type { AgentEdit, Region } from "./agent.ts";
export { MAX_CODE_LINES } from "./api.ts";
