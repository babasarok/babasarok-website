/**
 * The product-definition editor's per-field editor: one FieldEditor renders a
 * single field row of any kind (its kind-specific inputs plus its option
 * rows), with NumberInput as the shared whole-Forint numeric input.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); at build
 * time the dashboard's vite pipeline bundles this file. The typed graphql
 * documents come from the backend's generated schema (src/gql).
 */
import { useEffect, useState, type ReactElement } from "react";
import { Button, Input, NativeSelect } from "@vendure/dashboard";
import { Switch } from "@/vdb/components/ui/switch.js";
import {
  EMBROIDERY_PRICINGS,
  EMBROIDERY_PRICING_LABELS,
  FIELD_KINDS,
  FIELD_KIND_LABELS,
  PRESENTATIONS,
  PRESENTATION_LABELS,
  type ChoiceFieldInput,
  type ChoiceOptionInput,
  type EmbroideryFieldInput,
  type FieldKind,
  type FieldRow,
  type InputFieldInput,
  type MaterialFieldInput,
  type MaterialOptionInput,
  type ToggleFieldInput,
} from "./product-definition-editor";

/** Numeric text input: types freely (Hungarian comma decimals accepted), and
 * commits on blur — an empty field means 0, an unparseable value reverts. */
export function NumberInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}): ReactElement {
  const parse = (raw: string): number => {
    const normalized = raw.trim().replace(",", ".");

    if (normalized === "" || Number.isNaN(Number(normalized))) {
      return value;
    }

    return Number(normalized);
  };
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((current) => (parse(current) === value ? current : String(value)));
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
      }}
      onBlur={() => {
        const parsed = parse(text);
        setText(String(parsed));
        onChange(parsed);
      }}
    />
  );
}

export interface FieldEditorProps {
  row: FieldRow;
  index: number;
  count: number;
  materialOptions: Array<{ slug: string; label: string }>;
  patchBase: (key: string, id: string, label: string) => void;
  patchChoice: (key: string, patch: Partial<ChoiceFieldInput>) => void;
  patchToggle: (key: string, patch: Partial<ToggleFieldInput>) => void;
  patchMaterial: (key: string, patch: Partial<MaterialFieldInput>) => void;
  patchInputField: (key: string, patch: Partial<InputFieldInput>) => void;
  patchEmbroidery: (key: string, patch: Partial<EmbroideryFieldInput>) => void;
  patchChoiceOptions: (
    key: string,
    transform: (options: ChoiceOptionInput[]) => ChoiceOptionInput[]
  ) => void;
  patchMaterialOptions: (
    key: string,
    transform: (options: MaterialOptionInput[]) => MaterialOptionInput[]
  ) => void;
  changeFieldKind: (key: string, kind: FieldKind) => void;
  removeField: (key: string) => void;
  moveField: (key: string, delta: number) => void;
}

