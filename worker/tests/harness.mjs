import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const ORIGIN = "https://learnatbillioncodes.com";
export const ADMIN = "local-test-admin-not-production-123456789";
export const SALT = "local-test-salt-not-production-123456789";

export async function migrate(db) {
  const folder = new URL('../../migrations/',import.meta.url);
  const files = (await readdir(folder)).filter(name => name.endsWith('.sql')).sort();
  const sources = [];
  for (const name of files) sources.push(await readFile(new URL(name,folder),'utf8'));
  const sql = sources.join('\n');
  const statements = [];
  let statement = "";
  let trigger = false;
  for (const line of sql.split("\n")) {
    if (!line.trim() || line.trim().startsWith("--")) continue;
    statement += line + "\n";
    if (/^CREATE TRIGGER/i.test(line)) trigger = true;
    if (line.trim().endsWith(";") && (!trigger || line.trim() === "END;")) {
      statements.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete test migration statement.");
  await db.batch(statements);
}

export async function createHarness(bindings = {}, overrides = {}) {
  const { Miniflare, convertV4MiniflareOptions } = require(process.env.MINIFLARE_PATH || "miniflare");
  const { build } = require("esbuild");
  const bundled = await build({ entryPoints:[fileURLToPath(new URL("../index.js", import.meta.url))], bundle:true, format:"esm", platform:"browser", write:false });
  const adminHTML = await readFile(new URL("../../public/admin.html", import.meta.url), "utf8");
  const options = { workers: [{
    name: "billioncodes-academy-test",
    modules: true,
    script: bundled.outputFiles[0].text,
    compatibilityDate: "2026-09-01",
    d1Databases: { DB: "local-backend-test" },
    serviceBindings: { ASSETS: async request => new Response(new URL(request.url).pathname === "/admin.html" ? adminHTML : "<!doctype html><title>Test public assets</title>", { headers:{ "Content-Type":"text/html" } }) },
    bindings: { SECURITY_SALT:SALT, ADMIN_TOKEN:ADMIN, ...bindings },
    ...overrides
  }] };
  const mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options);
  try {
    const db = await mf.getD1Database("DB");
    await migrate(db);
    return { mf, db, fetch:(path, init) => mf.dispatchFetch(ORIGIN + path, init), close:() => mf.dispose() };
  } catch (error) { await mf.dispose(); throw error; }
}

export const application = (overrides = {}) => ({ name:"Ada Example", email:"ada@example.com", track:"Web development", format:"undecided", experience:"Complete beginner", goals:"I want to build a clear website for a local shop.", consent:true, ...overrides });
export const project = (overrides = {}) => ({ name:"Sam Example", email:"sam@example.com", category:"business-software", summary:"A stock tracking website", details:"We need a small inventory tool for our shop, with a stock list and low-stock reminders.", consent:true, ...overrides });
export const post = (data, key = crypto.randomUUID(), headers = {}) => ({ method:"POST", headers:{ "Content-Type":"application/json", Origin:ORIGIN, "Idempotency-Key":key, "CF-Connecting-IP":"192.0.2.10", ...headers }, body:JSON.stringify(data) });
export const admin = (extra = {}) => ({ Authorization:`Bearer ${ADMIN}`, ...extra });
