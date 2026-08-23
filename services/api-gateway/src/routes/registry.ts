import type { Hono, AppConfig } from "@automation/server";

export function registerRegistryRoutes(app: Hono, config: AppConfig): void {
  // === Service registry ===
  app.get("/api/services", (c) => {
    return c.json({
      services: {
        "api-gateway": config.services.apiGateway,
        "story-service": config.services.storyService,
        "research-service": config.services.researchService,
        "image-service": config.services.imageService,
        "voice-service": config.services.voiceService,
        "embedding-service": config.services.embeddingService,
        "workflow-service": config.services.workflowService,
      },
    });
  });

  // === Dry-run status ===
  app.get("/api/dry-run", (c) => {
    return c.json({
      dryRun: config.dryRun,
      message: config.dryRun
        ? "Dry-run mode is active — all paid API calls return placeholder data (no cost). Free providers (Kokoro, embeddings) still run."
        : "Dry-run mode is off — real API calls are being made.",
    });
  });
}
