import type { Hono } from "@automation/server";
import type { WorkflowEngine } from "@automation/workflow-engine";
import type { ApprovalDecisionInput } from "@automation/contracts";
import { getDb } from "@automation/database";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// === Approvals ===

export function registerApprovalRoutes(app: Hono, engine: WorkflowEngine): void {
  const db = getDb();

  const approvalSchema = z.object({
    approvalId: z.string().min(1),
    decision: z.enum(["approved", "rejected"]),
    reviewer: z.string().optional(),
    notes: z.string().optional(),
    editedData: z.record(z.unknown()).optional(),
  });

  // POST /approvals — submit an approval decision
  app.post("/approvals", zValidator("json", approvalSchema), async (c) => {
    const data = c.req.valid("json") as ApprovalDecisionInput;
    const run = await engine.decideApproval(data);
    if (!run) return c.json({ error: "Approval not found or already decided" }, 404);

    // === Post-approval side effects ===
    // When image_review is approved, mark all pending images for this run's
    // scenes as 'image_accepted' so the package builder includes them.
    if (data.decision === "approved") {
      const imageReviewStep = run.steps.find(
        (s) => s.stepType === "image_review" && s.status === "completed",
      );
      if (imageReviewStep) {
        // Get all scene IDs from the scene_plan step result
        const scenePlanStep = run.steps.find((s) => s.stepType === "scene_plan");
        const sceneIds = ((scenePlanStep?.resultData?.scenes as Array<{ id: string }>) ?? []).map(
          (s) => s.id,
        );
        if (sceneIds.length > 0) {
          const placeholders = sceneIds.map(() => "?").join(",");
          await db.prepare(
            `UPDATE assets SET type = 'image_accepted' WHERE scene_id IN (${placeholders}) AND type = 'image'`,
          ).run(...sceneIds);
        }
      }
    }

    return c.json({ run });
  });

  // GET /runs/:id/approvals — list pending approvals for a run
  app.get("/runs/:id/approvals", async (c) => {
    const id = c.req.param("id");
    const run = await engine.getRunDetails(id);
    if (!run) return c.json({ error: "Run not found" }, 404);
    const pending = run.approvals.filter((a) => a.status === "pending");
    return c.json({ approvals: pending });
  });
}
