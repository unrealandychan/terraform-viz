import { describe, it, expect } from 'vitest';
import { estimateCost, totalMonthlyCost, costByProvider } from '@terraform-viz/pricing-engine';
import { CloudProvider, ChangeAction, ResourceLayer } from '@terraform-viz/graph-schema';
import type { GraphNode } from '@terraform-viz/graph-schema';

function node(
  type: string,
  attributes: Record<string, unknown> = {},
  provider = CloudProvider.AWS,
): GraphNode {
  return {
    id: `n-${type}`,
    address: `aws_resource.${type}`,
    type,
    name: type,
    provider,
    layer: ResourceLayer.COMPUTE,
    changeAction: ChangeAction.NO_OP,
    attributes: attributes,
    moduleAddress: null,
  };
}

// ── estimateCost ─────────────────────────────────────────────────────────────

describe('estimateCost – unknown resource type', () => {
  it('returns monthly: null for unknown type', () => {
    const result = estimateCost(node('unknown_resource_xyz'));
    expect(result.monthly).toBeNull();
  });
  it('returns annual: null for unknown type', () => {
    expect(estimateCost(node('mystery_type')).annual).toBeNull();
  });
  it('returns label "Unknown" for unknown type', () => {
    expect(estimateCost(node('not_a_real_resource')).label).toBe('Unknown');
  });
});

describe('estimateCost – free resources ($0)', () => {
  it('aws_vpc is free', () => expect(estimateCost(node('aws_vpc')).monthly).toBe(0));
  it('aws_subnet is free', () => expect(estimateCost(node('aws_subnet')).monthly).toBe(0));
  it('aws_internet_gateway is free', () => expect(estimateCost(node('aws_internet_gateway')).monthly).toBe(0));
  it('aws_security_group is free', () => expect(estimateCost(node('aws_security_group')).monthly).toBe(0));
  it('aws_iam_role is free', () => expect(estimateCost(node('aws_iam_role')).monthly).toBe(0));
  it('aws_ecs_cluster is free', () => expect(estimateCost(node('aws_ecs_cluster')).monthly).toBe(0));
  it('aws_ecs_service is free', () => expect(estimateCost(node('aws_ecs_service')).monthly).toBe(0));
  it('aws_lb_listener is free', () => expect(estimateCost(node('aws_lb_listener')).monthly).toBe(0));
  it('aws_s3_bucket_policy is free', () => expect(estimateCost(node('aws_s3_bucket_policy')).monthly).toBe(0));
  it('label is "$0 (free)" for free resources', () => {
    expect(estimateCost(node('aws_vpc')).label).toBe('$0 (free)');
  });
  it('annual is 0 for free resources', () => {
    expect(estimateCost(node('aws_vpc')).annual).toBe(0);
  });
});

