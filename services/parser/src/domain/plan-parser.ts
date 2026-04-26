import { randomUUID } from "node:crypto";
import { ChangeAction, type GraphEdge, type GraphModel, type GraphNode } from "@terraform-viz/graph-schema";
import { classifyResource } from "./layer-classifier.js";
import type {
  TerraformModule,
  TerraformPlan,
  TerraformResource,
  TerraformResourceChange,
} from "./terraform-plan.types.js";

function flattenResources(
  module: TerraformModule,
  moduleAddress: string | null,
): { resource: TerraformResource; moduleAddress: string | null }[] {
  const result: { resource: TerraformResource; moduleAddress: string | null }[] = [];

  for (const resource of module.resources ?? []) {
    result.push({ resource, moduleAddress });
  }

  for (const child of module.child_modules ?? []) {
    result.push(...flattenResources(child, child.address));
  }

  return result;
}

function resolveChangeAction(
  address: string,
  changes: readonly TerraformResourceChange[],
): ChangeAction {
  const change = changes.find((c) => c.address === address);
  if (!change) return ChangeAction.NO_OP;

  const { actions } = change.change;
  if (actions.includes("create") && actions.includes("delete")) return ChangeAction.REPLACE;
  if (actions.includes("create")) return ChangeAction.CREATE;
  if (actions.includes("delete")) return ChangeAction.DELETE;
  if (actions.includes("update")) return ChangeAction.UPDATE;
  return ChangeAction.NO_OP;
}

function buildNode(
  resource: TerraformResource,
  changeAction: ChangeAction,
  moduleAddress: string | null,
): GraphNode {
  const { provider, layer } = classifyResource(resource.type);
  return {
    id: resource.address,
    address: resource.address,
    type: resource.type,
    name: resource.name,
    provider,
    layer,
    attributes: resource.values,
    changeAction,
    moduleAddress,
  };
}

function buildEdges(
  entries: { resource: TerraformResource; moduleAddress: string | null }[],
): GraphEdge[] {
  return entries.flatMap(({ resource }) =>
    (resource.depends_on ?? []).map((dep) => ({
      source: dep,
      target: resource.address,
    })),
  );
}

function getRootModule(plan: TerraformPlan): TerraformModule {
  const root = plan.planned_values?.root_module ?? plan.values?.root_module;
  if (!root) throw new Error("No root module found in Terraform plan JSON");
  return root;
}

export function buildGraphModel(plan: TerraformPlan): GraphModel {
  const rootModule = getRootModule(plan);
  const entries = flattenResources(rootModule, null);
  const resourceChanges = plan.resource_changes ?? [];

  const nodes = entries.map(({ resource, moduleAddress }) =>
    buildNode(resource, resolveChangeAction(resource.address, resourceChanges), moduleAddress),
  );

  const edges = buildEdges(entries).filter((edge) =>
    nodes.some((node) => node.id === edge.source),
  );

  return {
    id: randomUUID(),
    nodes,
    edges,
    terraformVersion: plan.terraform_version,
    createdAt: new Date().toISOString(),
  };
}
