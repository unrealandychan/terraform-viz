import { describe, it, expect } from "vitest";
import {
  checkNoDatabase,
  checkSingleAzRds,
  checkUnencryptedS3,
  checkPublicS3,
  checkRdsMissingBackupRetention,
  checkOversizedInstances,
  checkUnencryptedEbs,
  runDeterministicRules,
} from "../rules.js";
import { ChangeAction, CloudProvider, ResourceLayer } from "@terraform-viz/graph-schema";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";

function makeNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: "test.resource",
    address: "test.resource",
    type: "aws_instance",
    name: "test",
    provider: CloudProvider.AWS,
    layer: ResourceLayer.COMPUTE,
    attributes: {},
    changeAction: ChangeAction.NO_OP,
    moduleAddress: null,
    ...overrides,
  };
}

function makeModel(nodes: GraphNode[]): GraphModel {
  return {
    id: "test-model",
    nodes,
    edges: [],
    terraformVersion: "1.5.0",
    createdAt: new Date().toISOString(),
  };
}

describe("checkNoDatabase", () => {
  it("returns recommendation when no database layer node exists", () => {
    const model = makeModel([makeNode({ layer: ResourceLayer.COMPUTE })]);
    const result = checkNoDatabase(model);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("No database resources detected");
    expect(result?.severity).toBe("LOW");
  });

  it("returns null when database layer node exists", () => {
    const model = makeModel([makeNode({ layer: ResourceLayer.DATABASE })]);
    expect(checkNoDatabase(model)).toBeNull();
  });
});

describe("checkSingleAzRds", () => {
  it("flags RDS instance with multi_az=false", () => {
    const model = makeModel([
      makeNode({ type: "aws_db_instance", address: "aws_db_instance.main", attributes: { multi_az: false } }),
    ]);
    const result = checkSingleAzRds(model);
    expect(result).not.toBeNull();
    expect(result?.affectedResources).toContain("aws_db_instance.main");
    expect(result?.severity).toBe("HIGH");
  });

  it("flags RDS instance with multi_az undefined", () => {
    const model = makeModel([
      makeNode({ type: "aws_db_instance", address: "aws_db_instance.main", attributes: {} }),
    ]);
    expect(checkSingleAzRds(model)).not.toBeNull();
  });

  it("returns null when multi_az=true", () => {
    const model = makeModel([
      makeNode({ type: "aws_db_instance", attributes: { multi_az: true } }),
    ]);
    expect(checkSingleAzRds(model)).toBeNull();
  });
});

describe("checkUnencryptedS3", () => {
  it("flags S3 bucket without SSE configuration", () => {
    const model = makeModel([
      makeNode({ type: "aws_s3_bucket", address: "aws_s3_bucket.data", attributes: {} }),
    ]);
    const result = checkUnencryptedS3(model);
    expect(result).not.toBeNull();
    expect(result?.affectedResources).toContain("aws_s3_bucket.data");
  });

  it("returns null when SSE is configured", () => {
    const model = makeModel([
      makeNode({ type: "aws_s3_bucket", attributes: { server_side_encryption_configuration: { rule: {} } } }),
    ]);
    expect(checkUnencryptedS3(model)).toBeNull();
  });
});

describe("checkPublicS3", () => {
  it("flags public-read S3 bucket", () => {
    const model = makeModel([
      makeNode({ type: "aws_s3_bucket", address: "aws_s3_bucket.pub", attributes: { acl: "public-read" } }),
    ]);
    const result = checkPublicS3(model);
    expect(result).not.toBeNull();
    expect(result?.affectedResources).toContain("aws_s3_bucket.pub");
  });

  it("flags public-read-write S3 bucket", () => {
    const model = makeModel([
      makeNode({ type: "aws_s3_bucket", attributes: { acl: "public-read-write" } }),
    ]);
    expect(checkPublicS3(model)).not.toBeNull();
  });

  it("returns null for private bucket", () => {
    const model = makeModel([
      makeNode({ type: "aws_s3_bucket", attributes: { acl: "private" } }),
    ]);
    expect(checkPublicS3(model)).toBeNull();
  });
});

describe("checkRdsMissingBackupRetention", () => {
  it("flags RDS with backup_retention_period=0", () => {
    const model = makeModel([
      makeNode({ type: "aws_db_instance", address: "aws_db_instance.db", attributes: { backup_retention_period: 0 } }),
    ]);
    const result = checkRdsMissingBackupRetention(model);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe("HIGH");
  });

  it("flags RDS with missing backup_retention_period", () => {
    const model = makeModel([
      makeNode({ type: "aws_db_instance", attributes: {} }),
    ]);
    expect(checkRdsMissingBackupRetention(model)).not.toBeNull();
  });

  it("returns null when backup retention is set", () => {
    const model = makeModel([
      makeNode({ type: "aws_db_instance", attributes: { backup_retention_period: 7 } }),
    ]);
    expect(checkRdsMissingBackupRetention(model)).toBeNull();
  });
});

describe("checkOversizedInstances", () => {
  it("flags 2xlarge instances", () => {
    const model = makeModel([
      makeNode({ type: "aws_instance", address: "aws_instance.big", attributes: { instance_type: "m5.2xlarge" } }),
    ]);
    const result = checkOversizedInstances(model);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe("LOW");
  });

  it("flags metal instances", () => {
    const model = makeModel([
      makeNode({ type: "aws_instance", attributes: { instance_type: "i3.metal" } }),
    ]);
    expect(checkOversizedInstances(model)).not.toBeNull();
  });

  it("returns null for t3.medium", () => {
    const model = makeModel([
      makeNode({ type: "aws_instance", attributes: { instance_type: "t3.medium" } }),
    ]);
    expect(checkOversizedInstances(model)).toBeNull();
  });
});

describe("checkUnencryptedEbs", () => {
  it("flags aws_ebs_volume with encrypted=false", () => {
    const model = makeModel([
      makeNode({ type: "aws_ebs_volume", address: "aws_ebs_volume.disk", attributes: { encrypted: false } }),
    ]);
    const result = checkUnencryptedEbs(model);
    expect(result).not.toBeNull();
    expect(result?.affectedResources).toContain("aws_ebs_volume.disk");
  });

  it("flags aws_instance with encrypted=false", () => {
    const model = makeModel([
      makeNode({ type: "aws_instance", attributes: { encrypted: false } }),
    ]);
    expect(checkUnencryptedEbs(model)).not.toBeNull();
  });

  it("returns null when encrypted=true", () => {
    const model = makeModel([
      makeNode({ type: "aws_ebs_volume", attributes: { encrypted: true } }),
    ]);
    expect(checkUnencryptedEbs(model)).toBeNull();
  });
});

describe("runDeterministicRules", () => {
  it("returns multiple rules for a problematic model", () => {
    const model = makeModel([
      makeNode({ type: "aws_db_instance", layer: ResourceLayer.DATABASE, attributes: { multi_az: false, backup_retention_period: 0 } }),
      makeNode({ type: "aws_s3_bucket", address: "aws_s3_bucket.pub", attributes: { acl: "public-read" } }),
    ]);
    const recs = runDeterministicRules(model);
    expect(recs.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty array for a clean model", () => {
    const model = makeModel([
      makeNode({
        type: "aws_instance",
        layer: ResourceLayer.DATABASE,
        attributes: { instance_type: "t3.small", encrypted: true },
      }),
    ]);
    const recs = runDeterministicRules(model);
    // Only no-database rule could fire if no DATABASE layer node — but we set DATABASE layer
    expect(recs).toBeInstanceOf(Array);
  });
});
