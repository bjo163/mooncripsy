import { loadGatewayConfig } from "./config.js";
import { createGatewayServer } from "./server.js";

let server;
try {
  const config = loadGatewayConfig();
  server = createGatewayServer({ config });
  server.listen(config.port, config.host, () => {
    process.stdout.write(
      "Mooncripsy Gateway listening at http://" + config.host + ":" + config.port + "/v1\n",
    );
    process.stdout.write("Client API key is configured; it will not be printed.\n");
    process.stdout.write("Enabled upstream connections: " + config.upstreams.filter((item) => item.enabled).length + "\n");
  });
} catch (error) {
  process.stderr.write("Mooncripsy Gateway failed to start: " + error.message + "\n");
  process.exitCode = 1;
}

function shutdown() {
  if (!server?.listening) return;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
