/**
 * desktop/renderer/views/settings-view.tsx — The Settings page.
 *
 * Three sub-tabs: Config, Doctor, and Updates.
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, LoaderCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { checkForUpdates, downloadUpdate, getUpdateState, installUpdate, onUpdateState, setUpdateChannel, invokeForResult, pickDirectory } from "@/lib/bridge";
import type { UpdateChannel, UpdateState } from "@shared/ipc";
import {
  cancelQueuedConfigSave,
  enqueueConfigSave,
  subscribeConfigSaved,
  type ConfigSaveOwner,
} from "@/lib/config-save-queue";
import { logLineClass, useHostRun } from "@/lib/use-host-run";
import { cn } from "@/lib/utils";

export function SettingsView(): React.JSX.Element {
  return (
    <div className="workspace-page flex h-full min-h-0 flex-col gap-3 p-4 sm:p-5">
      <PageHeader title="Settings" />
      <Tabs defaultValue="config" className="flex min-h-0 flex-1 flex-col gap-2">
        <TabsList className="h-8 w-fit shrink-0 gap-1 rounded-lg border border-border bg-muted/30 p-1">
          <TabsTrigger value="config" className="h-6 rounded-md px-3 text-xs">Config</TabsTrigger>
          <TabsTrigger value="doctor" className="h-6 rounded-md px-3 text-xs">Doctor</TabsTrigger>
          <TabsTrigger value="updates" className="h-6 rounded-md px-3 text-xs">Updates</TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="m-0 flex min-h-0 flex-1 flex-col"><ConfigPanel /></TabsContent>
        <TabsContent value="doctor" className="m-0 flex min-h-0 flex-1 flex-col"><DoctorPanel /></TabsContent>
        <TabsContent value="updates" className="m-0 flex min-h-0 flex-1 flex-col"><UpdatesPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function UpdatesPanel(): React.JSX.Element {
  const [state, setState] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [channelBusy, setChannelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestEvent = useRef(0);
  const operation = useRef(0);

  useEffect(() => {
    let active = true;
    const off = onUpdateState((next) => { latestEvent.current += 1; if (active) setState(next); });
    const startEvent = latestEvent.current;
    void getUpdateState().then((next) => { if (active && latestEvent.current === startEvent) setState(next); })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; off(); };
  }, []);

  async function run(action: () => Promise<UpdateState>): Promise<void> {
    const request = ++operation.current;
    setBusy(true); setError(null);
    try { const next = await action(); if (operation.current === request) setState(next); }
    catch (reason) { if (operation.current === request) setError(errorMessage(reason)); }
    finally { if (operation.current === request) setBusy(false); }
  }

  async function changeChannel(channel: UpdateChannel): Promise<void> {
    const request = ++operation.current;
    setBusy(false); setChannelBusy(true); setError(null);
    try { const next = await setUpdateChannel(channel); if (operation.current === request) setState(next); }
    catch (reason) { if (operation.current === request) setError(errorMessage(reason)); }
    finally { if (operation.current === request) setChannelBusy(false); }
  }

  const loading = busy || channelBusy || state === null || ["checking", "downloading", "installing"].includes(state?.phase ?? "");
  const canCheck = !busy && !channelBusy && state !== null && state.phase !== "checking" && state.phase !== "downloading" && state.phase !== "installing";
  const action = state?.phase === "available" ? "download" : state?.phase === "ready" ? "install" : "check";

  return (
    <Card className="gap-0 p-0">
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="space-y-1"><h2 className="text-sm font-semibold">Application updates</h2>
          <p className="text-sm text-muted-foreground">Choose a release channel and check for desktop app updates.</p></div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1"><Label htmlFor="update-channel">Release channel</Label>
            <p className="text-xs text-muted-foreground">Stable is recommended; beta receives prereleases.</p></div>
          <Select value={state?.channel ?? "stable"} disabled={!state || channelBusy || state.phase === "installing"} onValueChange={(value) => void changeChannel(value as UpdateChannel)}>
            <SelectTrigger id="update-channel" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="stable">Stable</SelectItem><SelectItem value="beta">Beta</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div className="space-y-1"><p className="text-xs text-muted-foreground">Installed version</p>
            <p className="font-mono text-sm">{state?.currentVersion ?? "Loading…"}</p></div>
          <Button disabled={!canCheck || (action !== "check" && !state?.supported)} onClick={() => void run(action === "download" ? downloadUpdate : action === "install" ? installUpdate : checkForUpdates)}>
            {loading && <LoaderCircle className="size-4 animate-spin" />}
            {action === "download" ? "Download update" : action === "install" ? "Install and restart" : "Check for updates"}
          </Button>
        </div>
        {state && !state.supported && <p className="text-sm text-muted-foreground">Updates are supported for installed macOS arm64 builds only. You can still select a release channel.</p>}
        {state?.version && <p className="text-sm text-muted-foreground">Version {state.version} is available.</p>}
        {state?.phase === "downloading" && typeof state.percent === "number" && <div className="space-y-1" role="status"><div className="flex justify-between text-xs"><span>Downloading</span><span>{Math.round(state.percent)}%</span></div><progress className="h-2 w-full accent-primary" max={100} value={state.percent} aria-label="Update download progress" /></div>}
        {state?.phase === "ready" && <p className="text-sm text-success">Update downloaded and ready to install.</p>}
        {state?.message && <p className={cn("text-sm", state.phase === "error" ? "text-destructive" : "text-muted-foreground")} role={state.phase === "error" ? "alert" : "status"}>{state.message}</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

type StatusKind = "info" | "error" | "success";
const STATUS_CLASS: Record<StatusKind, string> = {
  info: "text-muted-foreground",
  error: "text-destructive",
  success: "text-success",
};
function ConfigPanel(): React.JSX.Element {
  const [projectsRoot, setProjectsRoot] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: StatusKind } | null>(null);
  const lastSavedRoot = useRef<string | null>(null);
  const saveOwner = useRef<ConfigSaveOwner>({});
  const saveSeq = useRef(0);
  const pendingSaves = useRef(0);
  const dirty = useRef(false);
  const latestExternalRoot = useRef<string | null>(null);
  const pickerPending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void invokeForResult("config:prepare")
      .then((raw) => {
        if (cancelled) return;
        const model = raw as { fields: { name: string; default?: string }[] };
        const root = latestExternalRoot.current ??
          (model.fields.find((f) => f.name === "projectsRoot")?.default ?? "");
        lastSavedRoot.current = root.trim();
        if (!dirty.current) setProjectsRoot(root);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus({ text: err instanceof Error ? err.message : String(err), kind: "error" });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeConfigSaved((root) => {
      latestExternalRoot.current = root;
      if (dirty.current || pendingSaves.current > 0) return;
      lastSavedRoot.current = root;
      setProjectsRoot(root);
      setStatus({ text: "Saved.", kind: "success" });
    });
  }, []);

  async function saveRoot(root: string, seq: number): Promise<void> {
    pendingSaves.current += 1;
    try {
      const outcome = await enqueueConfigSave(root, saveOwner.current);
      if (outcome.kind === "superseded" || saveSeq.current !== seq) return;
      const raw = outcome.value as { ok?: boolean; error?: string };
      if (raw?.ok !== true) {
        setStatus({ text: raw?.error ?? "Could not save the projects root", kind: "error" });
        return;
      }
      lastSavedRoot.current = root;
      dirty.current = false;
      setStatus({ text: "Saved.", kind: "success" });
    } catch (err: unknown) {
      if (saveSeq.current === seq) {
        setStatus({ text: err instanceof Error ? err.message : String(err), kind: "error" });
      }
    } finally {
      pendingSaves.current -= 1;
      setSaving(pendingSaves.current > 0);
    }
  }

  function commitRoot(value: string): void {
    const root = value.trim();
    if (root === "") {
      saveSeq.current += 1;
      cancelQueuedConfigSave(saveOwner.current);
      dirty.current = true;
      setStatus({ text: "Enter a projects root before saving.", kind: "error" });
      setSaving(pendingSaves.current > 0);
      return;
    }
    const persistedRoot = latestExternalRoot.current ?? lastSavedRoot.current;
    if (!dirty.current && root === persistedRoot) {
      lastSavedRoot.current = persistedRoot;
      dirty.current = false;
      return;
    }

    dirty.current = true;
    const seq = ++saveSeq.current;
    setSaving(true);
    setStatus(null);
    void saveRoot(root, seq);
  }

  return (
    <Card className="gap-0 p-0">
      <CardContent className="space-y-3 p-4">
        {loading ? (
          <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Label htmlFor="settings-projects-root" className="shrink-0 text-sm font-medium sm:w-40">
                Unity projects root
              </Label>
              <Input
                id="settings-projects-root"
                className="min-w-0 flex-1 font-mono text-sm"
                value={projectsRoot}
                placeholder="/path/to/your/Unity/Projects"
                onChange={(event) => {
                  dirty.current = true;
                  saveSeq.current += 1;
                  setProjectsRoot(event.target.value);
                  setStatus(null);
                }}
                onBlur={(event) => {
                  if (!pickerPending.current) commitRoot(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRoot(event.currentTarget.value);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onMouseDown={() => {
                  pickerPending.current = true;
                }}
                onClick={() => {
                  pickerPending.current = true;
                  void pickDirectory({ kind: "dir", title: "Unity projects root" })
                    .then((picked) => {
                      if (picked === null) return;
                      dirty.current = true;
                      saveSeq.current += 1;
                      setProjectsRoot(picked);
                      setStatus(null);
                      commitRoot(picked);
                    })
                    .catch((err: unknown) => {
                      setStatus({ text: err instanceof Error ? err.message : String(err), kind: "error" });
                    })
                    .finally(() => {
                      pickerPending.current = false;
                    });
                }}
              >
                <FolderOpen />
                Browse…
              </Button>
            </div>
            <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
              {saving ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Saving…
                </span>
              ) : null}
              {status ? (
                <span
                  className={cn("flex items-center gap-1.5 text-xs", STATUS_CLASS[status.kind])}
                  role={status.kind === "error" ? "alert" : "status"}
                >
                  {status.kind === "success" ? <CheckCircle2 className="size-3.5" /> : null}
                  {status.kind === "error" ? <AlertCircle className="size-3.5" /> : null}
                  {status.text}
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DoctorPanel(): React.JSX.Element {
  const { lines, status, start } = useHostRun();
  const logRef = useRef<HTMLPreElement>(null);
  const running = status === "running";

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium">Environment checks</span>
            <span
              className={cn(
                "text-xs",
                status === "failed" ? "text-destructive" : status === "done" ? "text-success" : "text-muted-foreground",
              )}
              role={status === "failed" ? "alert" : "status"}
              aria-live="polite"
            >
              {running ? "Checking…" : status === "done" ? "Checks complete." : status === "failed" ? "Checks failed." : "Ready."}
            </span>
          </div>
          <Button type="button" size="sm" disabled={running} onClick={() => start("doctor")}>
            {running ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {running ? "Running…" : "Run checks"}
          </Button>
        </div>
        <pre
          ref={logRef}
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
              {running ? "Waiting for diagnostic output…" : status === "done" || status === "failed" ? "No diagnostic output." : "Run checks to see output."}
            </span>
          )}
        </pre>
      </CardContent>
    </Card>
  );
}
