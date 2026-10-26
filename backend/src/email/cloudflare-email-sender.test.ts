import { describe, expect, it, vi } from "vitest";
import {
  CloudflareEmailSender,
  type CloudflareEmailSenderOptions,
} from "./cloudflare-email-sender";
import type { EmailDetails, EmailTransportOptions } from "@vendure/email-plugin";

const transportOptions = { type: "none" } as unknown as EmailTransportOptions;

function makeDetails(overrides: Partial<EmailDetails> = {}): EmailDetails {
  return {
    from: "Babasarok <orders@babasarok.net>",
    recipient: "buyer@example.com",
    subject: "Rendelés visszaigazolás",
    body: "<p>köszönjük</p>",
    text: "köszönjük",
    attachments: [],
    ...overrides,
  };
}

function senderWith(send: ReturnType<typeof vi.fn>) {
  const client = { emailSending: { send } };
  const sender = new CloudflareEmailSender(
    { accountId: "acc", apiToken: "tok" } satisfies CloudflareEmailSenderOptions,
    client as never
  );
  return sender;
}

describe("CloudflareEmailSender", () => {
  it("maps the email details onto the SDK send params", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ delivered: ["buyer@example.com"], queued: [], permanent_bounces: [] });
    const sender = senderWith(send);

    await sender.send(makeDetails(), transportOptions);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc",
        from: { address: "orders@babasarok.net", name: "Babasarok" },
        to: "buyer@example.com",
        subject: "Rendelés visszaigazolás",
        html: "<p>köszönjük</p>",
        text: "köszönjük",
      })
    );
  });

  it("splits comma-separated cc/bcc and keeps single values plain", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ delivered: ["a@b.c"], queued: [], permanent_bounces: [] });
    const sender = senderWith(send);

    await sender.send(
      makeDetails({ recipient: "a@b.c, d@e.f", cc: "cc1@x.y", bcc: "bcc1@x.y, bcc2@x.y" }),
      transportOptions
    );

    const params = send.mock.calls[0]![0]!;
    expect(params.to).toEqual(["a@b.c", "d@e.f"]);
    expect(params.cc).toEqual("cc1@x.y");
    expect(params.bcc).toEqual(["bcc1@x.y", "bcc2@x.y"]);
  });

  it("throws when the API reports nothing was delivered", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ delivered: [], queued: [], permanent_bounces: ["b@x.y"] });
    const sender = senderWith(send);

    await expect(sender.send(makeDetails(), transportOptions)).rejects.toThrow(
      /permanent bounces: b@x.y/
    );
  });

  it("propagates SDK errors", async () => {
    const send = vi.fn().mockRejectedValue(new Error("403 forbidden"));
    const sender = senderWith(send);

    await expect(sender.send(makeDetails(), transportOptions)).rejects.toThrow("403 forbidden");
  });
});
