import type { GraphModel } from "@terraform-viz/graph-schema";
import { ResourceLayer } from "@terraform-viz/graph-schema";
import {
  RecommendationCategory,
  RecommendationSeverity,
  RecommendationSource,
  type Recommendation,
} from "@terraform-viz/llm-types";
import { randomUUID } from "node:crypto";

export function checkNoDatabase(model: GraphModel): Recommendation | null {
  const hasDatabase = model.nodes.some((n) => n.layer === ResourceLayer.DATABASE);
  if (hasDatabase) return null;
  return {
    id: randomUUID(),
    title: "No database resources detected",
    description:
      "The plan contains no managed database resources. If your application requires persistent storage, consider adding a managed DB such as RDS, Azure SQL, or Cloud SQL.",
    category: RecommendationCategory.RELIABILITY,
    source: RecommendationSource.ARCHITECTURAL_HEURISTIC,
    severity: RecommendationSeverity.LOW,
    affectedResources: [],
    estimatedMonthlySavingsUsd: null,
  };
}

export function checkSingleAzRds(model: GraphModel): Recommendation | null {
  const singleAzInstances = model.nodes.filter(
    (n) =>
      n.type === "aws_db_instance" &&
      (n.attributes["multi_az"] === false || n.attributes["multi_az"] === undefined),
  );
  if (singleAzInstances.length === 0) return null;
  return {
    id: randomUUID(),
    title: "RDS instances not configured for Multi-AZ",
    description:
      `${singleAzInstances.length} RDS instance(s) have multi_az disabled or unset. ` +
      "Enabling Multi-AZ improves availability and provides automatic failover.",
    category: RecommendationCategory.RELIABILITY,
    source: RecommendationSource.TERRAFORM_DIFF,
    severity: RecommendationSeverity.HIGH,
    affectedResources: singleAzInstances.map((n) => n.address),
    estimatedMonthlySavingsUsd: null,
  };
}

export function checkUnencryptedS3(model: GraphModel): Recommendation | null {
  const unencrypted = model.nodes.filter(
    (n) => n.type === "aws_s3_bucket" && !n.attributes["server_side_encryption_configuration"],
  );
  if (unencrypted.length === 0) return null;
  return {
    id: randomUUID(),
    title: "S3 buckets missing server-side encryption",
    description:
      `${unencrypted.length} S3 bucket(s) have no server_side_encryption_configuration. ` +
      "Enable SSE-S3 or SSE-KMS to encrypt data at rest.",
    category: RecommendationCategory.RELIABILITY,
    source: RecommendationSource.TERRAFORM_DIFF,
    severity: RecommendationSeverity.HIGH,
    affectedResources: unencrypted.map((n) => n.address),
    estimatedMonthlySavingsUsd: null,
  };
}

export function checkPublicS3(model: GraphModel): Recommendation | null {
  const publicBuckets = model.nodes.filter(
    (n) =>
      n.type === "aws_s3_bucket" &&
      (n.attributes["acl"] === "public-read" || n.attributes["acl"] === "public-read-write"),
  );
  if (publicBuckets.length === 0) return null;
  return {
    id: randomUUID(),
    title: "S3 buckets with public ACL",
    description:
      `${publicBuckets.length} S3 bucket(s) are configured with a public ACL. ` +
      "Unless intentional (e.g. static website), restrict access to prevent data exposure.",
    category: RecommendationCategory.RELIABILITY,
    source: RecommendationSource.TERRAFORM_DIFF,
    severity: RecommendationSeverity.HIGH,
    affectedResources: publicBuckets.map((n) => n.address),
    estimatedMonthlySavingsUsd: null,
  };
}

export function checkRdsMissingBackupRetention(model: GraphModel): Recommendation | null {
  const noBackup = model.nodes.filter(
    (n) =>
      n.type === "aws_db_instance" &&
      (n.attributes["backup_retention_period"] === 0 ||
        n.attributes["backup_retention_period"] === undefined),
  );
  if (noBackup.length === 0) return null;
  return {
    id: randomUUID(),
    title: "RDS instances missing backup retention",
    description:
      `${noBackup.length} RDS instance(s) have backup_retention_period set to 0 or unset. ` +
      "Set a retention period of at least 7 days to enable point-in-time recovery.",
    category: RecommendationCategory.RELIABILITY,
    source: RecommendationSource.TERRAFORM_DIFF,
    severity: RecommendationSeverity.HIGH,
    affectedResources: noBackup.map((n) => n.address),
    estimatedMonthlySavingsUsd: null,
  };
}

export function checkOversizedInstances(model: GraphModel): Recommendation | null {
  const oversized = model.nodes.filter(
    (n) =>
      n.type === "aws_instance" &&
      typeof n.attributes["instance_type"] === "string" &&
      /\.(2xlarge|4xlarge|8xlarge|16xlarge|32xlarge|metal)$/.test(
        n.attributes["instance_type"],
      ),
  );
  if (oversized.length === 0) return null;
  return {
    id: randomUUID(),
    title: "Potentially oversized EC2 instances",
    description:
      `${oversized.length} EC2 instance(s) use 2xlarge or larger instance types. ` +
      "Review whether these sizes are required; right-sizing can reduce costs significantly.",
    category: RecommendationCategory.RELIABILITY,
    source: RecommendationSource.TERRAFORM_DIFF,
    severity: RecommendationSeverity.LOW,
    affectedResources: oversized.map((n) => n.address),
    estimatedMonthlySavingsUsd: null,
  };
}

export function checkUnencryptedEbs(model: GraphModel): Recommendation | null {
  const unencrypted = model.nodes.filter(
    (n) =>
      (n.type === "aws_ebs_volume" || n.type === "aws_instance") &&
      n.attributes["encrypted"] === false,
  );
  if (unencrypted.length === 0) return null;
  return {
    id: randomUUID(),
    title: "Unencrypted EBS volumes",
    description:
      `${unencrypted.length} EBS volume(s) or instance root volumes have encryption disabled. ` +
      "Enable EBS encryption to protect data at rest.",
    category: RecommendationCategory.RELIABILITY,
    source: RecommendationSource.TERRAFORM_DIFF,
    severity: RecommendationSeverity.HIGH,
    affectedResources: unencrypted.map((n) => n.address),
    estimatedMonthlySavingsUsd: null,
  };
}

export function runDeterministicRules(model: GraphModel): Recommendation[] {
  return [
    checkNoDatabase(model),
    checkSingleAzRds(model),
    checkUnencryptedS3(model),
    checkPublicS3(model),
    checkRdsMissingBackupRetention(model),
    checkOversizedInstances(model),
    checkUnencryptedEbs(model),
  ].filter((r): r is Recommendation => r !== null);
}
