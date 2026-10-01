import { isProductType, PRODUCT_TYPE_VALUES, type ProductType } from "../product/productTypes";

export type ListSort = "popular" | "newest" | "name";

export interface ProductListViewState {
  /** Search text, matched against title and short description. */
  q: string;
  /** Selected product types; OR-combined within the dimension. */
  types: ProductType[];
  /** Selected product set ids; OR-combined within the dimension. */
  sets: string[];
  sort: ListSort;
}

export const DEFAULT_LIST_STATE: ProductListViewState = {
  q: "",
  types: [],
  sets: [],
  sort: "popular",
};

/**
 * Narrow a raw sort value (URL param or `<select>` option value) to a
 * {@link ListSort}; anything unknown falls back to the default sort.
 */
export function parseListSort(value: string | null | undefined): ListSort {
  return value === "popular" || value === "newest" || value === "name"
    ? value
    : DEFAULT_LIST_STATE.sort;
}

/**
 * Parse a product list view state from a URL search string ("?" or "?q=...").
 * `type` and `set` are repeated keys, one value per selection. Unknown types
 * and sort values are dropped; set ids pass through (an unknown id simply
 * matches nothing when applied).
 */
export function parseListState(search: string): ProductListViewState {
  const params = new URLSearchParams(search);

  const q = params.get("q") ?? "";

  const types = params
    .getAll("type")
    .map((value) => value.trim())
    .filter((value): value is ProductType => isProductType(value));

  const sets = params
    .getAll("set")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const sort = parseListSort(params.get("sort"));

  return { q, types, sets, sort };
}

/**
 * A product as seen by the list query: the minimal shape applyListState needs.
 * Anything structurally compatible (e.g. the CMS-enhanced product plus its
 * set memberships) can be passed in. `id` is the product's CMS `product_id`
 * (the list's card key and the identity the popularity order is keyed by),
 * not the content entry id.
 */
export interface ListProduct {
  id: string;
  title: string;
  shortDescription?: string | undefined | null;
  type: ProductType;
  date?: Date | undefined | null;
  sets: string[];
}

/**
 * Apply a view state to a product list: the search text narrows by
 * case-insensitive substring match on title or short description; selected
 * types and sets are OR-combined within their dimension and AND-combined with
 * each other and the search. Returns a new array sorted by the state's sort
 * ("popular": position in `popularOrder`, products without a curated position
 * following it name-ascending among themselves; "newest": date descending,
 * missing dates last, stable; "name": title ascending, Hungarian locale). The
 * input is not mutated.
 */
export function applyListState<TProduct extends ListProduct>(
  products: readonly TProduct[],
  state: ProductListViewState,
  popularOrder: readonly string[] = []
): TProduct[] {
  const query = state.q.trim().toLowerCase();

  const matches = products.filter((product) => {
    if (
      query !== "" &&
      !product.title.toLowerCase().includes(query) &&
      !(product.shortDescription ?? "").toLowerCase().includes(query)
    ) {
      return false;
    }
    if (state.types.length > 0 && !state.types.includes(product.type)) {
      return false;
    }
    if (state.sets.length > 0 && !product.sets.some((set) => state.sets.includes(set))) {
      return false;
    }
    return true;
  });

  let sorted: TProduct[];
  switch (state.sort) {
    case "popular": {
      // Curated popularity order: position in `popularOrder` (first occurrence
      // wins); unranked products follow it, name-ascending among themselves.
      const rank = new Map<string, number>();
      for (const [index, id] of popularOrder.entries()) {
        if (!rank.has(id)) {
          rank.set(id, index);
        }
      }
      const unranked = popularOrder.length;
      sorted = matches.toSorted((a, b) => {
        const aRank = rank.get(a.id) ?? unranked;
        const bRank = rank.get(b.id) ?? unranked;
        if (aRank === bRank) {
          return a.title.localeCompare(b.title, "hu");
        }
        return aRank - bRank;
      });
      break;
    }
    case "newest":
      // Newest first: date descending, missing dates last
      sorted = matches.toSorted((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      break;
    // eslint-disable-next-line unicorn/no-useless-switch-case
    case "name":
    default:
      // Name ascending, Hungarian locale
      sorted = matches.toSorted((a, b) => a.title.localeCompare(b.title, "hu"));
      break;
  }

  return sorted;
}

/** Serialize a view state to a URL search string ("" for the default state). */
export function serializeListState(state: ProductListViewState): string {
  const params = new URLSearchParams();

  if (state.q !== "") {
    params.set("q", state.q);
  }

  for (const type of state.types) {
    if (PRODUCT_TYPE_VALUES.includes(type)) {
      params.append("type", type);
    }
  }
  for (const set of state.sets) {
    params.append("set", set);
  }

  if (state.sort !== DEFAULT_LIST_STATE.sort) {
    params.set("sort", state.sort);
  }

  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}
