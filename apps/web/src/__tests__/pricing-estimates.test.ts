import { describe, it, expect } from "vitest";
import { estimateCost, totalMonthlyCost, costByProvider } from "../lib/pricing-estimates";
import { CloudProvider, ResourceLayer, ChangeAction } from "@terraform-viz/graph-schema";
import type { GraphNode } from "@terraform-viz/graph-schema";

function makeNode(type: string, attrs: Record<string, unknown> = {}, provider = CloudProvider.AWS): GraphNode {
  return {
    id: `${type}.test`,
    address: `${type}.test`,
    type,
    name: "test",
    provider,
    layer: ResourceLayer.UNKNOWN,
    attributes: attrs,
    changeAction: ChangeAction.CREATE,
    moduleAddress: null,
  };
}

describe("estimateCost", () => {
  describe("free resources return monthly:0", () => {
    const freeTypes: string[] = [
      "aws_vpc",
      "aws_subnet",
      "aws_internet_gateway",
      "aws_security_group",
      "aws_security_group_rule",
      "aws_route_table",
      "aws_route_table_association",
      "aws_iam_role",
      "aws_iam_policy",
      "aws_acm_certificate",
      "aws_s3_bucket_policy",
      "aws_s3_bucket_public_access_block",
      "aws_ecs_cluster",
      "aws_ecs_task_definition",
      "aws_ecs_service",
      "aws_lambda_event_source_mapping",
      "aws_lb_listener",
      "aws_lb_target_group",
      "aws_cloudfront_origin_access_control",
      "aws_api_gateway_stage",
      "aws_apigatewayv2_stage",
      "aws_cloudwatch_event_rule",
      "aws_kms_alias",
      "azurerm_resource_group",
      "azurerm_virtual_network",
      "azurerm_subnet",
      "azurerm_network_security_group",
      "azurerm_key_vault_secret",
      "azurerm_role_assignment",
      "azurerm_servicebus_queue",
      "google_compute_network",
      "google_compute_subnetwork",
      "google_compute_firewall",
      "google_service_account",
      "google_project_iam_binding",
      "google_kms_key_ring",
      "google_dns_record_set",
    ];

    for (const type of freeTypes) {
      it(`${type} costs $0`, () => {
        const node = makeNode(type);
        const result = estimateCost(node);
        expect(result.monthly).toBe(0);
        expect(result.label).toBe("$0 (free)");
      });
    }
  });

  describe("priced resources return correct monthly cost", () => {
    it("aws_nat_gateway costs $36.50", () => {
      expect(estimateCost(makeNode("aws_nat_gateway")).monthly).toBe(36.5);
    });

    it("aws_lb costs $22.27 (default ALB)", () => {
      expect(estimateCost(makeNode("aws_lb")).monthly).toBe(22.27);
    });

    it("aws_lb with load_balancer_type='network' costs $13.14", () => {
      expect(estimateCost(makeNode("aws_lb", { load_balancer_type: "network" })).monthly).toBe(13.14);
    });

    it("aws_ebs_volume with no attrs defaults to gp2 rate = $2.00", () => {
      expect(estimateCost(makeNode("aws_ebs_volume")).monthly).toBeCloseTo(2.00, 5);
    });

    it("aws_ebs_volume size=100, type=gp3 = $8.00", () => {
      expect(estimateCost(makeNode("aws_ebs_volume", { size: 100, volume_type: "gp3" })).monthly).toBeCloseTo(8.00, 5);
    });

    it("aws_ebs_volume size=100, type=gp2 = $10.00", () => {
      expect(estimateCost(makeNode("aws_ebs_volume", { size: 100, volume_type: "gp2" })).monthly).toBeCloseTo(10.00, 5);
    });

    it("aws_ebs_volume size=100, type=st1 = $4.50", () => {
      expect(estimateCost(makeNode("aws_ebs_volume", { size: 100, volume_type: "st1" })).monthly).toBeCloseTo(4.50, 5);
    });

    it("aws_ebs_volume size=100, type=io1, iops=3000 = $207.50", () => {
      expect(estimateCost(makeNode("aws_ebs_volume", { size: 100, volume_type: "io1", iops: 3000 })).monthly).toBeCloseTo(207.50, 5);
    });

    it("aws_route53_zone costs $0.50", () => {
      expect(estimateCost(makeNode("aws_route53_zone")).monthly).toBe(0.5);
    });

    it("aws_cloudwatch_log_group: default 1GB ingestion + 90d retention", () => {
      // 1 GB ingestion × $0.50 + (1 × 90/30) GB stored × $0.03 = $0.50 + $0.09 = $0.59
      expect(estimateCost(makeNode("aws_cloudwatch_log_group")).monthly).toBeCloseTo(0.59, 2);
    });

    it("aws_cloudwatch_log_group: scales with ingestion GB", () => {
      const node = makeNode("aws_cloudwatch_log_group");
      node.attributes["_usage_ingestion_gb_mo"] = 100;
      node.attributes["retention_in_days"] = 30;
      // 100 GB ingestion × $0.50 + 100 GB stored × $0.03 = $50 + $3 = $53
      expect(estimateCost(node).monthly).toBeCloseTo(53, 1);
    });

    it("aws_cloudwatch_log_group: never-expire uses 90d default", () => {
      const node = makeNode("aws_cloudwatch_log_group");
      node.attributes["retention_in_days"] = 0; // never expire → use 90d estimate
      node.attributes["_usage_ingestion_gb_mo"] = 10;
      // 10 × $0.50 + (10 × 3) × $0.03 = $5 + $0.90 = $5.90
      expect(estimateCost(node).monthly).toBeCloseTo(5.90, 2);
    });

    it("aws_cloudwatch_metric_alarm costs $0.10", () => {
      expect(estimateCost(makeNode("aws_cloudwatch_metric_alarm")).monthly).toBe(0.1);
    });

    it("aws_cloudwatch_dashboard costs $3.00", () => {
      expect(estimateCost(makeNode("aws_cloudwatch_dashboard")).monthly).toBe(3.0);
    });

    it("aws_kms_key costs $1.00", () => {
      expect(estimateCost(makeNode("aws_kms_key")).monthly).toBe(1.0);
    });

    it("aws_secretsmanager_secret costs $0.40", () => {
      expect(estimateCost(makeNode("aws_secretsmanager_secret")).monthly).toBe(0.4);
    });

    it("aws_apigatewayv2_api costs $1.00", () => {
      expect(estimateCost(makeNode("aws_apigatewayv2_api")).monthly).toBe(1.0);
    });

    it("aws_api_gateway_rest_api costs $3.50 (1M calls default)", () => {
      expect(estimateCost(makeNode("aws_api_gateway_rest_api")).monthly).toBe(3.5);
    });

    it("azurerm_public_ip costs $3.65", () => {
      expect(estimateCost(makeNode("azurerm_public_ip", {}, CloudProvider.AZURE)).monthly).toBe(3.65);
    });

    it("azurerm_load_balancer costs $18.25", () => {
      expect(estimateCost(makeNode("azurerm_load_balancer", {}, CloudProvider.AZURE)).monthly).toBe(18.25);
    });

    it("azurerm_key_vault costs $5.00", () => {
      expect(estimateCost(makeNode("azurerm_key_vault", {}, CloudProvider.AZURE)).monthly).toBe(5.0);
    });

    it("azurerm_dns_zone costs $0.90", () => {
      expect(estimateCost(makeNode("azurerm_dns_zone", {}, CloudProvider.AZURE)).monthly).toBe(0.9);
    });

    it("azurerm_servicebus_namespace costs $10", () => {
      expect(estimateCost(makeNode("azurerm_servicebus_namespace", {}, CloudProvider.AZURE)).monthly).toBe(10);
    });

    it("azurerm_eventgrid_topic costs $0.60", () => {
      expect(estimateCost(makeNode("azurerm_eventgrid_topic", {}, CloudProvider.AZURE)).monthly).toBe(0.6);
    });

    it("google_compute_address costs $7.30", () => {
      expect(estimateCost(makeNode("google_compute_address", {}, CloudProvider.GCP)).monthly).toBe(7.3);
    });

    it("google_compute_forwarding_rule costs $18.25", () => {
      expect(estimateCost(makeNode("google_compute_forwarding_rule", {}, CloudProvider.GCP)).monthly).toBe(18.25);
    });

    it("google_dns_managed_zone costs $0.20", () => {
      expect(estimateCost(makeNode("google_dns_managed_zone", {}, CloudProvider.GCP)).monthly).toBe(0.2);
    });

    it("google_secret_manager_secret costs $0.06", () => {
      expect(estimateCost(makeNode("google_secret_manager_secret", {}, CloudProvider.GCP)).monthly).toBe(0.06);
    });

    it("google_kms_crypto_key costs $6.00", () => {
      expect(estimateCost(makeNode("google_kms_crypto_key", {}, CloudProvider.GCP)).monthly).toBe(6.0);
    });
  });

  describe("unknown resource type", () => {
    it("returns monthly:null for an unrecognised type", () => {
      const result = estimateCost(makeNode("some_unknown_type_xyz"));
      expect(result.monthly).toBeNull();
      expect(result.breakdown).toBeNull();
    });
  });

  describe("breakdown strings", () => {
    it("provides a breakdown string for aws_kms_key", () => {
      const result = estimateCost(makeNode("aws_kms_key"));
      expect(typeof result.breakdown).toBe("string");
      expect(result.breakdown!.length).toBeGreaterThan(0);
    });

    it("provides a breakdown string for aws_nat_gateway", () => {
      const result = estimateCost(makeNode("aws_nat_gateway"));
      expect(typeof result.breakdown).toBe("string");
    });

    it("provides a breakdown string for azurerm_load_balancer", () => {
      const result = estimateCost(makeNode("azurerm_load_balancer", {}, CloudProvider.AZURE));
      expect(typeof result.breakdown).toBe("string");
    });
  });
});

