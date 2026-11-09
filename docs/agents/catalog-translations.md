# Catalog translations in Vendure

What a new catalog language involves, and the traps found while uploading
English to prod (2026-11-09). Hungarian (`hu`) is the source language: a new
language is added next to it, and `hu` rows are never changed.

## Where catalog text lives

| Entity                | Translated fields                                                            |
| --------------------- | ---------------------------------------------------------------------------- |
| Product               | name, slug, description; translation custom fields shortDescription, tagline |
| Facet, FacetValue     | name                                                                         |
| Collection            | name, slug, description                                                      |
| Promotion             | name, description                                                            |
| ShippingMethod        | name, description                                                            |
| Material / its colors | label, subtitle, description / label                                         |
| Product definition    | every `{ hu, … }` text object inside the definition JSON                     |

A product's single native variant takes the product's names from the
definition sync (ADR 0016); variants carry no text of their own.

## Writing a new language row

- Update mutations take the entity's `translations` list. Send every existing
  row unchanged plus the new language's row.
- A new row needs its required field (`name`, or `label` for materials and
  colors); a material's subtitle or description cannot be added without its
  label. Product and Collection need a slug per language: the Hungarian slug
  is reused, with `description: ""`.
- `updateMaterial` replaces the material wholesale, including the color list
  (`replaceColors`): send the slug, `thumbnailAssetId` and every color with
  its `hex`, `assetId` and translations, or colors are lost.

## Custom fields are wiped by translations-only updates

A translations-only `updateShippingMethod` resets the method's custom fields
to `null`: on 2026-11-09 `requiresAddress` became `null` on prod and the
checkout showed no delivery options until the values were restored by hand.
Product (`date`, `iconId`, `popularityRank`, translation `shortDescription` /
`tagline`) and FacetValue (`hex`, `swatchId`) custom fields survived the same
kind of update in an integration red run (PR #110). Any write that sends
translations also sends the entity's current custom fields, and after a bulk
write the custom fields of every touched entity are compared with their
values before it.

## Load on the prod worker

A definition save and a product rename each queue one
`product-definition-sync` job, so translating every product's name and
definition text queues two jobs per product. Write one entity, wait until
the queue has no PENDING / RUNNING / RETRYING job on two polls in a row
(event-driven enqueues land just after the mutation returns), then continue.
The admin API's `jobs` query filtered by `queueName` and `state` reads the
queue; on the box, `SELECT state, COUNT(*) FROM job_record GROUP BY 1`. The
API answers with proxy 502 pages for 1–2 minutes while it restarts, so a
long run retries rather than aborts.

## Verifying an upload

After writing, every written string reads back as its translation, and every
other string (Hungarian sources and the target language) is unchanged. Check
the custom fields of the touched entities in the same pass.

## History

The English catalog strings uploaded on 2026-11-09 are backed up on the prod
box as `/root/strings.json` and `/root/translations.json`. The upload CLI
that did it (`backend/scripts/translations/`, added in commit `ede32009`) was
removed: it duplicated the catalog schema and had to change with every
schema change. Its code is recoverable from that commit.
