/**
 * Boots the real backend for the integration suite: the built server (dist/,
 * the same artifact the deploy and the e2e suite run) against a freshly
 * created postgres database with the real migrations applied.
 *
 * Harness choice: `@vendure/testing`'s `TestServer.bootstrap()` and
 * `SimpleGraphQLClient`/`createTestEnvironment`, but NOT its `init()`. `init()`
 * forces `synchronize: true` and sqljs-style populate; our suite must run the
 * migrations (they are part of what ships) and ChannelSetupPlugin's own
 * bootstrap seeding on postgres (it takes a postgres advisory lock). So the
 * database is recreated and migrated here, then `TestServer.bootstrap()`
 * starts the server with its job queue in-process (no separate worker).
 *
 * Emails use the file transport (integration.env), landing in
 * backend/email-out/.
 */
import "reflect-metadata";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { defaultConfig, mergeConfig, runMigrations, NoopLogger } from "@vendure/core";
import { createTestEnvironment, SimpleGraphQLClient } from "@vendure/testing";
import { Pool } from "pg";
import gql from "graphql-tag";
import { z } from "zod";
import { config as appConfig } from "../dist/vendure-config.js";
import { env } from "../dist/env.js";

export const EMAIL_OUT_DIR = path.resolve(import.meta.dirname, "..", "email-out");

// The test clients want a fully defaulted config (auth header and channel
// token names); bootstrap fills the same defaults in later.
const config = mergeConfig(mergeConfig(defaultConfig, appConfig), {
  logger: new NoopLogger(),
  dbConnectionOptions: { logging: false },
});

export interface IntegrationServer {
  admin: SimpleGraphQLClient;
  newShopSession(): SimpleGraphQLClient;
  stop(): Promise<void>;
}

async function recreateDatabase(databaseUrl: string): Promise<void> {
  const target = new URL(databaseUrl);
  const databaseName = target.pathname.slice(1);

  if (!databaseName.endsWith("_int")) {
    throw new Error(`Refusing to drop "${databaseName}": integration databases end in _int.`);
  }

  target.pathname = "/postgres";

  const pool = new Pool({ connectionString: target.toString(), max: 1 });

  try {
    await pool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await pool.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await pool.end();
  }
}

export async function startServer(): Promise<IntegrationServer> {
  if (env.email.kind !== "file") {
    throw new Error("The integration suite must use the file email transport.");
  }

  await recreateDatabase(env.databaseUrl);
  await runMigrations(config);

  const { server, adminClient } = createTestEnvironment(config);

  await server.bootstrap();
  await adminClient.asSuperAdmin();

  return {
    admin: adminClient,
    newShopSession: () =>
      new SimpleGraphQLClient(
        config,
        `http://localhost:${config.apiOptions.port}/${config.apiOptions.shopApiPath}`
      ),
    stop: () => server.destroy(),
  };
}

const EmailFileSchema = z.object({
  subject: z.string(),
  recipient: z.string(),
  body: z.string(),
});

export type EmailFile = z.output<typeof EmailFileSchema>;

/** The emails written for an order code (the file name carries it), once at least `count` exist. */
export async function emailsFor(code: string, count: number): Promise<EmailFile[]> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const files = (await readdir(EMAIL_OUT_DIR).catch(() => [])).filter((file) =>
      file.includes(code.toLowerCase())
    );

    if (files.length >= count) {
      return Promise.all(
        files.map(async (file) =>
          EmailFileSchema.parse(JSON.parse(await readFile(path.join(EMAIL_OUT_DIR, file), "utf8")))
        )
      );
    }

    await sleep(500);
  }

  throw new Error(`Expected ${count} emails for ${code} in ${EMAIL_OUT_DIR}.`);
}

export function emailText(html: string): string {
  return html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/** Runs one operation and parses its `data` through `schema`; GraphQL errors throw. */
export async function run<S extends z.ZodType>(
  client: SimpleGraphQLClient,
  query: string,
  variables: Record<string, unknown>,
  schema: S
): Promise<z.output<S>> {
  return schema.parse(await client.query(gql(query), variables));
}
