#!/usr/bin/env node
/**
 * Generates docker-compose.networks.yml on the box: attaches the edge caddy
 * service to its own project network (default) AND to each fixed stack's
 * compose network. (A top-level `networks:` declaration alone attaches no
 * service — the missing service attachment 502'd the edge after a recreate.
 * And an override listing only external networks would REPLACE the caddy
 * service's default-network attachment — previews live on that network.)
 * Preview stacks are skipped: they ride the infra stack's network, which this
 * already attached. A stack's exact network name is recorded in its
 * `network` file; dirs predating that marker fall back to the default
 * compose name. When no fixed stacks exist the file is removed — the caller
 * then brings the edge up without an override.
 *
 * Runs on the box under plain apt Node; stdlib only.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const ROOT = "/srv/babasarok";
const OUT = `${ROOT}/infra/docker-compose.networks.yml`;

/** Fixed stacks = dirs with a repo/ and no branch.txt marker. */
function fixedStacks(): { name: string; network: string }[] {
  const stacks: { name: string; network: string }[] = [];
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(`${ROOT}/${entry.name}/repo`)) {
      continue;
    }
    if (existsSync(`${ROOT}/${entry.name}/branch.txt`)) {
      continue;
    }
    const networkFile = `${ROOT}/${entry.name}/network`;
    const network = existsSync(networkFile)
      ? readFileSync(networkFile, "utf8").trim()
      : `babasarok-${entry.name}_default`;
    stacks.push({ name: entry.name, network });
  }
  return stacks;
}

const stacks = fixedStacks();
if (stacks.length === 0) {
  rmSync(OUT, { force: true });
  process.exit(0);
}

const lines = ["services:", "  caddy:", "    networks:", "      - default"];
for (const { network } of stacks) {
  lines.push(`      - ${network}`);
}
lines.push("", "networks:");
for (const { network } of stacks) {
  lines.push(`  ${network}:`, "    external: true");
}
writeFileSync(OUT, `${lines.join("\n")}\n`);
