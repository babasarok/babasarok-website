import { describe, expect, it, vi } from "vitest";
import productFixture from "./__fixtures__/product.json";
import type { Catalog } from "./index";
import { toProductDetail } from "./mappers";
import { ProductResponseSchema } from "./schemas";
import { bothReady, CATALOG_MAX_AGE_MS, createCatalogStore, type CatalogStoreDeps } from "./store";

function catalogNamed(name: string): Catalog {
  return {
    products: [],
    materials: [],
    threadColors: [],
    groups: [{ id: name, kind: "set", label: name, discount: null, productIds: [] }],
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function setup(overrides: Partial<CatalogStoreDeps> = {}): {
  store: ReturnType<typeof createCatalogStore>;
  deps: CatalogStoreDeps & { clock: { now: number } };
} {
  const clock = { now: 0 };
  const deps = {
    clock,
    loadCatalog: vi.fn((locale: string) => Promise.resolve(catalogNamed(locale))),
    loadProduct: vi.fn(() => Promise.resolve(null)),
    now: () => clock.now,
    onError: vi.fn(),
    ...overrides,
  };

  return { store: createCatalogStore(deps), deps };
}

describe("catalog store", () => {
  it("loads on first access and becomes ready", async () => {
    const { store } = setup();
    const catalog = store.catalog("hu");

    expect(catalog.get()).toEqual({ status: "loading" });
    await settle();
    expect(catalog.get()).toEqual({ status: "ready", value: catalogNamed("hu") });
  });

  it("shares one load between concurrent accesses", async () => {
    const loadCatalog = vi.fn((locale: string) => Promise.resolve(catalogNamed(locale)));
    const { store } = setup({ loadCatalog });

    store.catalog("hu");
    store.catalog("hu");
    await settle();

    expect(loadCatalog).toHaveBeenCalledTimes(1);
  });

  it("serves fresh data without reloading and keeps one store per language", async () => {
    const loadCatalog = vi.fn((locale: string) => Promise.resolve(catalogNamed(locale)));
    const { store, deps } = setup({ loadCatalog });
    const first = store.catalog("hu");

    await settle();
    deps.clock.now = CATALOG_MAX_AGE_MS - 1;

    expect(store.catalog("hu")).toBe(first);
    expect(store.catalog("en")).not.toBe(first);
    await settle();
    expect(loadCatalog.mock.calls).toEqual([["hu"], ["en"]]);
  });

  it("keeps showing stale data while it refreshes in the background", async () => {
    let version = 0;
    const { store, deps } = setup({
      loadCatalog: vi.fn(() => {
        version += 1;

        return Promise.resolve(catalogNamed(`v${version}`));
      }),
    });

    store.catalog("hu");
    await settle();
    deps.clock.now = CATALOG_MAX_AGE_MS;

    const catalog = store.catalog("hu");

    expect(catalog.get()).toEqual({ status: "ready", value: catalogNamed("v1") });
    await settle();
    expect(catalog.get()).toEqual({ status: "ready", value: catalogNamed("v2") });
  });

  it("fails, reports, and retries on the next access", async () => {
    const loadCatalog = vi
      .fn<CatalogStoreDeps["loadCatalog"]>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(catalogNamed("hu"));
    const { store, deps } = setup({ loadCatalog });
    const catalog = store.catalog("hu");

    await settle();
    expect(catalog.get()).toEqual({ status: "failed" });
    expect(deps.onError).toHaveBeenCalledWith(new Error("down"));

    store.catalog("hu");
    expect(catalog.get()).toEqual({ status: "loading" });
    await settle();
    expect(catalog.get()).toEqual({ status: "ready", value: catalogNamed("hu") });
  });

  it("keeps the last good data when a background refresh fails", async () => {
    const loadCatalog = vi
      .fn<CatalogStoreDeps["loadCatalog"]>()
      .mockResolvedValueOnce(catalogNamed("hu"))
      .mockRejectedValueOnce(new Error("down"));
    const { store, deps } = setup({ loadCatalog });
    const catalog = store.catalog("hu");

    await settle();
    deps.clock.now = CATALOG_MAX_AGE_MS;
    store.catalog("hu");
    await settle();

    expect(catalog.get()).toEqual({ status: "ready", value: catalogNamed("hu") });
  });

  it("loads a product per language and slug, null when there is none", async () => {
    const row = ProductResponseSchema.parse(productFixture).product;
    const detail = row === null ? null : toProductDetail(row);
    const loadProduct = vi.fn((_locale: string, slug: string) =>
      Promise.resolve(slug === "tornazsak" ? detail : null)
    );
    const { store } = setup({ loadProduct });
    const known = store.product("hu", "tornazsak");
    const unknown = store.product("hu", "nope");

    await settle();

    expect(known.get()).toEqual({ status: "ready", value: detail });
    expect(unknown.get()).toEqual({ status: "ready", value: null });
    expect(store.product("en", "tornazsak")).not.toBe(known);
  });
});

describe("bothReady", () => {
  it("is ready with both values only when both are ready", () => {
    expect(bothReady({ status: "ready", value: 1 }, { status: "ready", value: "a" })).toEqual({
      status: "ready",
      value: [1, "a"],
    });
    expect(bothReady({ status: "ready", value: 1 }, { status: "loading" })).toEqual({
      status: "loading",
    });
  });

  it("fails as soon as either fails", () => {
    expect(bothReady({ status: "loading" }, { status: "failed" })).toEqual({ status: "failed" });
  });
});