describe('estimateCost – fixed costs', () => {
  it('aws_eks_cluster is $73/mo', () => expect(estimateCost(node('aws_eks_cluster')).monthly).toBe(73));
  it('aws_rds_cluster is $150/mo', () => expect(estimateCost(node('aws_rds_cluster')).monthly).toBe(150));
  it('aws_nat_gateway is $36.50/mo', () => expect(estimateCost(node('aws_nat_gateway')).monthly).toBe(36.5));
  it('aws_efs_file_system is $30/mo', () => expect(estimateCost(node('aws_efs_file_system')).monthly).toBe(30));
  it('aws_cloudwatch_log_group default is ~$0.59/mo (1GB ingestion, 90d retention)', () => expect(estimateCost(node('aws_cloudwatch_log_group')).monthly).toBeCloseTo(0.59, 2));
  it('aws_cloudwatch_metric_alarm is $0.10/mo', () => expect(estimateCost(node('aws_cloudwatch_metric_alarm')).monthly).toBe(0.1));
  it('aws_kms_key is $1.00/mo', () => expect(estimateCost(node('aws_kms_key')).monthly).toBe(1));
  it('aws_secretsmanager_secret is $0.40/mo', () => expect(estimateCost(node('aws_secretsmanager_secret')).monthly).toBe(0.4));
  it('aws_route53_zone is $0.50/mo', () => expect(estimateCost(node('aws_route53_zone')).monthly).toBe(0.5));
  it('aws_cloudfront_distribution is $10/mo', () => expect(estimateCost(node('aws_cloudfront_distribution')).monthly).toBe(10));
  it('aws_kinesis_stream is $15/mo', () => expect(estimateCost(node('aws_kinesis_stream')).monthly).toBe(15));
  it('aws_redshift_cluster is $180/mo', () => expect(estimateCost(node('aws_redshift_cluster')).monthly).toBe(180));
  it('aws_msk_cluster is $350/mo', () => expect(estimateCost(node('aws_msk_cluster')).monthly).toBe(350));
  it('aws_sagemaker_endpoint is $156/mo', () => expect(estimateCost(node('aws_sagemaker_endpoint')).monthly).toBe(156));
  it('aws_apprunner_service is $25/mo', () => expect(estimateCost(node('aws_apprunner_service')).monthly).toBe(25));
  it('annual cost is monthly * 12', () => {
    const result = estimateCost(node('aws_eks_cluster'));
    expect(result.annual).toBe(73 * 12);
  });
});

describe('estimateCost – aws_instance instance type lookup', () => {
  it('t3.micro → $7.59', () => expect(estimateCost(node('aws_instance', { instance_type: 't3.micro' })).monthly).toBe(7.59));
  it('t3.small → $15.18', () => expect(estimateCost(node('aws_instance', { instance_type: 't3.small' })).monthly).toBe(15.18));
  it('m5.large → $70.08', () => expect(estimateCost(node('aws_instance', { instance_type: 'm5.large' })).monthly).toBe(70.08));
  it('c5.xlarge → $124.10', () => expect(estimateCost(node('aws_instance', { instance_type: 'c5.xlarge' })).monthly).toBe(124.1));
  it('r5.large → $91.98', () => expect(estimateCost(node('aws_instance', { instance_type: 'r5.large' })).monthly).toBe(91.98));
  it('unknown instance type → $36.50 fallback', () => expect(estimateCost(node('aws_instance', { instance_type: 'p4d.24xlarge' })).monthly).toBe(36.5));
  it('no instance_type → $36.50 fallback', () => expect(estimateCost(node('aws_instance')).monthly).toBe(36.5));
});

describe('estimateCost – aws_db_instance instance class lookup', () => {
  it('db.t3.micro → $12.41', () => expect(estimateCost(node('aws_db_instance', { instance_class: 'db.t3.micro' })).monthly).toBe(12.41));
  it('db.m5.large → $124.83', () => expect(estimateCost(node('aws_db_instance', { instance_class: 'db.m5.large' })).monthly).toBe(124.83));
  it('unknown class → $50 fallback', () => expect(estimateCost(node('aws_db_instance', { instance_class: 'db.x99.huge' })).monthly).toBe(50));
});

describe('estimateCost – aws_ebs_volume volume types', () => {
  it('gp2 20GB → $2.00', () => expect(estimateCost(node('aws_ebs_volume', { size: 20, volume_type: 'gp2' })).monthly).toBe(2));
  it('gp3 20GB → $1.60', () => expect(estimateCost(node('aws_ebs_volume', { size: 20, volume_type: 'gp3' })).monthly).toBe(1.6));
  it('st1 500GB → $22.50', () => expect(estimateCost(node('aws_ebs_volume', { size: 500, volume_type: 'st1' })).monthly).toBe(22.5));
  it('sc1 500GB → $12.50', () => expect(estimateCost(node('aws_ebs_volume', { size: 500, volume_type: 'sc1' })).monthly).toBe(12.5));
  it('io1 100GB + 3000 IOPS → 100*0.125 + 3000*0.065', () => {
    const expected = 100 * 0.125 + 3000 * 0.065;
    expect(estimateCost(node('aws_ebs_volume', { size: 100, volume_type: 'io1', iops: 3000 })).monthly).toBeCloseTo(expected);
  });
  it('io2 100GB no IOPS → 100*0.125', () => {
    expect(estimateCost(node('aws_ebs_volume', { size: 100, volume_type: 'io2', iops: 0 })).monthly).toBeCloseTo(12.5);
  });
  it('default type (gp2) 20GB → $2.00', () => {
    expect(estimateCost(node('aws_ebs_volume', { size: 20 })).monthly).toBe(2);
  });
});

