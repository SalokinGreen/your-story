import { GM_TOOL_SCHEMAS } from "@/app/misc/gmTools";

/** Every `action` value of the manage_feats schema, as the GM is offered them. */
export function manageFeatsActions(): string[] {
  const tool = GM_TOOL_SCHEMAS.find((t) => t.function.name === "manage_feats");
  const action = (tool?.function.parameters.properties as Record<string, { enum?: string[] }>)
    .action;
  return action.enum ?? [];
}