describe("totalMonthlyCost", () => {
  it("sums costs across multiple nodes", () => {
    const nodes: GraphNode[] = [
      makeNode("aws_nat_gateway"),  // 36.50
      makeNode("aws_lb"),            // 22.27
      makeNode("aws_vpc"),           // 0
    ];
    expect(totalMonthlyCost(nodes)).toBeCloseTo(58.77, 2);
  });

  it("returns 0 for an empty array", () => {
    expect(totalMonthlyCost([])).toBe(0);
  });

  it("treats unknown types as 0 (null coalesced)", () => {
    const nodes: GraphNode[] = [makeNode("some_unknown_xyz"), makeNode("aws_vpc")];
    expect(totalMonthlyCost(nodes)).toBe(0);
  });
});

describe("costByProvider", () => {
  it("groups costs by provider", () => {
    const nodes: GraphNode[] = [
      makeNode("aws_nat_gateway"),                               // AWS 36.50
      makeNode("azurerm_load_balancer", {}, CloudProvider.AZURE), // AZURE 18.25
      makeNode("google_compute_address", {}, CloudProvider.GCP),  // GCP 7.30
    ];
    const result = costByProvider(nodes);
    const awsEntry = result.find((e) => e.provider === CloudProvider.AWS);
    const azureEntry = result.find((e) => e.provider === CloudProvider.AZURE);
    const gcpEntry = result.find((e) => e.provider === CloudProvider.GCP);
    expect(awsEntry?.monthly).toBeCloseTo(36.5, 2);
    expect(azureEntry?.monthly).toBeCloseTo(18.25, 2);
    expect(gcpEntry?.monthly).toBeCloseTo(7.3, 2);
  });

  it("excludes providers with zero total", () => {
    const nodes: GraphNode[] = [
      makeNode("aws_vpc"),      // 0
      makeNode("aws_subnet"),   // 0
    ];
    expect(costByProvider(nodes)).toHaveLength(0);
  });

  it("sorts by cost descending", () => {
    const nodes: GraphNode[] = [
      makeNode("google_compute_address", {}, CloudProvider.GCP),  // 7.30
      makeNode("aws_nat_gateway"),                                  // 36.50
    ];
    const result = costByProvider(nodes);
    expect(result[0].provider).toBe(CloudProvider.AWS);
  });
});
