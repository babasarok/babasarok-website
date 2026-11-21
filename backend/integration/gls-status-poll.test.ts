/**
 * Seam: the GLS status poll (ADR 0020 S3) — GLS's status history versus the
 * fulfillment/order state machine and the owner/buyer emails. The in-process
 * fake GLS receives injected statuses and `GlsService.pollStatuses` runs with
 * the same admin context the scheduled task builds (the task's cron firing is
 * Vendure's; the config wiring itself is asserted at the bottom):
 * hand-over ships and emails the buyer, a delivery closes the order and drops
 * the label, an unpaid utánvét holds until the owner records the payment, and
 * problem statuses email the owner once per problem code.
 */
import { ChannelService, DefaultSchedulerPlugin, RequestContextService } from "@vendure/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { seedCatalog } from "./fixtures";
import { emailsFor, emailText, run, startServer, type IntegrationServer } from "./harness";
import {
  fulfill,
  GLS_SENDER,
  placeOrder,
  recordBankTransfer,
  setSender,
  type Placed,
} from "./gls-flow";
import { FakeGlsClient } from "../dist/plugins/gls/fake-gls-client";
import { glsStatusPollTask } from "../dist/plugins/gls/gls-poll-task";
import { GLS_CLIENT, GlsService } from "../dist/plugins/gls/gls.service";
import { config } from "../dist/vendure-config";

let server: IntegrationServer;
let gls: FakeGlsClient;

function status(
  code: string,
  date: number,
  description = ""
): { code: string; date: number; description: string } {
  return { code, date, description };
}

/** The same context `ScheduledTask.execute` builds for its execute function. */
async function poll(): Promise<void> {
  const channel = await server.app.get(ChannelService).getDefaultChannel();
  const ctx = await server.app
    .get(RequestContextService)
    .create({ apiType: "admin", channelOrToken: channel });

  await server.app.get(GlsService).pollStatuses(ctx);
}

async function fulfilledOrder(
  shippingCode: string,
  pay = true
): Promise<{ order: Placed; fulfillmentId: string; trackingCode: string }> {
  const order = await placeOrder(server, shippingCode);

  if (pay) {
    await recordBankTransfer(server, order);
  }

  const result = await fulfill(server, order);

  if (!("trackingCode" in result)) {
    throw new Error(`fulfillment refused: ${JSON.stringify(result)}`);
  }

  return { order, fulfillmentId: result.id, trackingCode: result.trackingCode };
}

const OrderStateSchema = z.object({
  order: z
    .object({
      state: z.string(),
      fulfillments: z.array(
        z.object({ id: z.string(), state: z.string(), trackingCode: z.string() })
      ),
    })
    .loose(),
});

async function orderState(order: Placed): Promise<z.output<typeof OrderStateSchema>["order"]> {
  const data = await run(
    server.admin,
    `query($id: ID!) { order(id: $id) { state fulfillments { id state trackingCode } } }`,
    { id: order.id },
    OrderStateSchema
  );

  return data.order;
}

const LabelSchema = z.object({ glsLabel: z.object({ fileName: z.string() }).nullable() });

async function hasLabel(fulfillmentId: string): Promise<boolean> {
  const data = await run(
    server.admin,
    `query($id: ID!) { glsLabel(fulfillmentId: $id) { fileName } }`,
    { id: fulfillmentId },
    LabelSchema
  );

  return data.glsLabel !== null;
}

/** The owner's problem emails for the order, once at least `total` emails of any kind exist. */
async function problemEmails(
  code: string,
  total: number
): Promise<{ recipient: string; body: string }[]> {
  const emails = await emailsFor(code, total);

  return emails
    .filter((e) => e.subject.includes("GLS-probléma"))
    .map((e) => ({ recipient: e.recipient, body: emailText(e.body) }));
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
  await setSender(server, GLS_SENDER);

  const client = server.app.get(GLS_CLIENT);

  if (!(client instanceof FakeGlsClient)) {
    throw new TypeError("the integration suite must run against the in-process fake GLS");
  }

  gls = client;
});

afterAll(async () => {
  await server.stop();
});

