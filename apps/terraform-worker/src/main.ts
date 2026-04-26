import express, { type Request, type Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env["PORT"] ?? 3005);
// Path to the terraform binary. Defaults to "terraform" (must be on PATH).
// Override with TERRAFORM_BINARY=/usr/local/bin/terraform for an explicit path.
const TERRAFORM_BINARY = process.env["TERRAFORM_BINARY"] ?? "terraform";
const STEP_TIMEOUT_MS = 120_000;

const app = express();
app.use(express.json({ limit: "50mb" }));

app.get("/health", (_req: Request, response: Response): void => {
  response.json({ status: "ok", service: "terraform-worker" });
});

interface RunRequest {
  // Base64-encoded zip archive of the Terraform project directory
  archiveBase64: string;
  // Extra -var flags to pass to terraform plan, e.g. ["region=us-east-1"]
  vars?: string[];
}

// POST /run
// Accepts a base64-encoded zip of a Terraform project, runs terraform init + plan + show -json
// using the portable terraform binary on the host PATH, and returns the plan JSON.
// Each step has an independent timeout of STEP_TIMEOUT_MS.
app.post("/run", async (request: Request, response: Response): Promise<void> => {
  const body = request.body as Partial<RunRequest>;

  if (typeof body.archiveBase64 !== "string") {
    response.status(400).json({ error: "archiveBase64 is required" });
    return;
  }

  const workDir = await mkdtemp(join(tmpdir(), "tfworker-"));

  try {
    const archivePath = join(workDir, "project.zip");
    await writeFile(archivePath, Buffer.from(body.archiveBase64, "base64"));

    // Extract the archive in-place using the system unzip tool
    await execFileAsync("unzip", ["-q", "project.zip"], {
      cwd: workDir,
      timeout: 30_000,
    });

    const varFlags = (body.vars ?? []).flatMap((v) => ["-var", v]);

    // Step 1: init — downloads providers from the registry
    await execFileAsync(
      TERRAFORM_BINARY,
      ["init", "-no-color", "-input=false"],
      { cwd: workDir, timeout: STEP_TIMEOUT_MS },
    );

    // Step 2: plan — writes binary plan file
    await execFileAsync(
      TERRAFORM_BINARY,
      ["plan", "-no-color", "-input=false", "-out=tfplan", ...varFlags],
      { cwd: workDir, timeout: STEP_TIMEOUT_MS },
    );

    // Step 3: show -json — renders plan as machine-readable JSON to stdout
    const { stdout } = await execFileAsync(
      TERRAFORM_BINARY,
      ["show", "-json", "tfplan"],
      { cwd: workDir, timeout: 30_000 },
    );

    const planJson: unknown = JSON.parse(stdout);
    response.json({ plan: planJson });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker execution failed";
    response.status(500).json({ error: message });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

app.listen(PORT, () => {
  process.stdout.write(`[terraform-worker] listening on port ${PORT}\n`);
});