describe('estimateCost – usage-based (S3)', () => {
  it('default S3 usage returns a number > 0', () => {
    const result = estimateCost(node('aws_s3_bucket'));
    expect(result.monthly).toBeGreaterThan(0);
  });
  it('S3 with explicit 100GB storage', () => {
    // 100*0.023 + 100*0.005 + 1000*0.0004 = 2.3 + 0.5 + 0.4 = 3.2
    const result = estimateCost(node('aws_s3_bucket', { _usage_storage_gb: 100, _usage_put_requests_k: 100, _usage_get_requests_k: 1000 }));
    expect(result.monthly).toBeCloseTo(3.2);
  });
  it('S3 with 0 usage → minimal cost', () => {
    const result = estimateCost(node('aws_s3_bucket', { _usage_storage_gb: 0, _usage_put_requests_k: 0, _usage_get_requests_k: 0 }));
    expect(result.monthly).toBe(0);
  });
});

describe('estimateCost – usage-based (Lambda)', () => {
  it('default Lambda (1M req, 256MB, 200ms) is $0', () => {
    // reqCost = max(0, 1-1)*0.20 = 0; gbSec = 1M * 0.2s * 0.25 = 50000 < 400000 so free
    const result = estimateCost(node('aws_lambda_function'));
    expect(result.monthly).toBe(0);
  });
  it('Lambda with 10M requests incurs cost', () => {
    const result = estimateCost(node('aws_lambda_function', { _usage_requests_m: 10 }));
    expect(result.monthly).toBeGreaterThan(0);
  });
});

describe('estimateCost – usage-based (DynamoDB)', () => {
  it('PAY_PER_REQUEST default', () => {
    // writeM=1*1.25 + readM=5*0.25 = 1.25 + 1.25 = 2.5
    const result = estimateCost(node('aws_dynamodb_table', { billing_mode: 'PAY_PER_REQUEST' }));
    expect(result.monthly).toBeCloseTo(2.5);
  });
  it('PROVISIONED 10 WCU + 10 RCU', () => {
    // 10*0.47 + 10*0.09 = 4.7 + 0.9 = 5.6
    const result = estimateCost(node('aws_dynamodb_table', { billing_mode: 'PROVISIONED', write_capacity: 10, read_capacity: 10 }));
    expect(result.monthly).toBeCloseTo(5.6);
  });
});

describe('estimateCost – aws_lb type switching', () => {
  it('ALB (default) → $22.27', () => expect(estimateCost(node('aws_lb')).monthly).toBe(22.27));
  it('NLB → $13.14', () => expect(estimateCost(node('aws_lb', { load_balancer_type: 'network' })).monthly).toBe(13.14));
  it('aws_alb ALB → $22.27', () => expect(estimateCost(node('aws_alb')).monthly).toBe(22.27));
});

