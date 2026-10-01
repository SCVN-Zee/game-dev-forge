import * as React from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Folder,
  FolderOpen,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { invokeForResult, pickDirectory, pickSaveFile } from "@/lib/bridge";
import {
  buildInitLayoutTree,
  removeInitTreePath,
  renameInitTreePath,
  type InitLayoutTreeNode,
} from "@/lib/init-layout-tree";
import { cn } from "@/lib/utils";
import { ProjectControl } from "@/views/capability-form";
import type { InitLayoutWire, InitResultWire } from "@shared/commands";

const DEFAULT_LAYOUT: InitLayoutWire = {
  directories: [
    "Supercent",
    "Supercent/ProjectName",
    "Supercent/ProjectName/Animation/AnimationClips",
    "Supercent/ProjectName/Animation/AnimatorControllers",
    "Supercent/ProjectName/Audio/SFXs",
    "Supercent/ProjectName/Audio/BGMs",
    "Supercent/ProjectName/Configs",
    "Supercent/ProjectName/Models",
    "Supercent/ProjectName/Fonts",
    "Supercent/ProjectName/Materials",
    "Supercent/ProjectName/Prefabs",
    "Supercent/ProjectName/Scenes",
    "Supercent/ProjectName/Scripts",
    "Supercent/ProjectName/Shaders",
    "Supercent/ProjectName/Sprites",
    "Supercent/ProjectName/Textures",
  ],
};

function cloneLayout(layout: InitLayoutWire): InitLayoutWire {
  return { directories: [...layout.directories] };
}