export function FieldEditor({
  row,
  index,
  count,
  materialOptions,
  patchBase,
  patchChoice,
  patchToggle,
  patchMaterial,
  patchInputField,
  patchEmbroidery,
  patchChoiceOptions,
  patchMaterialOptions,
  changeFieldKind,
  removeField,
  moveField,
}: FieldEditorProps): ReactElement {
  const field = row.field;

  function setBase(next: { id: string; label: string }): void {
    patchBase(row.key, next.id, next.label);
  }

  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Típus</span>
          <NativeSelect
            value={field.kind}
            onChange={(e) => {
              const kind = FIELD_KINDS.find((candidate) => candidate === e.target.value);

              if (kind !== undefined) {
                changeFieldKind(row.key, kind);
              }
            }}
          >
            {FIELD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FIELD_KIND_LABELS[kind]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Kód</span>
          <Input
            className="w-32"
            value={field.id}
            onChange={(e) => {
              setBase({ ...field, id: e.target.value });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Név</span>
          <Input
            className="w-44"
            value={field.label}
            onChange={(e) => {
              setBase({ ...field, label: e.target.value });
            }}
          />
        </label>
        {field.kind === "choice" && (
          <label className="flex flex-col gap-1 text-sm">
            <span>Megjelenés</span>
            <NativeSelect
              value={field.presentation}
              onChange={(e) => {
                const presentation = PRESENTATIONS.find(
                  (candidate) => candidate === e.target.value
                );

                if (presentation !== undefined) {
                  patchChoice(row.key, { presentation });
                }
              }}
            >
              {PRESENTATIONS.map((presentation) => (
                <option key={presentation} value={presentation}>
                  {PRESENTATION_LABELS[presentation]}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {field.kind === "toggle" && (
          <label className="flex flex-col gap-1 text-sm">
            <span>Ár ha bekapcsolva (Ft)</span>
            <NumberInput
              className="w-32"
              value={field.price}
              onChange={(price) => {
                patchToggle(row.key, { price });
              }}
            />
          </label>
        )}
        {field.kind === "input" && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={field.required}
                onCheckedChange={(checked) => {
                  patchInputField(row.key, { required: checked });
                }}
              />
              <span>Kötelező</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Ár (Ft)</span>
              <NumberInput
                className="w-28"
                value={field.price}
                onChange={(price) => {
                  patchInputField(row.key, { price });
                }}
              />
            </label>
          </>
        )}
        {field.kind === "embroidery" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span>Árazás</span>
              <NativeSelect
                value={field.pricing.kind}
                onChange={(e) => {
                  const kind = EMBROIDERY_PRICINGS.find(
                    (candidate) => candidate === e.target.value
                  );

                  if (kind === undefined) {
                    return;
                  }

                  // Carry the numeric across the pricing-mode switch.
                  const amount =
                    field.pricing.kind === "per-word"
                      ? field.pricing.pricePerWord
                      : field.pricing.price;

                  patchEmbroidery(row.key, {
                    pricing:
                      kind === "per-word"
                        ? { kind: "per-word", pricePerWord: amount }
                        : { kind: "flat", price: amount },
                  });
                }}
              >
                {EMBROIDERY_PRICINGS.map((kind) => (
                  <option key={kind} value={kind}>
                    {EMBROIDERY_PRICING_LABELS[kind]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{field.pricing.kind === "per-word" ? "Ár / szó (Ft)" : "Ár (Ft)"}</span>
              <NumberInput
                className="w-28"
                value={
                  field.pricing.kind === "per-word"
                    ? field.pricing.pricePerWord
                    : field.pricing.price
                }
                onChange={(value) => {
                  patchEmbroidery(row.key, {
                    pricing:
                      field.pricing.kind === "per-word"
                        ? { kind: "per-word", pricePerWord: value }
                        : { kind: "flat", price: value },
                  });
                }}
              />
            </label>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            disabled={index === 0}
            onClick={() => {
              moveField(row.key, -1);
            }}
          >
            ▲
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={index === count - 1}
            onClick={() => {
              moveField(row.key, 1);
            }}
          >
            ▼
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              removeField(row.key);
            }}
          >
            Mező törlése
          </Button>
        </div>
      </div>

      {field.kind === "choice" && (
        <div className="flex flex-col gap-2">
          {field.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>Kód</span>
                <Input
                  className="w-28"
                  value={option.id}
                  onChange={(e) => {
                    patchChoiceOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === optionIndex ? { ...candidate, id: e.target.value } : candidate
                      )
                    );
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Név</span>
                <Input
                  className="w-40"
                  value={option.label}
                  onChange={(e) => {
                    patchChoiceOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === optionIndex ? { ...candidate, label: e.target.value } : candidate
                      )
                    );
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Ár (Ft)</span>
                <NumberInput
                  className="w-28"
                  value={option.price}
                  onChange={(price) => {
                    patchChoiceOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === optionIndex ? { ...candidate, price } : candidate
                      )
                    );
                  }}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  patchChoiceOptions(row.key, (options) =>
                    options.filter((_, at) => at !== optionIndex)
                  );
                }}
              >
                Sor törlése
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                patchChoiceOptions(row.key, (options) => [
                  ...options,
                  { id: "", label: "", price: 0 },
                ]);
              }}
            >
              + Elem hozzáadása
            </Button>
          </div>
        </div>
      )}

      {field.kind === "material" && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span>Színek száma:</span>
            {field.colorCount.kind === "fixed" ? (
              <NumberInput
                className="w-20"
                value={field.colorCount.count}
                onChange={(count) => {
                  patchMaterial(row.key, { colorCount: { kind: "fixed", count } });
                }}
              />
            ) : (
              <span className="text-xs">
                mezőből ({field.colorCount.fieldId}) — nem itt szerkeszthető
              </span>
            )}
          </label>
          {field.options.map((entry, entryIndex) => (
            <div key={entryIndex} className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>Anyag</span>
                <NativeSelect
                  className="w-52"
                  value={entry.materialId}
                  onChange={(e) => {
                    patchMaterialOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === entryIndex ? { ...candidate, materialId: e.target.value } : candidate
                      )
                    );
                  }}
                >
                  <option value="">Válassz anyagot…</option>
                  {materialOptions.map((material) => (
                    <option key={material.slug} value={material.slug}>
                      {material.label} ({material.slug})
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Felár (Ft)</span>
                <NumberInput
                  className="w-28"
                  value={entry.price}
                  onChange={(price) => {
                    patchMaterialOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === entryIndex ? { ...candidate, price } : candidate
                      )
                    );
                  }}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  patchMaterialOptions(row.key, (options) =>
                    options.filter((_, at) => at !== entryIndex)
                  );
                }}
              >
                Sor törlése
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                patchMaterialOptions(row.key, (options) => [
                  ...options,
                  { materialId: "", price: 0 },
                ]);
              }}
            >
              + Anyag hozzáadása
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
