export enum ResourceLayer {
  NETWORK = "NETWORK",
  COMPUTE = "COMPUTE",
  DATABASE = "DATABASE",
  STORAGE = "STORAGE",
  DATA = "DATA",
  UNKNOWN = "UNKNOWN",
}

export enum CloudProvider {
  AWS = "AWS",
  AZURE = "AZURE",
  GCP = "GCP",
  UNKNOWN = "UNKNOWN",
}

export enum ChangeAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  REPLACE = "REPLACE",
  NO_OP = "NO_OP",
}

export interface GraphNode {
  readonly id: string;
  readonly address: string;
  readonly type: string;
  readonly name: string;
  readonly provider: CloudProvider;
  readonly layer: ResourceLayer;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly changeAction: ChangeAction;
  readonly moduleAddress: string | null;
}

export interface GraphEdge {
  readonly source: string;
  readonly target: string;
}

export interface GraphModel {
  readonly id: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly terraformVersion: string;
  readonly createdAt: string;
}
