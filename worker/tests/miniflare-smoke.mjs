import { createHarness } from "./harness.mjs";
const app = await createHarness();
try {
  const response = await app.fetch("/api/health");
  console.log("Miniflare D1 health:", response.status, await response.text());
  if (response.status !== 200) process.exitCode = 1;
} finally { await app.close(); }