function DirectoryRow({
  node,
  depth,
  expanded,
  onToggle,
  onRename,
  onRemove,
  onAddChild,
}: {
  node: InitLayoutTreeNode;
  depth: number;
  expanded: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onRename: (path: string, name: string) => void;
  onRemove: (path: string) => void;
  onAddChild: (path: string, name: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = React.useState(node.name);
  const [adding, setAdding] = React.useState(false);
  const [childDraft, setChildDraft] = React.useState("");

  React.useEffect(() => setDraft(node.name), [node.name]);

  const hasChildren = node.children.length > 0;
  const open = hasChildren && expanded.has(node.path);
  const commitRename = (): void => {
    const name = draft.trim();
    if (name && name !== node.name) onRename(node.path, name);
    else setDraft(node.name);
  };
  const commitChild = (): void => {
    const name = childDraft.trim();
    if (!name) return;
    onAddChild(node.path, name);
    setChildDraft("");
    setAdding(false);
  };

  return (
    <li className="min-w-0">
      <div
        className="flex min-h-10 min-w-0 items-center gap-1 rounded-lg px-1.5 transition-colors duration-150 hover:bg-muted/50 sm:gap-2"
        style={{ marginLeft: Math.min(depth * 14, 56) }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={(open ? "Collapse " : "Expand ") + node.name}
            aria-expanded={open}
            onClick={() => onToggle(node.path)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              className={cn("size-3.5 motion-safe:transition-transform", open && "rotate-90")}
            />
          </button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden />
        )}
        {open ? (
          <FolderOpen className="size-4 shrink-0 text-primary/80" aria-hidden />
        ) : (
          <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Input
          aria-label={"Folder " + node.path}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-2 font-medium shadow-none hover:border-input focus-visible:border-input"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={"Add child to " + node.path}
          onClick={() => setAdding((value) => !value)}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={"Remove " + node.path}
          onClick={() => onRemove(node.path)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {adding ? (
        <div
          className="flex min-w-0 items-center gap-2 py-1"
          style={{ marginLeft: Math.min((depth + 1) * 14 + 24, 80) }}
        >
          <Input
            autoFocus
            aria-label={"New child of " + node.path}
            value={childDraft}
            onChange={(event) => setChildDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitChild();
              if (event.key === "Escape") setAdding(false);
            }}
            placeholder="Child folder"
            className="h-9 min-w-0 flex-1"
          />
          <Button type="button" size="sm" variant="outline" onClick={commitChild}>
            Add
          </Button>
        </div>
      ) : null}

      {open ? (
        <ul className="min-w-0 space-y-1">
          {node.children.map((child) => (
            <DirectoryRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onRename={onRename}
              onRemove={onRemove}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function InitView({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }): React.JSX.Element {
  const [targetAssets, setTargetAssets] = React.useState("");
  const [layout, setLayout] = React.useState(() => cloneLayout(DEFAULT_LAYOUT));
  const [addingAtRoot, setAddingAtRoot] = React.useState(false);
  const [rootChildDraft, setRootChildDraft] = React.useState("");
  const [layoutPath, setLayoutPath] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<InitResultWire | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [layoutStatus, setLayoutStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const tree = React.useMemo(() => buildInitLayoutTree(layout.directories), [layout.directories]);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(["Supercent", "Supercent/ProjectName", "Supercent/ProjectName/Animation", "Supercent/ProjectName/Audio"]));
  const markDirty = (): void => {
    setLayoutStatus(null);
    onDirtyChange(true);
  };

  const loadLayout = async (): Promise<void> => {
    const selected = await pickDirectory({ kind: "path", title: "Open layout manifest" });
    if (!selected) return;
    try {
      const next = await invokeForResult("init:load-layout", { path: selected }) as InitLayoutWire;
      setLayout(cloneLayout(next));
      setLayoutPath(selected);
      setExpanded(new Set(buildInitLayoutTree(next.directories).map((node) => node.path)));
      onDirtyChange(false);
      setError(null);
      setLayoutStatus("Layout loaded.");
    } catch (caught) {
      setLayoutStatus(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const saveLayout = async (): Promise<void> => {
    const selected = layoutPath ?? await pickSaveFile({ title: "Save layout manifest", defaultPath: "gdf-layout.json" });
    if (!selected) return;
    try {
      await invokeForResult("init:save-layout", { path: selected, layout });
      setLayoutPath(selected);
      onDirtyChange(false);
      setError(null);
      setLayoutStatus("Layout saved.");
    } catch (caught) {
      setLayoutStatus(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const run = async (dryRun: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    setLayoutStatus(null);
    try {
      setResult(await invokeForResult("init:run", { targetAssets, layout, dryRun }) as InitResultWire);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const toggleExpanded = (path: string): void => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  return (
    <div className="workspace-page flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-4 sm:p-5">
      <PageHeader title="Initialize" description="Edit and apply a reusable Assets folder layout." />

      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
          <ProjectControl
            id="init-project"
            label="Target project"
            value={targetAssets}
            onChange={(value) => {
              markDirty();
              setTargetAssets(value);
            }}
            action={
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !targetAssets}
                  onClick={() => void run(true)}
                >
                  Dry run
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !targetAssets}
                  onClick={() => void run(false)}
                >
                  <FolderOpen className="size-4" />
                  Create
                </Button>
              </div>
            }
          />

          <div className="min-h-5 shrink-0" aria-live="polite" aria-atomic="true">
            {busy ? (
              <div role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
                Preparing directories…
              </div>
            ) : error ? (
              <div role="alert" className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">Error: {error}</span>
              </div>
            ) : layoutStatus ? (
              <div role="status" className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {layoutStatus}
              </div>
            ) : result ? (
              <div role="status" className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {result.dryRun ? "Dry run complete" : "Directories ready"} ·{" "}
                {result.entries.length} paths {result.dryRun ? "previewed" : "checked"}.
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-3">
            <h3 className="text-sm font-semibold">Directory hierarchy</h3>
            <span className="rounded-md bg-muted/60 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {layout.directories.length} {layout.directories.length === 1 ? "entry" : "entries"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void loadLayout()}>
                <FolderOpen className="size-4" />Load layout
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void saveLayout()}>
                <Save className="size-4" />Save layout
              </Button>
            </div>
          </div>
          {layoutPath ? <p className="shrink-0 truncate text-xs text-muted-foreground" title={layoutPath}>Layout file: {layoutPath}</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background/50 p-2 sm:p-3">
            <div className="flex min-h-10 items-center gap-2 rounded-lg bg-muted/35 px-2.5">
              <FolderOpen className="size-4 shrink-0 text-primary/80" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-semibold">Assets</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Add child to Assets"
                aria-expanded={addingAtRoot}
                onClick={() => setAddingAtRoot((value) => !value)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            {addingAtRoot ? (
              <div className="flex min-w-0 items-center gap-2 py-1.5 pl-9 sm:pl-11">
                <Input
                  autoFocus
                  aria-label="New child of Assets"
                  value={rootChildDraft}
                  onChange={(event) => setRootChildDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const name = rootChildDraft.trim();
                      if (name && !/[\/\\]/u.test(name)) {
                        markDirty();
                        setLayout((current) => ({
                          directories: [...current.directories, name],
                        }));
                        setRootChildDraft("");
                        setAddingAtRoot(false);
                      }
                    }
                    if (event.key === "Escape") setAddingAtRoot(false);
                  }}
                  placeholder="Child folder"
                  className="h-9 min-w-0 flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const name = rootChildDraft.trim();
                    if (name && !/[\/\\]/u.test(name)) {
                      markDirty();
                      setLayout((current) => ({
                        directories: [...current.directories, name],
                      }));
                      setRootChildDraft("");
                      setAddingAtRoot(false);
                    }
                  }}
                >
                  Add folder
                </Button>
              </div>
            ) : null}

            <ul aria-label="Folders under Assets" className="mt-1 min-w-0 space-y-1">
              {tree.map((node) => (
                <DirectoryRow
                  key={node.path}
                  node={node}
                  depth={1}
                  expanded={expanded}
                  onToggle={toggleExpanded}
                  onRename={(path, name) => {
                    markDirty();
                    setLayout((current) => ({
                      directories: renameInitTreePath(current.directories, path, name),
                    }));
                  }}
                  onRemove={(path) => {
                    markDirty();
                    setLayout((current) => ({
                      directories: removeInitTreePath(current.directories, path),
                    }));
                  }}
                  onAddChild={(path, name) => {
                    if (/[\/\\]/u.test(name)) return;
                    markDirty();
                    const childPath = path + "/" + name;
                    setLayout((current) => ({
                      directories: [...current.directories, childPath],
                    }));
                    setExpanded((current) => new Set([...current, path]));
                  }}
                />
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
