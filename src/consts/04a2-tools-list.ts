import { TOOL_LIST_A } from "./04a2a-tools-list-a";
import { TOOL_LIST_B } from "./04a2b-tools-list-b";
import type { ToolEntry } from "./04a1-tools-meta";

export const TOOL_LIST: ToolEntry[] = [...TOOL_LIST_A, ...TOOL_LIST_B];

/** Look up a tool by its href. Throws at build time if the href is unknown. */
export function getTool(href: string): ToolEntry {
  const tool = TOOL_LIST.find((t) => t.href === href);
  if (!tool) throw new Error(`Unknown tool href: ${href}`);
  return tool;
}

/** Latest `updated` date across all live tools (used for the /tools/ hub). */
export const TOOLS_UPDATED: string = TOOL_LIST.filter(
  (t) => t.status === "live",
)
  .map((t) => t.updated)
  .sort()
  .at(-1) as string;