describe("GLS status poll", () => {
  it("ships the parcel on hand-over and emails the buyer the tracking link", async () => {
    const { order, fulfillmentId, trackingCode } = await fulfilledOrder("gls-elore-utalas");

    gls.setStatuses(trackingCode, [status("1", 100, "A csomagot átadtuk a GLS-nek.")]);
    await poll();

    const state = await orderState(order);

    expect(state.fulfillments.find((f) => f.id === fulfillmentId)).toMatchObject({
      state: "Shipped",
    });
    expect(state.state).toBe("Shipped");

    const shipped = await emailsFor(order.code, 3);
    const buyer = shipped.find((e) => e.subject.startsWith("Rendelésed úton van"));

    expect(buyer).toBeDefined();

    if (!buyer) {
      return;
    }

    expect(buyer.recipient).toBe("vevo@example.com");
    expect(buyer.body).toContain(trackingCode);
    expect(buyer.body).toContain(`parcel-tracking?match=${trackingCode}`);
    expect(buyer.body).toContain("A csomag tartalma:");
    expect(buyer.body).toContain("Kendő");
    expect(buyer.body).toContain("(2 db)");
  });

  it("delivers a paid order, drops the label, and closes the order", async () => {
    const { order, fulfillmentId, trackingCode } = await fulfilledOrder("gls-elore-utalas");

    gls.setStatuses(trackingCode, [
      status("1", 100),
      status("31", 150, "Szállítás alatt."),
      status("5", 200, "A csomagot kézbesítettük."),
    ]);
    await poll();

    const state = await orderState(order);

    expect(state.state).toBe("Delivered");
    expect(state.fulfillments.find((f) => f.id === fulfillmentId)).toMatchObject({
      state: "Delivered",
    });
    expect(await hasLabel(fulfillmentId)).toBe(false);
  });

  it("holds an unpaid utánvét order until the owner records the payment", async () => {
    const { order, fulfillmentId, trackingCode } = await fulfilledOrder("gls-utanvet", false);

    gls.setStatuses(trackingCode, [status("1", 100), status("5", 200, "Kézbesítve.")]);
    await poll();

    const held = await orderState(order);

    expect(held.fulfillments.find((f) => f.id === fulfillmentId)).toMatchObject({
      state: "Pending",
    });
    expect(await hasLabel(fulfillmentId)).toBe(true);

    await recordBankTransfer(server, order);
    await poll();

    const closed = await orderState(order);

    expect(closed.fulfillments.find((f) => f.id === fulfillmentId)).toMatchObject({
      state: "Delivered",
    });
    expect(closed.state).toBe("Delivered");
    expect(await hasLabel(fulfillmentId)).toBe(false);
  });

  it("emails the owner once per problem code and notes it on the order", async () => {
    const { order, trackingCode } = await fulfilledOrder("gls-elore-utalas");

    gls.setStatuses(trackingCode, [
      status("1", 100),
      status("17", 200, "A címzett elutasította a csomagot."),
    ]);
    await poll();

    // confirmation + owner notification + the buyer's shipped email + the problem email
    const first = await problemEmails(order.code, 4);
    const firstProblem = first.at(0);

    expect(first).toHaveLength(1);
    expect(firstProblem?.recipient).toBe("rendeles@babasarok.test");
    expect(firstProblem?.body).toContain("17");
    expect(firstProblem?.body).toContain("A címzett elutasította a csomagot.");

    const notes = await run(
      server.admin,
      `query($id: ID!) {
        order(id: $id) { history { items { type isPublic data } } }
      }`,
      { id: order.id },
      z.object({
        order: z.object({
          history: z.object({
            items: z.array(
              z.object({
                type: z.string(),
                isPublic: z.boolean(),
                data: z.record(z.string(), z.unknown()),
              })
            ),
          }),
        }),
      })
    );
    const note = notes.order.history.items.find(
      (item) => item.type === "ORDER_NOTE" && !item.isPublic
    );

    expect(String(note?.data.note)).toContain("GLS 17");

    await poll();

    expect(await problemEmails(order.code, 4)).toHaveLength(1);

    gls.setStatuses(trackingCode, [
      status("1", 100),
      status("17", 200, "A címzett elutasította a csomagot."),
      status("23", 300, "Visszaküldve a feladónak."),
    ]);
    await poll();

    const returned = await problemEmails(order.code, 5);

    expect(returned).toHaveLength(2);
    expect(returned.at(1)?.body).toContain("23");
  });

  it("polls through a run with no GLS parcels at all", async () => {
    await expect(poll()).resolves.toBeUndefined();
  });
});

describe("glsStatusPollTask wiring", () => {
  it("is registered on the scheduler, which runs tasks in the worker, every 30 minutes", () => {
    expect(config.schedulerOptions?.tasks).toContain(glsStatusPollTask);
    expect(config.plugins).toContain(DefaultSchedulerPlugin);
    expect(glsStatusPollTask.options.schedule).toBe("*/30 * * * *");
  });
});