describe('estimateCost – GCP resources', () => {
  it('google_container_cluster → $73', () =>
    expect(estimateCost(node('google_container_cluster', {}, CloudProvider.GCP)).monthly).toBe(73));
  it('google_compute_instance → $50', () =>
    expect(estimateCost(node('google_compute_instance', {}, CloudProvider.GCP)).monthly).toBe(50));
  it('google_sql_database_instance → $100', () =>
    expect(estimateCost(node('google_sql_database_instance', {}, CloudProvider.GCP)).monthly).toBe(100));
  it('google_storage_bucket default usage', () => {
    const result = estimateCost(node('google_storage_bucket', {}, CloudProvider.GCP));
    expect(result.monthly).toBeGreaterThan(0);
  });
  it('google_compute_disk 100GB → 100*0.04 = $4', () =>
    expect(estimateCost(node('google_compute_disk', { size: 100 }, CloudProvider.GCP)).monthly).toBeCloseTo(4));
  it('google_dns_managed_zone → $0.20', () =>
    expect(estimateCost(node('google_dns_managed_zone', {}, CloudProvider.GCP)).monthly).toBe(0.2));
  it('google_kms_crypto_key → $6.00', () =>
    expect(estimateCost(node('google_kms_crypto_key', {}, CloudProvider.GCP)).monthly).toBe(6));
  it('google_vertex_ai_endpoint → $150', () =>
    expect(estimateCost(node('google_vertex_ai_endpoint', {}, CloudProvider.GCP)).monthly).toBe(150));
});

describe('estimateCost – Azure resources', () => {
  it('azurerm_kubernetes_cluster → $73', () =>
    expect(estimateCost(node('azurerm_kubernetes_cluster', {}, CloudProvider.AZURE)).monthly).toBe(73));
  it('azurerm_virtual_machine → $70', () =>
    expect(estimateCost(node('azurerm_virtual_machine', {}, CloudProvider.AZURE)).monthly).toBe(70));
  it('azurerm_windows_virtual_machine → $90', () =>
    expect(estimateCost(node('azurerm_windows_virtual_machine', {}, CloudProvider.AZURE)).monthly).toBe(90));
  it('azurerm_mssql_database → $150', () =>
    expect(estimateCost(node('azurerm_mssql_database', {}, CloudProvider.AZURE)).monthly).toBe(150));
  it('azurerm_postgresql_server → $90', () =>
    expect(estimateCost(node('azurerm_postgresql_server', {}, CloudProvider.AZURE)).monthly).toBe(90));
  it('azurerm_redis_cache → $55', () =>
    expect(estimateCost(node('azurerm_redis_cache', {}, CloudProvider.AZURE)).monthly).toBe(55));
  it('azurerm_storage_account → $20', () =>
    expect(estimateCost(node('azurerm_storage_account', {}, CloudProvider.AZURE)).monthly).toBe(20));
  it('azurerm_managed_disk 128GB → 128*0.10', () =>
    expect(estimateCost(node('azurerm_managed_disk', { disk_size_gb: 128 }, CloudProvider.AZURE)).monthly).toBeCloseTo(12.8));
  it('azurerm_load_balancer → $18.25', () =>
    expect(estimateCost(node('azurerm_load_balancer', {}, CloudProvider.AZURE)).monthly).toBe(18.25));
  it('azurerm_public_ip → $3.65', () =>
    expect(estimateCost(node('azurerm_public_ip', {}, CloudProvider.AZURE)).monthly).toBe(3.65));
  it('azurerm_key_vault → $5.00', () =>
    expect(estimateCost(node('azurerm_key_vault', {}, CloudProvider.AZURE)).monthly).toBe(5));
  it('azurerm_resource_group is free', () =>
    expect(estimateCost(node('azurerm_resource_group', {}, CloudProvider.AZURE)).monthly).toBe(0));
  it('azurerm_databricks_workspace → $150', () =>
    expect(estimateCost(node('azurerm_databricks_workspace', {}, CloudProvider.AZURE)).monthly).toBe(150));
});

// ── totalMonthlyCost ─────────────────────────────────────────────────────────

