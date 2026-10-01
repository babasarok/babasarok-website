<script lang="ts">
  import Icon from "@iconify/svelte";
  import type { BasketPricing } from "@/lib/pricing/setDiscount";
  import { buildMaterialParams } from "@/lib/order/queryParams";
  import type { CmsEnhancedProduct, CmsProductGroup } from "@/lib/data";
  import type { IProduct } from "@/lib/types.svelte";

  interface Props {
    basket: IProduct[];
    /** The basket's set pricing, resolved once by the checkout form. */
    pricing: BasketPricing;
    products: Record<string, CmsEnhancedProduct>;
    productGroups: CmsProductGroup[];
    slugByProductId: Record<string, string | undefined>;
    /** Highlight the given basket lines (a set's members) elsewhere in the form. */
    onHighlight?: (uuids: string[]) => void;
  }

  let { basket, pricing, products, productGroups, slugByProductId, onHighlight }: Props = $props();

  interface Sibling {
    product: CmsEnhancedProduct;
    href: string | undefined;
  }
  interface PartnerOpportunity {
    kind: "partner";
    setTitle: string;
    /** The basket products already present that the set is waiting on. */
    anchors: string[];
    /** Their line uuids, so the card can highlight them like the set cards. */
    anchorUuids: string[];
    siblings: Sibling[];
  }
  interface MaterialOpportunity {
    kind: "material";
    setTitle: string;
    /** The basket line whose materials differ. */
    title: string;
    /** The in-basket sibling it should be matched to (may be unknown). */
    partnerTitle: string | undefined;
    /** The line + its partner, so the card can highlight them like the set cards. */
    uuids: string[];
    editHref: string | undefined;
  }

  const statuses = $derived(
    basket.map((item) => ({
      item,
      status: pricing.statuses.get(item.uuid),
    }))
  );

  // Formed set-discount instances, resolved once for the whole basket. Each
  // carries its member lines (uuid + title, to drive cross-highlighting), the
  // set's other products that this instance didn't include, and the forint
  // amount it takes off (clamped to the covered subtotal).
  const activeInstances = $derived.by(() => {
    const byUuid = new Map(basket.map((p) => [p.uuid, p]));
    return pricing.instances.map((instance) => {
      const members = instance.members.map((uuid) => ({
        uuid,
        title: byUuid.get(uuid)?.title ?? uuid,
      }));
      const includedIds = new Set(
        instance.members
          .map((uuid) => byUuid.get(uuid)?.product_id)
          .filter((id) => id !== undefined)
      );
      const group = productGroups.find((g) => g.title === instance.setTitle);
      const excluded = (group?.products ?? [])
        .filter((m) => !includedIds.has(m.product_id) && Object.hasOwn(products, m.product_id))
        .map((m) => products[m.product_id].title);
      return {
        setTitle: instance.setTitle,
        members,
        excluded,
        amount: instance.amount,
      };
    });
  });

  // Only a formed-set card pins (it has no other action); it keeps its members
  // highlighted after the pointer leaves and drives touch/keyboard. The
  // opportunity cards just highlight their lines while hovered or focused.
  let pinned = $state<number | undefined>();

  function memberUuids(index: number): string[] {
    return activeInstances[index]?.members.map((m) => m.uuid) ?? [];
  }
  function highlight(uuids: string[]): void {
    onHighlight?.(uuids);
  }
  function leave(): void {
    onHighlight?.(pinned === undefined ? [] : memberUuids(pinned));
  }
  function togglePin(index: number): void {
    pinned = pinned === index ? undefined : index;
    onHighlight?.(pinned === undefined ? [] : memberUuids(index));
  }

  // The set members still missing from the basket, keyed link-outs to add them
  // with the current item's materials preselected (so the discount lands).
  const partnerOpportunities = $derived.by(() => {
    const out: PartnerOpportunity[] = [];
    const seen: string[] = [];
    const inBasket: Record<string, true> = {};
    for (const p of basket) {
      inBasket[p.product_id] = true;
    }
    for (const { item, status } of statuses) {
      if (status?.state !== "pending-partner" || seen.includes(status.setTitle)) {
        continue;
      }
      const group = productGroups.find(
        (g) =>
          g.title === status.setTitle && g.products.some((m) => m.product_id === item.product_id)
      );
      if (!group) {
        continue;
      }
      const query = buildMaterialParams(item).toString();
      const siblings = group.products
        .filter(
          (m) =>
            m.product_id !== item.product_id &&
            !Object.hasOwn(inBasket, m.product_id) &&
            Object.hasOwn(products, m.product_id)
        )
        .map((m): Sibling => {
          const product = products[m.product_id];
          const slug = slugByProductId[product.product_id];
          return {
            product,
            href: slug ? `/product/${slug}/${query ? `?${query}` : ""}` : undefined,
          };
        });
      if (siblings.length === 0) {
        continue;
      }
      seen.push(status.setTitle);
      // Every basket product already present that is waiting on this set
      // (not just the first one, which the dedupe keys on).
      const anchors: string[] = [];
      const anchorUuids: string[] = [];
      for (const { item: p, status: s } of statuses) {
        if (s?.state === "pending-partner" && s.setTitle === status.setTitle) {
          anchors.push(p.title);
          anchorUuids.push(p.uuid);
        }
      }
      out.push({ kind: "partner", setTitle: status.setTitle, anchors, anchorUuids, siblings });
    }
    return out;
  });

  // A set sibling is in the basket but its materials differ; nudge the user to
  // edit the item back on its product page so the materials match.
  const materialOpportunities = $derived.by(() => {
    const out: MaterialOpportunity[] = [];
    for (const { item, status } of statuses) {
      if (status?.state !== "pending-material") {
        continue;
      }
      const slug = slugByProductId[item.product_id];
      const partner = basket.find((p) => p.uuid === status.partnerUuid);
      out.push({
        kind: "material",
        setTitle: status.setTitle,
        title: item.title,
        partnerTitle: partner?.title,
        uuids: [item.uuid, ...(partner ? [partner.uuid] : [])],
        editHref: slug ? `/product/${slug}/?uuid=${item.uuid}` : undefined,
      });
    }
    return out;
  });

  const hasOpportunities = $derived(
    partnerOpportunities.length > 0 || materialOpportunities.length > 0
  );
