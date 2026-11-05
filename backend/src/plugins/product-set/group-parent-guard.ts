import { RELATED_PARENT_SLUG, SET_PARENT_SLUG } from "./group-parents";

const ROLE_BY_SLUG = new Map<string, string>([
  [SET_PARENT_SLUG, "a szett-kedvezmények kiszámítása"],
  [RELATED_PARENT_SLUG, "a termékoldalakon megjelenő kapcsolódó termékek listája"],
]);

export type GroupParentAction =
  { type: "update-slug"; incomingSlug: string } | { type: "delete" } | { type: "move" };

/** The Hungarian error message when a group parent change is not allowed, or undefined when it is. */
export function groupParentViolation(
  storedSlug: string,
  action: GroupParentAction
): string | undefined {
  const role = ROLE_BY_SLUG.get(storedSlug);

  if (role === undefined) {
    return undefined;
  }

  if (action.type === "update-slug" && action.incomingSlug === storedSlug) {
    return undefined;
  }

  return message(storedSlug, role, action.type);
}

/** First violation when incoming translations rename a stored slug, or undefined when allowed. */
export function updateSlugViolation(
  stored: ReadonlyArray<{ languageCode: string; slug: string }>,
  incoming: ReadonlyArray<{ languageCode: string; slug?: string | null }>
): string | undefined {
  for (const translation of incoming) {
    if (translation.slug === undefined || translation.slug === null) {
      continue;
    }

    const storedSlug = stored.find((t) => t.languageCode === translation.languageCode)?.slug;

    if (storedSlug === undefined) {
      continue;
    }

    const violation = groupParentViolation(storedSlug, {
      type: "update-slug",
      incomingSlug: translation.slug,
    });

    if (violation !== undefined) {
      return violation;
    }
  }

  return undefined;
}

function message(slug: string, role: string, actionType: GroupParentAction["type"]): string {
  const what = WHAT_BY_ACTION[actionType];

  return `A(z) „${slug}” gyűjtemény ${what}, mert tőle függ ${role}. ${INSTEAD_BY_ACTION[actionType]}`;
}

const WHAT_BY_ACTION: Record<GroupParentAction["type"], string> = {
  "update-slug": "slug-ja nem módosítható",
  delete: "nem törölhető",
  move: "nem helyezhető át másik gyűjtemény alá",
};

const INSTEAD_BY_ACTION: Record<GroupParentAction["type"], string> = {
  "update-slug":
    "A nevét és a többi beállítását szabadon szerkesztheted, csak a slug (az URL-ben szereplő azonosító) maradjon változatlan. Ha mindenképp új slug kell, a backend kódjában is frissíteni kell a hivatkozást (backend/src/plugins/product-set/group-parents.ts).",
  delete:
    "Ha már nem kell, üresen is hagyható. Ha mégis törölni kellene, előbb egyeztess a fejlesztővel.",
  move: "Hagyd a jelenlegi helyén.",
};
