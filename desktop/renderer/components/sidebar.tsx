import { ChevronsLeft, ChevronsRight, CircleHelp } from "lucide-react";
import type { CapabilitySpec } from "@shared/commands";
import { cn } from "@/lib/utils";
import { capabilityIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

declare const __APP_VERSION__: string | undefined;
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";

export interface SidebarProps {
  items: CapabilitySpec[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  onReplaySetup: () => void;
}

function NavItem({ item, active, collapsed, onSelect }: {
  item: CapabilitySpec;
  active: boolean;
  collapsed: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = capabilityIcon(item.id);
  const button = (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "no-drag flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none",
        "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
    </button>
  );
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  ) : button;
}

export function Sidebar({ items, selectedId, onSelect, collapsed, onToggle, onReplaySetup }: SidebarProps) {
  const settingsItem = items.find((item) => item.id === "settings");
  return (
    <aside data-collapsed={collapsed} className={cn(
      "app-sidebar flex min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
      collapsed ? "w-[var(--sidebar-width-icon)]" : "w-[var(--sidebar-width)]",
    )}>
      <nav aria-label="Tools" className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {items.filter((item) => item.id !== "settings").map((item) => (
            <li key={item.id}><NavItem item={item} active={item.id === selectedId} collapsed={collapsed} onSelect={onSelect} /></li>
          ))}
        </ul>
      </nav>
      <div className="space-y-1 border-t border-sidebar-border p-2">
        {settingsItem ? <NavItem item={settingsItem} active={settingsItem.id === selectedId} collapsed={collapsed} onSelect={onSelect} /> : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="Replay setup" onClick={onReplaySetup} className={cn(
              "no-drag flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed && "justify-center px-0",
            )}>
              <CircleHelp aria-hidden="true" className="size-4" />
              <span className={cn(collapsed && "sr-only")}>Setup guide</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Setup guide</TooltipContent>
        </Tooltip>
        <div className={cn("flex items-center justify-between", collapsed && "justify-center")}>
          {!collapsed ? <span className="px-2 font-mono text-[10px] text-muted-foreground">{APP_VERSION ? `v${APP_VERSION}` : ""}</span> : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="size-8 text-muted-foreground">
                {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand" : "Collapse"} sidebar · ⌘B</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