describe('totalMonthlyCost', () => {
  it('empty array → $0', () => {
    expect(totalMonthlyCost([])).toBe(0);
  });
  it('sums known costs', () => {
    const nodes = [
      node('aws_eks_cluster'),        // 73
      node('aws_nat_gateway'),        // 36.5
      node('aws_cloudwatch_log_group'), // ~0.59 (1GB ingestion, 90d retention)
    ];
    expect(totalMonthlyCost(nodes)).toBeCloseTo(110.09);
  });
  it('unknown resource contributes $0 (null → 0)', () => {
    const nodes = [node('aws_eks_cluster'), node('unknown_xyz')];
    expect(totalMonthlyCost(nodes)).toBeCloseTo(73);
  });
  it('free resources contribute $0', () => {
    const nodes = [node('aws_vpc'), node('aws_subnet'), node('aws_iam_role')];
    expect(totalMonthlyCost(nodes)).toBe(0);
  });
  it('mixed providers sum correctly', () => {
    const nodes = [
      node('aws_eks_cluster', {}, CloudProvider.AWS),           // 73
      node('azurerm_kubernetes_cluster', {}, CloudProvider.AZURE), // 73
      node('google_container_cluster', {}, CloudProvider.GCP),  // 73
    ];
    expect(totalMonthlyCost(nodes)).toBeCloseTo(219);
  });
});

// ── costByProvider ────────────────────────────────────────────────────────────

describe('costByProvider', () => {
  it('empty array → []', () => {
    expect(costByProvider([])).toEqual([]);
  });
  it('all-free resources → [] (no providers with cost > 0)', () => {
    const nodes = [node('aws_vpc'), node('aws_subnet')];
    expect(costByProvider(nodes)).toEqual([]);
  });
  it('single AWS resource → [{provider: AWS, monthly: ...}]', () => {
    const nodes = [node('aws_eks_cluster')];
    const result = costByProvider(nodes);
    expect(result).toHaveLength(1);
    if (result.length === 0) return; // for TypeScript type narrowing
    if (result[0] === undefined) return; // for TypeScript type narrowing
    expect(result[0].provider).toBe(CloudProvider.AWS);
    expect(result[0].monthly).toBe(73);
  });
  it('multi-provider groups correctly', () => {
    const nodes = [
      node('aws_eks_cluster', {}, CloudProvider.AWS),           // 73
      node('aws_nat_gateway', {}, CloudProvider.AWS),           // 36.5
      node('azurerm_kubernetes_cluster', {}, CloudProvider.AZURE), // 73
      node('google_compute_instance', {}, CloudProvider.GCP),   // 50
    ];
    const result = costByProvider(nodes);
    const providers = result.map(r => r.provider);
    expect(providers).toContain(CloudProvider.AWS);
    expect(providers).toContain(CloudProvider.AZURE);
    expect(providers).toContain(CloudProvider.GCP);
    const aws = result.find(r => r.provider === CloudProvider.AWS)!;
    expect(aws.monthly).toBeCloseTo(109.5);
  });
  it('sorted descending by cost', () => {
    const nodes = [
      node('google_compute_instance', {}, CloudProvider.GCP),   // 50
      node('aws_msk_cluster', {}, CloudProvider.AWS),           // 350
      node('azurerm_mssql_database', {}, CloudProvider.AZURE),  // 150
    ];
    const result = costByProvider(nodes);
    if (result.length < 3) return; // for TypeScript type narrowing
    // Should be sorted: AWS (350), AZURE (150), GCP (50)
    if (result[0] === undefined || result[1] === undefined || result[2] === undefined) return; // for TypeScript type narrowing
    expect(result[0].provider).toBe(CloudProvider.AWS);
    expect(result[1].provider).toBe(CloudProvider.AZURE);
    expect(result[2].provider).toBe(CloudProvider.GCP);
  });
  it('null monthly (unknown type) is excluded from totals', () => {
    const nodes = [
      node('unknown_type', {}, CloudProvider.AWS),
      node('aws_eks_cluster', {}, CloudProvider.AWS),
    ];
    const result = costByProvider(nodes);
    expect(result).toHaveLength(1);
    if (result.length === 0) return; // for TypeScript type narrowing
    if (result[0] === undefined) return; // for TypeScript type narrowing
    expect(result[0].monthly).toBe(73);
  });
});
