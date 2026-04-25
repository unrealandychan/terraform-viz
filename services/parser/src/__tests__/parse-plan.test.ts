import { describe, it, expect } from "vitest";
import { parsePlanUseCase } from "../application/parse-plan.use-case.js";

// Minimal valid Terraform plan fixture
const MIN_VALID_PLAN = {
  format_version: "1.0",
  terraform_version: "1.5.0",
  planned_values: {
    root_module: {
      resources: [
        {
          address: "aws_s3_bucket.example",
          mode: "managed",
          type: "aws_s3_bucket",
          name: "example",
          provider_name: "registry.terraform.io/hashicorp/aws",
          schema_version: 0,
          values: { bucket: "my-test-bucket" },
        },
      ],
    },
  },
  resource_changes: [
    {
      address: "aws_s3_bucket.example",
      mode: "managed",
      type: "aws_s3_bucket",
      name: "example",
      provider_name: "registry.terraform.io/hashicorp/aws",
      change: { actions: ["create"], before: null, after: { bucket: "my-test-bucket" } },
    },
  ],
};

// Multi-resource plan with a child module
const MULTI_RESOURCE_PLAN = {
  format_version: "1.0",
  terraform_version: "1.5.0",
  planned_values: {
    root_module: {
      resources: [
        {
          address: "aws_vpc.main",
          mode: "managed",
          type: "aws_vpc",
          name: "main",
          provider_name: "registry.terraform.io/hashicorp/aws",
          schema_version: 0,
          values: { cidr_block: "10.0.0.0/16" },
        },
        {
          address: "aws_instance.web",
          mode: "managed",
          type: "aws_instance",
          name: "web",
          provider_name: "registry.terraform.io/hashicorp/aws",
          schema_version: 0,
          values: { instance_type: "t3.micro" },
          depends_on: ["aws_vpc.main"],
        },
      ],
    },
  },
  resource_changes: [
    {
      address: "aws_vpc.main",
      mode: "managed",
      type: "aws_vpc",
      name: "main",
      provider_name: "registry.terraform.io/hashicorp/aws",
      change: { actions: ["create"], before: null, after: { cidr_block: "10.0.0.0/16" } },
    },
    {
      address: "aws_instance.web",
      mode: "managed",
      type: "aws_instance",
      name: "web",
      provider_name: "registry.terraform.io/hashicorp/aws",
      change: { actions: ["create"], before: null, after: { instance_type: "t3.micro" } },
    },
  ],
};

describe("parsePlanUseCase", () => {
  describe("validation guards", () => {
    it("rejects null input", () => {
      const result = parsePlanUseCase(null);
      expect(result.success).toBe(false);
    });

    it("rejects plain string input", () => {
      const result = parsePlanUseCase("not a plan");
      expect(result.success).toBe(false);
    });

    it("rejects empty object", () => {
      const result = parsePlanUseCase({});
      expect(result.success).toBe(false);
    });

    it("rejects plan missing terraform_version", () => {
      const result = parsePlanUseCase({
        format_version: "1.0",
        planned_values: { root_module: { resources: [] } },
      });
      expect(result.success).toBe(false);
    });

    it("rejects plan missing format_version", () => {
      const result = parsePlanUseCase({
        terraform_version: "1.5.0",
        planned_values: { root_module: { resources: [] } },
      });
      expect(result.success).toBe(false);
    });

    it("rejects plan missing both planned_values and values", () => {
      const result = parsePlanUseCase({
        format_version: "1.0",
        terraform_version: "1.5.0",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("successful parse", () => {
    it("returns success for a minimal valid plan", () => {
      const result = parsePlanUseCase(MIN_VALID_PLAN);
      expect(result.success).toBe(true);
    });

    it("includes a GraphModel with nodes", () => {
      const result = parsePlanUseCase(MIN_VALID_PLAN);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(Array.isArray(result.data.nodes)).toBe(true);
      expect(result.data.nodes.length).toBe(1);
    });

    it("sets node id equal to resource address", () => {
      const result = parsePlanUseCase(MIN_VALID_PLAN);
      if (!result.success) throw new Error("Expected success");
      const node = result.data.nodes[0];
      if (!node) throw new Error("Expected a node");
      expect(node.id).toBe("aws_s3_bucket.example");
      expect(node.address).toBe("aws_s3_bucket.example");
    });

    it("classifies aws_s3_bucket as STORAGE / AWS", () => {
      const result = parsePlanUseCase(MIN_VALID_PLAN);
      if (!result.success) throw new Error("Expected success");
      const node = result.data.nodes[0];
      if (!node) throw new Error("Expected a node");
      expect(node.layer).toBe("STORAGE");
      expect(node.provider).toBe("AWS");
    });

    it("sets changeAction CREATE for a new resource", () => {
      const result = parsePlanUseCase(MIN_VALID_PLAN);
      if (!result.success) throw new Error("Expected success");
      const node = result.data.nodes[0];
      if (!node) throw new Error("Expected a node");
      expect(node.changeAction).toBe("CREATE");
    });

    it("includes terraformVersion on the model", () => {
      const result = parsePlanUseCase(MIN_VALID_PLAN);
      if (!result.success) throw new Error("Expected success");
      expect(result.data.terraformVersion).toBe("1.5.0");
    });
  });

  describe("multi-resource plan", () => {
    it("parses two resources", () => {
      const result = parsePlanUseCase(MULTI_RESOURCE_PLAN);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.nodes.length).toBe(2);
    });

    it("classifies aws_vpc as NETWORK", () => {
      const result = parsePlanUseCase(MULTI_RESOURCE_PLAN);
      if (!result.success) throw new Error("Expected success");
      const vpc = result.data.nodes.find((n) => n.type === "aws_vpc");
      expect(vpc?.layer).toBe("NETWORK");
    });

    it("classifies aws_instance as COMPUTE", () => {
      const result = parsePlanUseCase(MULTI_RESOURCE_PLAN);
      if (!result.success) throw new Error("Expected success");
      const inst = result.data.nodes.find((n) => n.type === "aws_instance");
      expect(inst?.layer).toBe("COMPUTE");
    });

    it("generates edges for depends_on relationships", () => {
      const result = parsePlanUseCase(MULTI_RESOURCE_PLAN);
      if (!result.success) throw new Error("Expected success");
      // The web instance depends on vpc → edge: { source: "aws_vpc.main", target: "aws_instance.web" }
      expect(result.data.edges.length).toBeGreaterThanOrEqual(1);
      const edge = result.data.edges.find(
        (e) => e.source === "aws_vpc.main" && e.target === "aws_instance.web",
      );
      expect(edge).toBeDefined();
    });
  });
});
