/**
 * desktop/renderer/views/run-op.tsx — In-flight capability view.
 *
 * Streams `output-event` / `progress-event` into a log pane, renders the
 * current `prompt-request` as a GUI control, and exposes Cancel (in-flight)
 * plus Back (after result/error). The event listener is registered before
 * invoke so the first host event cannot race the subscription.
 */

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pickDirectory } from "@/lib/bridge";
import { cn } from "@/lib/utils";
import { useHostRun, logLineClass, type RunStatus } from "@/lib/use-host-run";
import type { PromptSpec, PromptValue } from "@shared/ipc";

export interface RunOpViewProps {
  command: string;
  args: unknown;
  title: string;
  onBack: () => void;
}

const promptShellClass = "space-y-2";

export function RunOpView(props: RunOpViewProps): React.JSX.Element {
  const { lines, status, prompt, cancelling, start, resolvePrompt, cancel } = useHostRun();
  const startedRef = useRef(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start(props.command, props.args);
    // Mount-once: start() subscribes before invoke so the first event isn't missed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const running = status === "running" || status === "idle";

  return (
    <div className="workspace-page flex h-full min-h-0 flex-col gap-3 p-4 sm:p-5">
      <PageHeader
        title={props.title}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusBadge status={status} />
            {running ? (
              <Button type="button" size="sm" variant="outline" disabled={cancelling} onClick={cancel}>
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={props.onBack}>
                Back
              </Button>
            )}
          </div>
        }
      />
      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
        {prompt !== null ? (
          <section
            aria-label="Operation prompt"
            className="max-h-[45%] min-h-0 shrink-0 overflow-y-auto border-b border-border px-4 py-3"
          >
            <PromptControls key={prompt.promptId} spec={prompt.prompt} onResolve={resolvePrompt} />
          </section>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <pre
            ref={logRef}
            aria-label="Operation output"
            className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
            aria-live="polite"
          >
            {lines.length > 0 ? (
              lines.map((line, i) => (
                <span key={i} className={cn("block", logLineClass(line.cls))}>
                  {line.text}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">
                {running ? "Waiting for output…" : "No output was produced."}
              </span>
            )}
          </pre>
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: RunStatus }): React.JSX.Element {
  if (status === "running" || status === "idle") {
    return (
      <Badge variant="secondary" role="status">
        <LoaderCircle className="size-4 animate-spin" />
        Running…
      </Badge>
    );
  }
  if (status === "done") {
    return (
      <Badge variant="success" role="status">
        Done
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" role="status">
      Failed
    </Badge>
  );
}

function PromptControls({
  spec,
  onResolve,
}: {
  spec: PromptSpec;
  onResolve: (value: PromptValue | null) => void;
}): React.JSX.Element {
  switch (spec.type) {
    case "select":
      return <SelectPrompt prompt={spec} onResolve={onResolve} />;
    case "multiselect":
      return <MultiselectPrompt prompt={spec} onResolve={onResolve} />;
    case "confirm":
      return <ConfirmPrompt prompt={spec} onResolve={onResolve} />;
    case "text":
      return <TextPrompt prompt={spec} onResolve={onResolve} />;
    default: {
      const _never: never = spec;
      return _never;
    }
  }
}

function SelectPrompt({
  prompt,
  onResolve,
}: {
  prompt: Extract<PromptSpec, { type: "select" }>;
  onResolve: (value: string | null) => void;
}): React.JSX.Element {
  const [value, setValue] = useState<string | undefined>(prompt.initialValue);
  const settledRef = useRef(false);

  function resolve(next: string | null): void {
    if (settledRef.current) return;
    settledRef.current = true;
    onResolve(next);
  }

  return (
    <div
      className={promptShellClass}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          resolve(null);
        } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
          if (value === undefined) return;
          event.preventDefault();
          resolve(value);
        }
      }}
    >
      <p className="text-sm text-foreground">{prompt.message}</p>
      <div role="radiogroup" aria-label={prompt.message} className="space-y-2">
        {prompt.options.map((opt, i) => (
          <Label
            key={opt.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5 font-normal transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 hover:bg-background"
          >
            <input
              type="radio"
              name="run-op-select"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => setValue(opt.value)}
              autoFocus={i === 0}
              className="size-4 shrink-0 accent-[var(--primary)]"
            />
            <span>{opt.label}</span>
            {opt.hint ? <span className="text-xs text-muted-foreground">{opt.hint}</span> : null}
          </Label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={value === undefined} onClick={() => value !== undefined && resolve(value)}>
          Submit
        </Button>
        <Button type="button" variant="outline" onClick={() => resolve(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function MultiselectPrompt({
  prompt,
  onResolve,
}: {
  prompt: Extract<PromptSpec, { type: "multiselect" }>;
  onResolve: (value: string[] | null) => void;
}): React.JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(prompt.initialValues ?? []));
  const settledRef = useRef(false);
  const submitDisabled = prompt.required === true && selected.size === 0;

  function selectedInOrder(): string[] {
    return prompt.options.filter((opt) => selected.has(opt.value)).map((opt) => opt.value);
  }

  function resolve(next: string[] | null): void {
    if (settledRef.current) return;
    settledRef.current = true;
    onResolve(next);
  }

  function toggle(optionValue: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(optionValue);
      else next.delete(optionValue);
      return next;
    });
  }

  return (
    <div
      className={promptShellClass}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          resolve(null);
        } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
          if (submitDisabled) return;
          event.preventDefault();
          resolve(selectedInOrder());
        }
      }}
    >
      <p className="text-sm text-foreground">{prompt.message}</p>
      <div role="group" aria-label={prompt.message} className="space-y-2">
        {prompt.options.map((opt, i) => (
          <Label
            key={opt.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5 font-normal transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 hover:bg-background"
          >
            <input
              type="checkbox"
              value={opt.value}
              checked={selected.has(opt.value)}
              onChange={(event) => toggle(opt.value, event.target.checked)}
              autoFocus={i === 0}
              className="size-4 shrink-0 accent-[var(--primary)]"
            />
            <span>{opt.label}</span>
            {opt.hint ? <span className="text-xs text-muted-foreground">{opt.hint}</span> : null}
          </Label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={submitDisabled}
          onClick={() => {
            if (submitDisabled) return;
            resolve(selectedInOrder());
          }}
        >
          Submit
        </Button>
        <Button type="button" variant="outline" onClick={() => resolve(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ConfirmPrompt({
  prompt,
  onResolve,
}: {
  prompt: Extract<PromptSpec, { type: "confirm" }>;
  onResolve: (value: boolean | null) => void;
}): React.JSX.Element {
  const settledRef = useRef(false);
  const defaultYes = prompt.initialValue !== false;

  function resolve(next: boolean | null): void {
    if (settledRef.current) return;
    settledRef.current = true;
    onResolve(next);
  }

  return (
    <div
      className={promptShellClass}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          resolve(null);
        }
      }}
    >
      <p className="text-sm text-foreground">{prompt.message}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={defaultYes ? "default" : "outline"}
          autoFocus={defaultYes}
          onClick={() => resolve(true)}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant={defaultYes ? "outline" : "default"}
          autoFocus={!defaultYes}
          onClick={() => resolve(false)}
        >
          No
        </Button>
      </div>
    </div>
  );
}

function TextPrompt({
  prompt,
  onResolve,
}: {
  prompt: Extract<PromptSpec, { type: "text" }>;
  onResolve: (value: string | null) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(prompt.defaultValue ?? "");
  const settledRef = useRef(false);
  const browseKind = prompt.kind === "dir" || prompt.kind === "path" ? prompt.kind : undefined;
  const inputId = "run-op-text";

  function resolve(next: string | null): void {
    if (settledRef.current) return;
    settledRef.current = true;
    onResolve(next);
  }

  function onBrowse(): void {
    if (browseKind === undefined) return;
    void pickDirectory({ kind: browseKind })
      .then((path) => {
        if (path !== null) setValue(path);
      })
      .catch(() => undefined);
  }

  return (
    <div className={promptShellClass}>
      <Label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {prompt.message}
      </Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          autoFocus
          value={value}
          placeholder={
            prompt.placeholder ??
            (browseKind !== undefined ? "Enter a directory or file path" : undefined)
          }
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              resolve(value);
            } else if (event.key === "Escape") {
              event.preventDefault();
              resolve(null);
            }
          }}
        />
        {browseKind !== undefined ? (
          <Button type="button" variant="outline" onClick={onBrowse}>
            Browse…
          </Button>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={() => resolve(value)}>
          Submit
        </Button>
        <Button type="button" variant="outline" onClick={() => resolve(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
