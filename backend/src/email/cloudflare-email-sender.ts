import Cloudflare from "cloudflare";
import type { EmailSender } from "@vendure/email-plugin";
import type { EmailDetails, EmailTransportOptions } from "@vendure/email-plugin";

export interface CloudflareEmailSenderOptions {
  accountId: string;
  apiToken: string;
}

/** Type alias to avoid importing the SDK's client type in several places. */
type CloudflareClient = Cloudflare;

/**
 * Sends the email plugin's generated emails through the Cloudflare Email
 * Sending REST API (https://developers.cloudflare.com/email-service/),
 * because the box's SMTP ports are Hetzner-blocked while 443 is not.
 */
export class CloudflareEmailSender implements EmailSender {
  private readonly client: CloudflareClient;

  constructor(
    private readonly options: CloudflareEmailSenderOptions,
    client?: CloudflareClient
  ) {
    this.client = client ?? new Cloudflare({ apiToken: options.apiToken });
  }

  async send(email: EmailDetails, _options: EmailTransportOptions): Promise<void> {
    // SDK v7 throws (APIError) on failure; the response body is the plain
    // result object with recipient-grouped delivery status.
    const response = await this.client.emailSending.send({
      account_id: this.options.accountId,
      from: parseAddress(email.from),
      to: splitAddresses(email.recipient),
      cc: splitAddresses(email.cc),
      bcc: splitAddresses(email.bcc),
      reply_to: email.replyTo ? parseAddress(email.replyTo) : undefined,
      subject: email.subject,
      html: email.body,
      text: email.text,
      attachments: email.attachments.map((attachment) => ({
        content: attachmentContent(attachment),
        filename: attachment.filename || "attachment",
        disposition: "attachment",
        type: attachment.contentType ?? "application/octet-stream",
      })),
    });

    const { delivered, queued, permanent_bounces } = response;
    if (delivered.length + queued.length === 0) {
      throw new Error(
        `Cloudflare email sending delivered nothing${permanent_bounces.length ? `; permanent bounces: ${permanent_bounces.join(", ")}` : ""}`
      );
    }
  }
}

type AddressInput = string | { address: string; name?: string | null } | undefined;

type AddressValue = string | { address: string; name?: string };

function splitAddresses(raw: string | undefined): AddressValue | Array<AddressValue> | undefined {
  if (!raw) {
    return undefined;
  }

  const addresses = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseAddress);
  return addresses.length === 1 ? addresses[0] : addresses;
}

function parseAddress(raw: string): AddressValue {
  const match = /^(.*?)\s*<(.*?)>$/.exec(raw.trim());
  if (match && match[1]) {
    return { address: match[2]!, name: match[1].replace(/^"|"$/g, "") };
  }
  return raw.trim();
}

function attachmentContent(attachment: EmailDetails["attachments"][number]): string {
  const content = "content" in attachment ? attachment.content : undefined;
  if (Buffer.isBuffer(content)) {
    return content.toString("base64");
  }
  if (typeof content === "string") {
    return attachment.encoding === "base64"
      ? content
      : Buffer.from(content, "utf8").toString("base64");
  }
  throw new Error(
    `Unsupported email attachment for Cloudflare sending: ${attachment.filename} has no inline content`
  );
}
