export interface TerraformResource {
  readonly address: string;
  readonly mode: string;
  readonly type: string;
  readonly name: string;
  readonly provider_name: string;
  readonly schema_version: number;
  readonly values: Record<string, unknown>;
  readonly depends_on?: readonly string[];
}

export interface TerraformModule {
  readonly resources?: readonly TerraformResource[];
  readonly child_modules?: readonly TerraformChildModule[];
}

export interface TerraformChildModule extends TerraformModule {
  readonly address: string;
}

export interface TerraformResourceChange {
  readonly address: string;
  readonly module_address?: string | null;
  readonly mode: string;
  readonly type: string;
  readonly name: string;
  readonly provider_name: string;
  readonly change: {
    readonly actions: readonly string[];
    readonly before: Record<string, unknown> | null;
    readonly after: Record<string, unknown> | null;
  };
}

export interface TerraformPlan {
  readonly format_version: string;
  readonly terraform_version: string;
  readonly planned_values?: {
    readonly root_module: TerraformModule;
  };
  readonly values?: {
    readonly root_module: TerraformModule;
  };
  readonly resource_changes?: readonly TerraformResourceChange[];
}
