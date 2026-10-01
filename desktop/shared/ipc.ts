/**
 * desktop/shared/ipc.ts — Typed IPC protocol between renderer, main, and host.
 *
 * This is the single source of truth for every message that crosses a process
 * boundary in the desktop app. The renderer (sandboxed) and the utility-process
 * command host both import these types so the contract can never drift.
 *
 * Topology:
 *   renderer  --(preload contextBridge)-->  main  --(parentPort)-->  host
 *   renderer  <--(preload event stream)---  main  <--(parentPort)---  host
 *
 * Correlation: every message carries a `requestId` identifying the in-flight
 * invocation. Prompt requests additionally carry a `promptId` so a single
 * invocation can issue many sequential prompts.
 */

/** Identifies one in-flight command invocation end-to-end. */
export type RequestId = string;

// ---------------------------------------------------------------------------
// Prompt specs (host asks the UI a question)
// ---------------------------------------------------------------------------

/** One selectable option (mirrors ui/prompt.ts PromptOption). */
export interface IpcPromptOption {
  value: string;
  label: string;
  hint?: string;
}

/** A prompt the host needs the UI (or a native dialog) to answer. */
export type PromptSpec =
  | { type: "select"; message: string; options: IpcPromptOption[]; initialValue?: string }
  | { type: "multiselect"; message: string; options: IpcPromptOption[]; initialValues?: string[]; required?: boolean }
  | { type: "confirm"; message: string; initialValue?: boolean }
  | {
      type: "text";
      message: string;
      placeholder?: string;
      defaultValue?: string;
      /** Directory/file intent — main opens a native picker instead of a text field. */
      kind?: "path" | "dir";
    };

/** The answer to a PromptSpec. `null` means the user cancelled. */
export type PromptValue = string | string[] | boolean;

// ---------------------------------------------------------------------------
// Output / progress events (host streams UI feedback)
// ---------------------------------------------------------------------------

/** A chrome / log line emitted through the OutputAdapter seam. */
export interface OutputEvent {
  level: "intro" | "outro" | "info" | "success" | "warn" | "error" | "step";
  message: string;
}

/** A spinner lifecycle event emitted through the PromptAdapter.spinner() seam. */
export interface ProgressEvent {
  phase: "start" | "message" | "stop";
  message?: string;
}

// ---------------------------------------------------------------------------
// Renderer/main -> host
// ---------------------------------------------------------------------------

/** Start a command in the host. */
export interface InvokeMessage {
  kind: "invoke";
  requestId: RequestId;
  /** Registry key of the capability to run (e.g. "ping", "fork", "git"). */
  command: string;
  /** Command-specific arguments (validated by the host handler). */
  args?: unknown;
}

/** Answer a prompt-request. `value: null` signals cancellation. */
export interface PromptResponseMessage {
  kind: "prompt-response";
  requestId: RequestId;
  promptId: string;
  value: PromptValue | null;
}

/** Ask the host to cancel an in-flight invocation. */
export interface CancelMessage {
  kind: "cancel";
  requestId: RequestId;
}

/** Every message the host receives. */
export type ToHost = InvokeMessage | PromptResponseMessage | CancelMessage;

// ---------------------------------------------------------------------------
// Host -> main/renderer
// ---------------------------------------------------------------------------

/** The invocation completed successfully. */
export interface ResultMessage {
  kind: "result";
  requestId: RequestId;
  /** Optional structured payload (ping returns a string; most commands void). */
  value: unknown;
}

/** The invocation failed (typed error name + message). */
export interface ErrorMessage {
  kind: "error";
  requestId: RequestId;
  /** Error constructor name (e.g. "PromptCancelled", "ProjectsRootError"). */
  name: string;
  message: string;
}

/** The host needs a prompt answered. */
export interface PromptRequestMessage {
  kind: "prompt-request";
  requestId: RequestId;
  promptId: string;
  prompt: PromptSpec;
}

/** A chrome/log line for the results pane. */
export interface OutputEventMessage {
  kind: "output-event";
  requestId: RequestId;
  event: OutputEvent;
}

/** A spinner/progress update. */
export interface ProgressEventMessage {
  kind: "progress-event";
  requestId: RequestId;
  event: ProgressEvent;
}

/** Every message the host sends. */
export type FromHost =
  | ResultMessage
  | ErrorMessage
  | PromptRequestMessage
  | OutputEventMessage
  | ProgressEventMessage;

// ---------------------------------------------------------------------------
// Preload-exposed renderer API (window.scvn)
// ---------------------------------------------------------------------------

/** The API the preload bridge exposes to the renderer as `window.scvn`. */
export interface ScvnBridge {
  /** Start a command; returns the generated requestId. */
  invoke(command: string, args?: unknown): RequestId;
  /** Subscribe to every host-origin event for any request. Returns an unsubscribe fn. */
  onEvent(handler: (message: FromHost) => void): () => void;
  /** Answer a prompt-request (value null = cancel). */
  respondPrompt(requestId: RequestId, promptId: string, value: PromptValue | null): void;
  /** Cancel an in-flight invocation. */
  cancel(requestId: RequestId): void;
  /**
   * Open a native folder/file picker outside any run session (used by launch
   * forms). Resolves to the chosen path, or null when cancelled.
   */
  pickDirectory(options?: { kind?: "dir" | "path"; title?: string; defaultPath?: string }): Promise<string | null>;
  /**
   * Open a native folder picker that allows multi-selection (⌘/shift-click).
   * Resolves to every chosen path, or null when cancelled / nothing chosen.
   */
  pickDirectories(options?: { kind?: "dir" | "path"; title?: string; defaultPath?: string }): Promise<string[] | null>;

  /** Open a native Save As dialog outside any run session. */
  pickSaveFile(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
}

declare global {
  interface Window {
    scvn: ScvnBridge;
  }
}
