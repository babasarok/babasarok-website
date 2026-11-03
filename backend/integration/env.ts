import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const MAIL_VARIABLES = [
  "EMAIL_TRANSPORT",
  "SMTP_HOST",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_EMAIL_TOKEN",
  "API_ALLOWED_ORIGINS",
];

for (const name of MAIL_VARIABLES) {
  Reflect.deleteProperty(process.env, name);
}

const file = new URL("../integration.env", import.meta.url);

Object.assign(process.env, parseEnv(readFileSync(file, "utf8")));
