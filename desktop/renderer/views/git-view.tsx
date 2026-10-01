/**
 * desktop/renderer/views/git-view.tsx — The Git setup page.
 *
 * One shared target (discovered-project dropdown + Browse) at the top drives
 * everything below:
 *  - a row per git op (ignore / exclude / lfs); each runs on its own button —
 *    no toggle-then-run — and carries a pen icon to edit that op's template
 *    inline. Running an op navigates to the streaming run view via `onRun` with
 *    just that op's flag set.
 *  - a live per-submodule `ignore=dirty` toggle list. Selecting a project
 *    auto-loads every submodule in its repo (`ignore-dirty:list`); flipping a
 *    toggle applies immediately (`ignore-dirty:set`) — the write lands in the
 *    repo's local `.git/config` only, byte-identical to `gdf ignore-dirty`,
 *    never the tracked `.gitmodules`.
 *
 * When a submodule already declares `ignore = dirty` (or `all`) in
 * `.gitmodules`, git ignores its dirty content regardless of the local
 * override, so the row carries a read-only "also ignored via .gitmodules" note —
 * the toggle still reflects and controls only the local override.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  FileText,
  FolderOpen,
  GitBranch,
  HardDrive,
  ListFilter,
  LoaderCircle,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ProjectControl } from "@/views/capability-form";
import { invokeForResult } from "@/lib/bridge";
import type {
  EditableTemplateKey,
  LaunchValues,
  SubmoduleIgnoreList,
  SubmoduleIgnoreRow,
} from "@shared/commands";

export interface GitViewProps {
  onRun: (capabilityId: string, values: LaunchValues) => void;
  onEditTemplate: (key: EditableTemplateKey) => void;
}

interface GitOpSpec {
  flag: "ignore" | "exclude" | "lfs";
  label: string;
  description: string;
  templateKey: EditableTemplateKey;
  icon: LucideIcon;
}

const GIT_OPS: GitOpSpec[] = [
  {
    flag: "ignore",
    label: "Install .gitignore",
    description: "Write the repo-root .gitignore and prune nested ones.",
    templateKey: "gitignore",
    icon: FileText,
  },
  {
    flag: "exclude",
    label: "Install .git/info/exclude",
    description: "Write the local, unshared exclude file.",
    templateKey: "gitexclude",
    icon: ListFilter,
  },
  {
    flag: "lfs",
    label: "Enable Git LFS",
    description: "Run git lfs install and write the LFS .gitattributes block.",
    templateKey: "gitattributesLfs",
    icon: HardDrive,
  },
];

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; list: SubmoduleIgnoreList }
  | { kind: "error"; message: string };

export function GitView(props: GitViewProps): React.JSX.Element {
  const { onRun, onEditTemplate } = props;
  const [target, setTarget] = useState("");

  const [state, setState] = useState<LoadState>({ kind: "idle" });
  // Mutable copy of the loaded rows so a toggle can update one in place.
  const [rows, setRows] = useState<SubmoduleIgnoreRow[]>([]);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  // Guards a stale `ignore-dirty:list` response from a superseded target.
  const activeTargetRef = useRef(target);
  activeTargetRef.current = target;

  useEffect(() => {
    if (!target) {
      setState({ kind: "idle" });
      setRows([]);
      setPending({});
      setRowError({});
      return;
    }

    let cancelled = false;
    const requested = target;
    setState({ kind: "loading" });
    setRows([]);
    setPending({});
    setRowError({});

    void invokeForResult("ignore-dirty:list", { target: requested })
      .then((raw) => {
        if (cancelled || requested !== activeTargetRef.current) return;
        const list = raw as SubmoduleIgnoreList;
        setState({ kind: "loaded", list });
        if (list.status === "ok") setRows(list.submodules);
      })
      .catch((err: unknown) => {
        if (cancelled || requested !== activeTargetRef.current) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  const onToggle = (row: SubmoduleIgnoreRow, next: boolean): void => {
    setPending((p) => ({ ...p, [row.name]: true }));
    setRowError((e) => {
      const { [row.name]: _removed, ...rest } = e;
      return rest;
    });
    // Optimistic flip; reverted on failure.
    setRows((rs) => rs.map((r) => (r.name === row.name ? { ...r, localDirty: next } : r)));

    void invokeForResult("ignore-dirty:set", { target, name: row.name, ignored: next })
      .catch((err: unknown) => {
        setRows((rs) => rs.map((r) => (r.name === row.name ? { ...r, localDirty: !next } : r)));
        setRowError((e) => ({ ...e, [row.name]: err instanceof Error ? err.message : String(err) }));
      })
      .finally(() => {
        setPending((p) => {
          const { [row.name]: _removed, ...rest } = p;
          return rest;
        });
      });
  };

  return (
    <div className="workspace-page flex h-full min-h-0 flex-col gap-3 p-4 sm:p-5">
      <PageHeader title="Git setup" description="Configure repository files and local submodule visibility." />
      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <div className="shrink-0">
        <ProjectControl id="git-target" label="Target project" value={target} onChange={setTarget} />
      </div>
      <section aria-labelledby="git-operations-heading" className="shrink-0 space-y-2 border-t border-border pt-3">
        <h3 id="git-operations-heading" className="text-sm font-semibold">Repository actions</h3>
          <ul className="divide-y divide-border">
            {GIT_OPS.map((op) => {
              const Icon = op.icon;
              return (
                <li key={op.flag} className="flex items-center gap-3 py-2.5">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium">{op.label}</h4>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{op.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={"Edit " + op.label + " template"}
                      title={"Edit " + op.label + " template"} onClick={() => onEditTemplate(op.templateKey)}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={!target}
                      aria-label={"Run " + op.label} onClick={() => onRun("git", { [op.flag]: true, target })}>Run</Button>
                  </div>
                </li>
              );
            })}
          </ul>
      </section>
      <section aria-labelledby="git-submodules-heading" className="flex min-h-36 shrink-0 flex-1 flex-col gap-2 border-t border-border pt-3">
        <div className="shrink-0">
          <h3 id="git-submodules-heading" className="text-sm font-semibold">Ignore dirty submodules</h3>
          <p className="mt-1 text-xs text-muted-foreground">Local overrides in .git/config; tracked .gitmodules stays unchanged.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {state.kind === "idle" ? (
            <SubmoduleNotice icon={FolderOpen} title="Choose a project">
              Select a project above to load its submodules.
            </SubmoduleNotice>
          ) : state.kind === "loading" ? (
            <SubmoduleNotice
              icon={LoaderCircle}
              iconClassName="animate-spin"
              role="status"
              title="Loading submodules"
            >
              Reading the selected repository&apos;s submodule configuration.
            </SubmoduleNotice>
          ) : state.kind === "error" ? (
            <SubmoduleNotice
              icon={TriangleAlert}
              tone="error"
              role="alert"
              title="Could not load submodules"
            >
              {state.message}
            </SubmoduleNotice>
          ) : state.list.status === "notRepo" ? (
            <SubmoduleNotice
              icon={TriangleAlert}
              tone="error"
              role="alert"
              title="Not a Git repository"
            >
              Not a Git repository: <code className="break-all font-mono">{state.list.target}</code>
            </SubmoduleNotice>
          ) : state.list.status === "noSubmodules" || rows.length === 0 ? (
            <SubmoduleNotice icon={GitBranch} title="No submodules found">
              This repository has no submodules.
            </SubmoduleNotice>
          ) : (
            <div className="space-y-2" role="group" aria-label="Submodules">
              {rows.map((row) => {
                const toggleId = "ignore-dirty-" + row.name;
                const isPending = pending[row.name] === true;
                const gitmodulesHint = row.gitmodulesIgnore === "dirty" || row.gitmodulesIgnore === "all";
                return (
                  <div key={row.name} className="flex items-start gap-3 border-b border-border py-2.5 sm:items-center">
                    <GitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={toggleId} className="block cursor-pointer break-all font-mono text-sm font-medium text-foreground">
                        {row.path}
                      </label>
                      {row.name !== row.path ? (
                        <p className="mt-1 break-all text-xs text-muted-foreground">name: {row.name}</p>
                      ) : null}
                      {gitmodulesHint ? (
                        <Badge variant="muted" className="mt-2">
                          also ignored via .gitmodules
                        </Badge>
                      ) : null}
                      {rowError[row.name] ? (
                        <p className="mt-2 break-words rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-xs text-destructive" role="alert">
                          {rowError[row.name]}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isPending ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                          Saving…
                        </span>
                      ) : null}
                      <Switch
                        id={toggleId}
                        checked={row.localDirty}
                        disabled={isPending}
                        onCheckedChange={(next) => onToggle(row, next)}
                        aria-label={"ignore=dirty for " + row.path}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      </CardContent>
      </Card>
    </div>
  );
}


function SubmoduleNotice({
  icon: Icon,
  title,
  children,
  tone = "neutral",
  role,
  iconClassName,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  tone?: "neutral" | "error";
  role?: "alert" | "status";
  iconClassName?: string;
}): React.JSX.Element {
  const isError = tone === "error";
  return (
    <div className={"flex items-start gap-2 py-2 text-xs " + (isError ? "text-destructive" : "text-muted-foreground")} role={role}>
      <Icon className={iconClassName ? "mt-0.5 size-4 shrink-0 " + iconClassName : "mt-0.5 size-4 shrink-0"} aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <div className="mt-1 break-words leading-5">{children}</div>
      </div>
    </div>
  );
}
