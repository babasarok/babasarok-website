import { describe, expect, it } from "vitest";
import { LanguageCode } from "@vendure/core";
import { auditActor, type ActorContext } from "./audit.event";
import { productEntry } from "./audit.service";

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

describe("productEntry", () => {
  it("maps a product event to a row keyed by the native id, named in the summary", () => {
    const entry = productEntry({
      ctx: ctx({ id: 3, identifier: "owner@babasarok.hu" }),
      type: "created",
      entity: {
        id: 41,
        translations: [
          { languageCode: LanguageCode.en, name: "Woven baby nest" },
          { languageCode: LanguageCode.hu, name: "Babafészek" },
        ],
      },
    });

    expect(entry).toEqual({
      entityType: "product",
      entityKey: "41",
      action: "created",
      summary: "Babafészek",
      details: null,
      source: "admin",
      actor: { id: 3, identifier: "owner@babasarok.hu" },
    });
  });

  it("summarizes with null when the entity carries no hu name", () => {
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
