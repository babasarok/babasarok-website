import { describe, expect, it } from "vitest";
import { auditActor, type ActorContext } from "./audit.event";
import { materialEntry, productEntry } from "./audit.service";

describe("auditActor", () => {
  it("reads the acting admin from the session", () => {
    expect(actor({ id: 3, identifier: "owner@babasarok.hu" })).toEqual({
      id: 3,
      identifier: "owner@babasarok.hu",
    });
  });

  it("is null for an anonymous context", () => {
    expect(auditActor({})).toBeNull();
    expect(auditActor({ session: {} })).toBeNull();
  });

  it("is null when the session user id is not numeric", () => {
    expect(actor({ id: "not-a-number", identifier: "x" })).toBeNull();
  });
});

describe("materialEntry", () => {
  it("maps a material event to an admin row keyed by slug", () => {
    const entry = materialEntry({
      ctx: ctx({ id: 3, identifier: "owner@babasarok.hu" }),
      type: "updated",
      materialSlug: "gyongy",
    });

    expect(entry).toEqual({
      entityType: "material",
      entityKey: "gyongy",
      action: "updated",
      summary: null,
      source: "admin",
      actor: { id: 3, identifier: "owner@babasarok.hu" },
    });
  });

  it("marks userless material writes as system", () => {
    const entry = materialEntry({ ctx: ctx(), type: "created", materialSlug: "gyongy" });

    expect(entry.source).toBe("system");
    expect(entry.actor).toBeNull();
  });
});

describe("productEntry", () => {
  it("maps a product event to a row keyed by the native id, named in the summary", () => {
    const entry = productEntry({
      ctx: ctx({ id: 3, identifier: "owner@babasarok.hu" }),
      type: "updated",
      entity: { id: 41, name: "Babafészek" },
    });

    expect(entry).toEqual({
      entityType: "product",
      entityKey: "41",
      action: "updated",
      summary: "Babafészek",
      source: "admin",
      actor: { id: 3, identifier: "owner@babasarok.hu" },
    });
  });

  it("summarizes with null when the entity carries no name", () => {
    const entry = productEntry({
      ctx: ctx(),
      type: "deleted",
      entity: { id: 41 },
    });

    expect(entry.summary).toBeNull();
    expect(entry.source).toBe("system");
  });
});

function ctx(user?: { id: number; identifier: string }): ActorContext {
  return user === undefined ? {} : { session: { user } };
}

function actor(user?: { id: unknown; identifier: string }): ReturnType<typeof auditActor> {
  return auditActor(user === undefined ? {} : { session: { user } });
}