</script>

{#if activeInstances.length > 0 || hasOpportunities}
  <section class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-brown-50 p-5">
    <div class="flex items-center gap-2">
      <Icon icon="mdi:tag-multiple" class="shrink-0 text-2xl text-brown-500" />
      <h2 class="text-lg font-semibold text-headings">Szett kedvezmények</h2>
    </div>

    {#if activeInstances.length > 0}
      <div class="flex flex-col gap-2">
        {#each activeInstances as instance, i (`${instance.setTitle}-${i}`)}
          <button
            type="button"
            aria-pressed={pinned === i}
            onmouseenter={() => highlight(memberUuids(i))}
            onmouseleave={leave}
            onfocus={() => highlight(memberUuids(i))}
            onblur={leave}
            onclick={() => togglePin(i)}
            class={[
              "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border bg-success-50 px-3 py-2 text-left transition-shadow",
              pinned === i
                ? "border-success-600 ring-2 ring-success-500"
                : "border-success-600 hover:shadow-md",
            ]}
          >
            <span class="flex w-full items-center gap-2">
              <span class="flex items-center gap-1 text-sm font-semibold text-success-800">
                <Icon icon="mdi:check-circle" class="shrink-0 text-success-700" />
                {instance.setTitle} szett
              </span>
              <span class="ml-auto text-sm font-semibold text-success-800">
                −{instance.amount.toLocaleString("hu-HU")} Ft
              </span>
            </span>
            <ul class="w-full list-disc pl-5 text-sm text-brown-600">
              {#each instance.members as member (member.uuid)}
                <li>{member.title}</li>
              {/each}
            </ul>
            {#if instance.excluded.length > 0}
              <span class="w-full text-xs text-brown-400">
                Nem része ennek a szettnek: {instance.excluded.join(", ")}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    {#each partnerOpportunities as op, i (`${op.setTitle}-${i}`)}
      <div
        class="flex flex-col gap-3 rounded-xl border border-brown-200 bg-white p-4 transition-shadow focus-within:shadow-md hover:shadow-md"
        onmouseenter={() => highlight(op.anchorUuids)}
        onmouseleave={leave}
        onfocusin={() => highlight(op.anchorUuids)}
        onfocusout={leave}
        role="group"
      >
        <p class="text-sm text-brown-600">
          Szerezd meg a <span class="font-medium">{op.setTitle}</span> szett kedvezményt! Add hozzá
          a hiányzó darabokat ugyanazzal az anyaggal, mint a
          <span class="font-medium">{op.anchors.join(", ")}</span>:
        </p>
        <div class="flex flex-wrap gap-3">
          {#each op.siblings as sibling (sibling.product.product_id)}
            <a
              href={sibling.href}
              class="flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-brown-200 bg-white transition-shadow hover:shadow-md"
            >
              <div class="relative aspect-square bg-brown-50">
                {#if sibling.product.thumbnail}
                  <img
                    src={sibling.product.thumbnail.src}
                    srcset={sibling.product.thumbnail.srcSet.attribute || undefined}
                    {...sibling.product.thumbnail.attributes}
                    alt={sibling.product.title}
                    class="size-full object-cover"
                  />
                {:else}
                  <div class="grid size-full place-items-center text-brown-300">
                    <Icon icon="mdi:image-outline" class="text-3xl" />
                  </div>
                {/if}
              </div>
              <div class="flex flex-1 flex-col gap-1 p-2">
                <p class="text-sm font-medium leading-tight text-dark">{sibling.product.title}</p>
                {#if sibling.product.price}
                  <p class="text-xs text-brown-500">{sibling.product.price} Ft-tól</p>
                {/if}
                <span
                  class="mt-auto flex items-center justify-center gap-1 rounded-full border border-brown-300 px-2 py-1 text-xs font-medium"
                >
                  <Icon icon="mdi:plus" class="shrink-0" />
                  Hozzáadom
                </span>
              </div>
            </a>
          {/each}
        </div>
      </div>
    {/each}

    {#each materialOpportunities as op, i (`${op.title}-${op.setTitle}-${i}`)}
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brown-200 bg-white p-4 transition-shadow focus-within:shadow-md hover:shadow-md"
        onmouseenter={() => highlight(op.uuids)}
        onmouseleave={leave}
        onfocusin={() => highlight(op.uuids)}
        onfocusout={leave}
        role="group"
      >
        <div class="flex flex-col gap-1">
          <span class="flex items-center gap-1 text-sm font-semibold text-brown-700">
            <Icon icon="mdi:alert-circle-outline" class="shrink-0 text-brown-500" />
            {op.setTitle} szett
          </span>
          <ul class="list-disc pl-5 text-sm text-brown-600">
            <li>{op.title} <span class="text-brown-400">(anyagot cseréld)</span></li>
            {#if op.partnerTitle}
              <li>{op.partnerTitle} <span class="text-brown-400">(erre az anyagra)</span></li>
            {/if}
          </ul>
        </div>
        {#if op.editHref}
          <a
            href={op.editHref}
            class="flex items-center gap-1 rounded-full border border-brown-300 px-3 py-1 text-sm font-medium transition-all hover:bg-brown-100"
          >
            <Icon icon="mdi:pencil" class="shrink-0" />
            Anyag módosítása
          </a>
        {/if}
      </div>
    {/each}
  </section>
{/if}
