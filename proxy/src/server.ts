import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config";
import path from "node:path";
import fs from "node:fs";
import fastifyStatic from "@fastify/static";
import { registerAiRoute } from "./routes/ai.route";
import { registerAuthRoutes } from "./routes/auth.route";
import { registerBrowserScanRoute } from "./routes/browserScan.route";
import { registerCreditRoutes } from "./routes/credit.route";
import { registerEstimateRoute } from "./routes/estimate.route";
import { registerExportRoutes } from "./routes/export.route";
import { registerHealthRoute } from "./routes/health.route";
import { registerPermissionRoute } from "./routes/permission.route";
import { registerVaultRoutes } from "./routes/vault.route";
import { registerLogsRoute } from "./routes/logs.route";
import { registerOrgRoutes } from "./routes/org.route";
import { registerPolicyRoutes } from "./routes/policy.route";
import { registerProviderRoutes } from "./routes/provider.route";
import { registerSimulatorRoute } from "./routes/simulator.route";
import { registerStatsRoute } from "./routes/stats.route";
import { registerUsageRoutes } from "./routes/usage.route";
import { registerAuditRoutes } from "./routes/audit.route";
import { registerPluginScanRoutes } from "./routes/pluginScan.route";

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, { origin: true });

  // Serve dashboard static files when available (air-gapped single-container mode)
  try {
    const dashboardDist = path.resolve(__dirname, "../../dashboard/dist");
    if (fs.existsSync(dashboardDist)) {
      await app.register(fastifyStatic, {
        root: dashboardDist,
        prefix: "/"
      });
      app.log.info(`Serving dashboard from ${dashboardDist}`);
    }
  } catch (e) {
    app.log.warn({ err: e }, "Dashboard static serve not available");
  }

  // Public routes
  await registerHealthRoute(app);

  // Auth routes (register/login are public, token mgmt is authenticated)
  await registerAuthRoutes(app);

  // Authenticated / role-gated routes
  await registerLogsRoute(app);
  await registerPolicyRoutes(app);
  await registerStatsRoute(app);
  await registerSimulatorRoute(app);
  await registerOrgRoutes(app);
  await registerExportRoutes(app);

  // Phase 4: Gateway routes
  await registerProviderRoutes(app);
  await registerCreditRoutes(app);
  await registerUsageRoutes(app);

  // Browser extension scan endpoint
  await registerBrowserScanRoute(app);

  // Permission prompt (interactive mode)
  await registerPermissionRoute(app);

  // Reversible token vault
  await registerVaultRoutes(app);

  // Pre-flight estimation
  await registerEstimateRoute(app);

  // Privacy audit (opt-in, Phase X)
  await registerAuditRoutes(app);
  registerPluginScanRoutes(app);

  // Core proxy route (auth via API key header or .env)
  await registerAiRoute(app);

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`AI Firewall Gateway running on http://localhost:${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void bootstrap();
