/**
 * lib/icons.tsx — Capability → lucide icon mapping for the sidebar/nav.
 */

import {
  createLucideIcon,
  GitBranch,
  FolderTree,
  Settings,
  Boxes,
  type LucideIcon,
} from "lucide-react";

const ForkUtensil = createLucideIcon("ForkUtensil", [
  ["path", { d: "M7 2v6a5 5 0 0 0 10 0V2", key: "tines" }],
  ["path", { d: "M12 2v20", key: "handle" }],
]);

const CAP_ICONS: Record<string, LucideIcon> = {
  fork: ForkUtensil,
  git: GitBranch,
  init: FolderTree,
  settings: Settings,
};

/** Icon for a capability id, falling back to a generic box glyph. */
export function capabilityIcon(id: string): LucideIcon {
  return CAP_ICONS[id] ?? Boxes;
}
