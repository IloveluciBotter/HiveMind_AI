// Import env first to validate environment variables on startup
import "./env";
import { env } from "./env";
import { initSentry } from "./sentry";
import { createApp } from "./createApp";

initSentry();

// Start server
(async () => {
  const { app, httpServer } = await createApp();

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = env.PORT;
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`serving on port ${port}`);
  });
})();
