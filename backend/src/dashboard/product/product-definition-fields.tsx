/**
 * The product-definition editor's per-field editor: one FieldEditor renders a
 * single field row of any kind as a collapsible card with Alapadatok / Beállítások /
 * Speciális sections, with NumberInput as the shared whole-Forint numeric
 * input.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); at build
 * time the dashboard's vite pipeline bundles this file. The typed graphql
 * documents come from the backend's generated schema (src/gql).
 */
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Badge, Button, Input, NativeSelect } from "@vendure/dashboard";
import { Switch } from "@/vdb/components/ui/switch.js";
import { DEFAULT_TEXT_LANGUAGE } from "../../shared/product-definition/index";
import {
  EMBROIDERY_PRICINGS,
  EMBROIDERY_PRICING_LABELS,
  FIELD_KINDS,
  FIELD_KIND_LABELS,
  PRESENTATIONS,
  PRESENTATION_LABELS,
  generateFieldId,
  slugifyLabel,
  summaryChips,
  textPlaceholder,
  textValue,
  withColorCountMode,
  withCustomValue,
  withText,
  withVisibility,
  withLengthSourcePattern,
  type ChoiceFieldInput,
  type ChoiceOptionInput,
  type EmbroideryFieldInput,
  type FieldInput,
  type FieldKind,
  type FieldRow,
  type InputFieldInput,
  type MaterialFieldInput,
  type TextInput,
  type ToggleFieldInput,
} from "./product-definition-editor";

/** Numeric text input: types freely (Hungarian comma decimals accepted), and
 * commits on blur — an empty or unparseable value reverts to the previous one. */
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

/** The text after the edit, or `undefined` when every language is blank — the
 * caller decides whether an optional text is removed entirely. */
function optionalText(
  text: TextInput | undefined,
  language: string,
  value: string
): TextInput | undefined {
  const next = withText(text ?? { hu: "" }, language, value);

  if (Object.values(next).every((entry) => entry === "")) {
    return undefined;
  }

  return next;
}

function reordered<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;

  if (target < 0 || target >= items.length) {
    return items;
  }

  const moved = [...items];
  const [taken] = moved.splice(index, 1);
  moved.splice(target, 0, taken);
  return moved;
}

function LocalizedInput({
  label,
  text,
  language,
  width,
  onBlur,
  onChange,
}: {
  label: string;
  text: TextInput | undefined;
  language: string;
  width?: string;
  onBlur?: () => void;
  onChange: (text: TextInput | undefined) => void;
}): ReactElement {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <Input
        className={width}
        value={textValue(text, language)}
        placeholder={textPlaceholder(text, language)}
        onBlur={onBlur}
        onChange={(e) => {
          onChange(optionalText(text, language, e.target.value));
        }}
      />
    </label>
  );
}

function ReorderButtons({
  index,
  count,
  upLabel,
  downLabel,
  onMove,
}: {
  index: number;
  count: number;
  upLabel: string;
  downLabel: string;
  onMove: (delta: number) => void;
}): ReactElement {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        aria-label={upLabel}
        disabled={index === 0}
        onClick={() => {
          onMove(-1);
        }}
      >
        ▲
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label={downLabel}
        disabled={index === count - 1}
        onClick={() => {
          onMove(1);
        }}
      >
        ▼
      </Button>
    </>
  );
}

function FieldSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactElement;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-semibold uppercase">{title}</span>
        {action}
      </div>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function DetailsToggle({
  rowKey,
  revealDetails,
  onDetailsToggle,
}: {
  rowKey: string;
  revealDetails: boolean;
  onDetailsToggle: (key: string, reveal: boolean) => void;
}): ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch
        checked={revealDetails}
        onCheckedChange={(checked) => {
          onDetailsToggle(rowKey, checked);
        }}
      />
      <span>Részletek</span>
    </label>
  );
}

function ChoiceSettings({
  field,
  language,
  revealDetails,
  showValues,
  isSource,
  isNumericSource,
  sourceErrors,
  baselineOptions,
  onFieldChange,
}: {
  field: ChoiceFieldInput;
  language: string;
  revealDetails: boolean;
  showValues: boolean;
  isSource: boolean;
  isNumericSource: boolean;
  sourceErrors: string[];
  baselineOptions: ChoiceOptionInput[] | undefined;
  onFieldChange: (field: FieldInput) => void;
}): ReactElement {
  function updateOptions(options: ChoiceOptionInput[]): void {
    onFieldChange({ ...field, options });
  }

  return (
    <div className="flex flex-col gap-3">
      {field.options.map((option, optionIndex) => {
        const saved = baselineOptions?.[optionIndex]?.id;
        const renamed = saved !== undefined && saved !== "" && saved !== option.id;

        return (
          <div key={optionIndex} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-end gap-2">
              {showValues && (
                <label className="flex flex-col gap-1 text-sm">
                  <span>Érték</span>
                  <Input
                    className="w-28 font-mono"
                    value={option.id}
                    placeholder={slugifyLabel(option.label.hu) || "opció"}
                    onChange={(e) => {
                      updateOptions(
                        field.options.map((candidate, at) =>
                          at === optionIndex ? { ...candidate, id: e.target.value } : candidate
                        )
                      );
                    }}
                  />
                </label>
              )}
              <LocalizedInput
                label="Név"
                text={option.label}
                language={language}
                width="w-40"
                onChange={(next) => {
                  updateOptions(
                    field.options.map((candidate, at) =>
                      at === optionIndex ? { ...candidate, label: next ?? { hu: "" } } : candidate
                    )
                  );
                }}
              />
              {revealDetails && !isSource && (
                <label className="flex flex-col gap-1 text-sm">
                  <span>Ár (Ft)</span>
                  <NumberInput
                    className="w-28"
                    value={option.price}
                    onChange={(price) => {
                      updateOptions(
                        field.options.map((candidate, at) =>
                          at === optionIndex ? { ...candidate, price } : candidate
                        )
                      );
                    }}
                  />
                </label>
              )}
              {revealDetails && (
                <LocalizedInput
                  label="Súgó"
                  text={option.tooltip}
                  language={language}
                  width="w-40"
                  onChange={(next) => {
                    updateOptions(
                      field.options.map((candidate, at) => {
                        if (at !== optionIndex) {
                          return candidate;
                        }

                        if (next === undefined) {
                          const { tooltip: _removed, ...rest } = candidate;

                          return rest;
                        }

                        return { ...candidate, tooltip: next };
                      })
                    );
                  }}
                />
              )}
              <ReorderButtons
                index={optionIndex}
                count={field.options.length}
                upLabel="Sor feljebb"
                downLabel="Sor lejjebb"
                onMove={(delta) => {
                  updateOptions(reordered(field.options, optionIndex, delta));
                }}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  updateOptions(field.options.filter((_, at) => at !== optionIndex));
                }}
              >
                Sor törlése
              </Button>
            </div>
            {renamed && (
              <p className="text-destructive text-xs">
                A mentett „{saved}” érték megváltozott — a korábbi választások már nem egyeznek
                vele.
              </p>
            )}
          </div>
        );
      })}
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            updateOptions([...field.options, { id: "", label: { hu: "" }, price: 0 }]);
          }}
        >
          + Opció hozzáadása
        </Button>
      </div>
      {sourceErrors.length > 0 && (
        <ul className="text-destructive space-y-1 text-xs">
          {sourceErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={field.customValue !== undefined}
            onCheckedChange={(checked) => {
              const next = withCustomValue(field, checked);

              onFieldChange(isNumericSource ? withLengthSourcePattern(next) : next);
            }}
          />
          <span>Egyéni érték</span>
        </label>
        {field.customValue !== undefined && (
          <CustomValueInputs
            field={field}
            customValue={field.customValue}
            language={language}
            isNumericSource={isNumericSource}
            onFieldChange={onFieldChange}
          />
        )}
      </div>
    </div>
  );
}

function CustomValueInputs({
  field,
  customValue,
  language,
  isNumericSource,
  onFieldChange,
}: {
  field: ChoiceFieldInput;
  customValue: NonNullable<ChoiceFieldInput["customValue"]>;
  language: string;
  isNumericSource: boolean;
  onFieldChange: (field: FieldInput) => void;
}): ReactElement {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span>Minta (regex)</span>
        <Input
          className="w-56 font-mono"
          value={customValue.pattern ?? ""}
          disabled={isNumericSource}
          onChange={(e) => {
            const value = e.target.value;

            if (value === "") {
              const { pattern: _removed, ...rest } = customValue;

              onFieldChange({ ...field, customValue: rest });
              return;
            }

            onFieldChange({ ...field, customValue: { ...customValue, pattern: value } });
          }}
        />
      </label>
      <LocalizedInput
        label="Helyőrző szöveg"
        text={customValue.placeholder}
        language={language}
        onChange={(next) => {
          if (next === undefined) {
            const { placeholder: _removed, ...rest } = customValue;

            onFieldChange({ ...field, customValue: rest });
            return;
          }

          onFieldChange({ ...field, customValue: { ...customValue, placeholder: next } });
        }}
      />
    </>
  );
}

function ToggleSettings({
  field,
  onFieldChange,
}: {
  field: ToggleFieldInput;
  onFieldChange: (field: FieldInput) => void;
}): ReactElement {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>Ár bekapcsolt állapotban (Ft)</span>
      <NumberInput
        className="w-32"
        value={field.price}
        onChange={(price) => {
          onFieldChange({ ...field, price });
        }}
      />
    </label>
  );
}

function MaterialSettings({
  field,
  language,
  materialOptions,
  fields,
  colorCountErrors,
  revealDetails,
  onFieldChange,
}: {
  field: MaterialFieldInput;
  language: string;
  materialOptions: Array<{ slug: string; label: string }>;
  fields: FieldInput[] | undefined;
  colorCountErrors: string[];
  revealDetails: boolean;
  onFieldChange: (field: FieldInput) => void;
}): ReactElement {
  const colorCountCandidates = (fields ?? []).filter(
    (candidate) =>
      (candidate.kind === "input" || candidate.kind === "choice") && candidate.id !== ""
  );
  const previousSource =
    field.colorCount.kind === "from-field" ? field.colorCount.fieldId : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Színek száma</span>
          <NativeSelect
            className="w-36"
            value={field.colorCount.kind}
            onChange={(e) => {
              if (e.target.value === "from-field") {
                onFieldChange(withColorCountMode(field, "from-field", previousSource));
                return;
              }

              onFieldChange(withColorCountMode(field, "fixed"));
            }}
          >
            <option value="fixed">Rögzített</option>
            <option value="from-field">Mezőből</option>
          </NativeSelect>
        </label>
        {field.colorCount.kind === "fixed" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>Darab</span>
            <NumberInput
              className="w-20"
              value={field.colorCount.count}
              onChange={(count) => {
                onFieldChange({ ...field, colorCount: { kind: "fixed", count } });
              }}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span>Mező</span>
            <NativeSelect
              className="w-52"
              value={field.colorCount.fieldId}
              onChange={(e) => {
                onFieldChange(withColorCountMode(field, "from-field", e.target.value));
              }}
            >
              <option value="">Válassz mezőt…</option>
              {colorCountCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {textValue(candidate.label, language) || candidate.id}
                </option>
              ))}
            </NativeSelect>
            <span className="text-muted-foreground text-xs">
              A vásárló által megadott szám adja a színek számát, ezért a forrásmező minden
              értékének egész számnak kell lennie.
            </span>
          </label>
        )}
      </div>
      {colorCountErrors.length > 0 && (
        <ul className="text-destructive space-y-1 text-xs">
          {colorCountErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {field.options.map((entry, entryIndex) => (
        <div key={entryIndex} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Anyag</span>
            <NativeSelect
              className="w-52"
              value={entry.materialId}
              onChange={(e) => {
                onFieldChange({
                  ...field,
                  options: field.options.map((candidate, at) =>
                    at === entryIndex ? { ...candidate, materialId: e.target.value } : candidate
                  ),
                });
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
          {revealDetails && (
            <label className="flex flex-col gap-1 text-sm">
              <span>Felár (Ft)</span>
              <NumberInput
                className="w-28"
                value={entry.price}
                onChange={(price) => {
                  onFieldChange({
                    ...field,
                    options: field.options.map((candidate, at) =>
                      at === entryIndex ? { ...candidate, price } : candidate
                    ),
                  });
                }}
              />
            </label>
          )}
          <ReorderButtons
            index={entryIndex}
            count={field.options.length}
            upLabel="Sor feljebb"
            downLabel="Sor lejjebb"
            onMove={(delta) => {
              onFieldChange({ ...field, options: reordered(field.options, entryIndex, delta) });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onFieldChange({
                ...field,
                options: field.options.filter((_, at) => at !== entryIndex),
              });
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
            onFieldChange({ ...field, options: [...field.options, { materialId: "", price: 0 }] });
          }}
        >
          + Anyag hozzáadása
        </Button>
      </div>
    </div>
  );
}

function InputSettings({
  field,
  language,
  isSource,
  isNumericSource,
  onFieldChange,
}: {
  field: InputFieldInput;
  language: string;
  isSource: boolean;
  isNumericSource: boolean;
  onFieldChange: (field: FieldInput) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        {!isSource && (
          <label className="flex flex-col gap-1 text-sm">
            <span>Ár (Ft)</span>
            <NumberInput
              className="w-28"
              value={field.price}
              onChange={(price) => {
                onFieldChange({ ...field, price });
              }}
            />
          </label>
        )}
        <LocalizedInput
          label="Helyőrző szöveg"
          text={field.placeholder}
          language={language}
          onChange={(next) => {
            if (next === undefined) {
              const { placeholder: _removed, ...rest } = field;

              onFieldChange(rest);
              return;
            }

            onFieldChange({ ...field, placeholder: next });
          }}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span>Minta (regex)</span>
          <Input
            className="w-56 font-mono"
            value={field.pattern ?? ""}
            disabled={isNumericSource}
            onChange={(e) => {
              const value = e.target.value;

              if (value === "") {
                const { pattern: _removed, ...rest } = field;

                onFieldChange(rest);
                return;
              }

              onFieldChange({ ...field, pattern: value });
            }}
          />
        </label>
      </div>
      {field.suggestions !== undefined && (
        <SuggestionGrid
          suggestions={field.suggestions}
          language={language}
          onChange={(next) => {
            if (next.length === 0) {
              const { suggestions: _removed, ...rest } = field;

              onFieldChange(rest);
              return;
            }

            onFieldChange({ ...field, suggestions: next });
          }}
        />
      )}
    </div>
  );
}

function SuggestionGrid({
  suggestions,
  language,
  onChange,
}: {
  suggestions: NonNullable<InputFieldInput["suggestions"]>;
  language: string;
  onChange: (suggestions: NonNullable<InputFieldInput["suggestions"]>) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      {suggestions.map((suggestion, suggestionIndex) => (
        <div key={suggestionIndex} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Érték</span>
            <Input
              className="w-40 font-mono"
              value={suggestion.value}
              onChange={(e) => {
                onChange(
                  suggestions.map((candidate, at) =>
                    at === suggestionIndex ? { ...candidate, value: e.target.value } : candidate
                  )
                );
              }}
            />
          </label>
          <LocalizedInput
            label="Név"
            text={suggestion.label}
            language={language}
            width="w-40"
            onChange={(next) => {
              onChange(
                suggestions.map((candidate, at) =>
                  at === suggestionIndex ? { ...candidate, label: next ?? { hu: "" } } : candidate
                )
              );
            }}
          />
          <ReorderButtons
            index={suggestionIndex}
            count={suggestions.length}
            upLabel="Sor feljebb"
            downLabel="Sor lejjebb"
            onMove={(delta) => {
              onChange(reordered(suggestions, suggestionIndex, delta));
            }}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onChange(suggestions.filter((_, at) => at !== suggestionIndex));
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
            onChange([...suggestions, { value: "", label: { hu: "" } }]);
          }}
        >
          + Javaslat hozzáadása
        </Button>
      </div>
    </div>
  );
}

function EmbroiderySettings({
  field,
  language,
  onFieldChange,
}: {
  field: EmbroideryFieldInput;
  language: string;
  onFieldChange: (field: FieldInput) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Árazás</span>
          <NativeSelect
            className="w-36"
            value={field.pricing.kind}
            onChange={(e) => {
              const kind = EMBROIDERY_PRICINGS.find((candidate) => candidate === e.target.value);

              if (kind === undefined) {
                return;
              }

              const amount =
                field.pricing.kind === "per-word"
                  ? field.pricing.pricePerWord
                  : field.pricing.price;

              onFieldChange({
                ...field,
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
          <span>{field.pricing.kind === "per-word" ? "Ár szavanként (Ft)" : "Ár (Ft)"}</span>
          <NumberInput
            className="w-28"
            value={
              field.pricing.kind === "per-word" ? field.pricing.pricePerWord : field.pricing.price
            }
            onChange={(value) => {
              onFieldChange({
                ...field,
                pricing:
                  field.pricing.kind === "per-word"
                    ? { kind: "per-word", pricePerWord: value }
                    : { kind: "flat", price: value },
              });
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <LocalizedInput
          label="Helyőrző szöveg"
          text={field.placeholder}
          language={language}
          onChange={(next) => {
            if (next === undefined) {
              const { placeholder: _removed, ...rest } = field;

              onFieldChange(rest);
              return;
            }

            onFieldChange({ ...field, placeholder: next });
          }}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span>Minta (regex)</span>
          <Input
            className="w-56 font-mono"
            value={field.pattern ?? ""}
            onChange={(e) => {
              const value = e.target.value;

              if (value === "") {
                const { pattern: _removed, ...rest } = field;

                onFieldChange(rest);
                return;
              }

              onFieldChange({ ...field, pattern: value });
            }}
          />
        </label>
      </div>
    </div>
  );
}

type VisibilityField = Exclude<FieldInput, MaterialFieldInput>;

function VisibilityEditor({
  field,
  fields,
  language,
  onFieldChange,
}: {
  field: VisibilityField;
  fields: FieldInput[];
  language: string;
  onFieldChange: (field: FieldInput) => void;
}): ReactElement {
  const candidates = fields.filter(
    (candidate) => candidate.kind !== "material" && candidate.id !== "" && candidate.id !== field.id
  );
  const whenEqual = field.visibility.kind === "when-equal" ? field.visibility : undefined;

  function referencedOf(fieldId: string): VisibilityField | undefined {
    const referenced = fields.find((candidate) => candidate.id === fieldId);

    if (referenced === undefined || referenced.kind === "material") {
      return undefined;
    }

    return referenced;
  }

  function initialValueFor(referenced: VisibilityField | undefined): string | boolean {
    if (referenced === undefined) {
      return "";
    }

    if (referenced.kind === "choice") {
      return referenced.options[0]?.id ?? "";
    }

    if (referenced.kind === "toggle") {
      return true;
    }

    return "";
  }

  function patchVisibility(rule: VisibilityField["visibility"]): void {
    onFieldChange(withVisibility(field, rule));
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span>Láthatóság</span>
        <NativeSelect
          className="w-40"
          value={field.visibility.kind}
          onChange={(e) => {
            if (e.target.value === "when-present") {
              patchVisibility({ kind: "when-present", fieldId: candidates[0]?.id ?? "" });
              return;
            }

            if (e.target.value === "when-equal") {
              const first = candidates[0]?.id ?? "";

              patchVisibility({
                kind: "when-equal",
                fieldId: first,
                value: initialValueFor(referencedOf(first)),
              });
              return;
            }

            patchVisibility({ kind: "always" });
          }}
        >
          <option value="always">Mindig</option>
          <option value="when-present">Ha kitöltve</option>
          <option value="when-equal">Ha az értéke =</option>
        </NativeSelect>
      </label>
      {field.visibility.kind !== "always" && (
        <label className="flex flex-col gap-1 text-sm">
          <span>Mező</span>
          <NativeSelect
            className="w-52"
            value={field.visibility.fieldId}
            onChange={(e) => {
              const fieldId = e.target.value;

              if (field.visibility.kind === "when-present") {
                patchVisibility({ kind: "when-present", fieldId });
                return;
              }

              patchVisibility({
                kind: "when-equal",
                fieldId,
                value: initialValueFor(referencedOf(fieldId)),
              });
            }}
          >
            <option value="">Válassz mezőt…</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {textValue(candidate.label, language) || candidate.id}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      {whenEqual !== undefined && (
        <VisibilityValueInput
          rule={whenEqual}
          referenced={referencedOf(whenEqual.fieldId)}
          onValue={(value) => {
            patchVisibility({ kind: "when-equal", fieldId: whenEqual.fieldId, value });
          }}
        />
      )}
    </div>
  );
}

function VisibilityValueInput({
  rule,
  referenced,
  onValue,
}: {
  rule: Extract<VisibilityField["visibility"], { kind: "when-equal" }>;
  referenced: VisibilityField | undefined;
  onValue: (value: string | boolean) => void;
}): ReactElement {
  if (referenced !== undefined && referenced.kind === "toggle") {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span>Érték</span>
        <NativeSelect
          className="w-40"
          value={typeof rule.value === "boolean" ? String(rule.value) : ""}
          onChange={(e) => {
            onValue(e.target.value === "true");
          }}
        >
          <option value="true">Bekapcsolva</option>
          <option value="false">Kikapcsolva</option>
        </NativeSelect>
      </label>
    );
  }

  if (referenced !== undefined && referenced.kind === "choice") {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span>Érték</span>
        <NativeSelect
          className="w-40"
          value={typeof rule.value === "string" ? rule.value : ""}
          onChange={(e) => {
            onValue(e.target.value);
          }}
        >
          {referenced.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label.hu}
            </option>
          ))}
        </NativeSelect>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>Érték</span>
      <Input
        className="w-40"
        value={typeof rule.value === "string" ? rule.value : ""}
        onChange={(e) => {
          onValue(e.target.value);
        }}
      />
    </label>
  );
}

export interface FieldEditorProps {
  row: FieldRow;
  index: number;
  count: number;
  materialOptions: Array<{ slug: string; label: string }>;
  language: string;
  setField: (key: string, field: FieldInput) => void;
  changeFieldKind: (key: string, kind: FieldKind) => void;
  removeField: (key: string) => void;
  moveField: (key: string, delta: number) => void;
  expanded: boolean;
  onExpandedChange: (key: string, expanded: boolean) => void;
  revealDetails: boolean;
  onDetailsToggle: (key: string, reveal: boolean) => void;
  sourceFieldId: string | undefined;
  sourceValueErrors: string[];
  baselineFieldId: string;
  colorCountErrors: string[];
  isNumericSource: boolean;
  fields?: FieldInput[];
  savedFields?: FieldInput[];
}

export function FieldEditor({
  row,
  index,
  count,
  materialOptions,
  language,
  setField,
  changeFieldKind,
  removeField,
  moveField,
  expanded,
  onExpandedChange,
  revealDetails,
  onDetailsToggle,
  sourceFieldId,
  sourceValueErrors,
  baselineFieldId,
  colorCountErrors,
  isNumericSource,
  fields,
  savedFields,
}: FieldEditorProps): ReactElement {
  const field = row.field;
  const isSource = sourceFieldId !== undefined && sourceFieldId === field.id;

  function updateField(next: FieldInput): void {
    setField(row.key, next);
  }

  const savedField = savedFields?.find((candidate) => candidate.id === baselineFieldId);
  const baselineOptions = savedField?.kind === "choice" ? savedField.options : undefined;
  const name = textValue(field.label, language) || field.id || FIELD_KIND_LABELS[field.kind];

  return (
    <div
      className="flex flex-col gap-3 rounded border p-3"
      data-testid="field-card"
      data-field-id={field.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          aria-expanded={expanded}
          aria-label={expanded ? "Mező összecsukása" : "Mező kibontása"}
          onClick={() => {
            onExpandedChange(row.key, !expanded);
          }}
        >
          {expanded ? "▾" : "▸"}
        </Button>
        <span className="text-sm font-medium">{FIELD_KIND_LABELS[field.kind]}</span>
        <span className="text-sm">{name}</span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {isSource && <Badge variant="warning">méteráras forrás</Badge>}
          {summaryChips(field).map((chip) => (
            <Badge key={chip}>{chip}</Badge>
          ))}
        </div>
        <ReorderButtons
          index={index}
          count={count}
          upLabel="Mező feljebb"
          downLabel="Mező lejjebb"
          onMove={(delta) => {
            moveField(row.key, delta);
          }}
        />
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
      {expanded && (
        <div className="flex flex-col gap-3">
          <FieldSection title="Alapadatok">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>Típus</span>
                <NativeSelect
                  className="w-40"
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
              <LocalizedInput
                label="Név"
                text={field.label}
                language={language}
                width="w-44"
                onBlur={() => {
                  if (field.id !== "" || textValue(field.label, DEFAULT_TEXT_LANGUAGE) === "") {
                    return;
                  }

                  const used = new Set(
                    (fields ?? []).map((entry) => entry.id).filter((id) => id !== "")
                  );

                  updateField({ ...field, id: generateFieldId(field.label, used) });
                }}
                onChange={(next) => {
                  updateField({ ...field, label: next ?? { hu: "" } });
                }}
              />
              {field.kind === "choice" && (
                <label className="flex flex-col gap-1 text-sm">
                  <span>Megjelenés</span>
                  <NativeSelect
                    className="w-40"
                    value={field.presentation}
                    onChange={(e) => {
                      const presentation = PRESENTATIONS.find(
                        (candidate) => candidate === e.target.value
                      );

                      if (presentation !== undefined) {
                        updateField({ ...field, presentation });
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
              {field.kind === "input" && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={field.required}
                    onCheckedChange={(checked) => {
                      updateField({ ...field, required: checked });
                    }}
                  />
                  <span>Kötelező</span>
                </label>
              )}
              <LocalizedInput
                label="Súgó"
                text={field.tooltip}
                language={language}
                width="w-64"
                onChange={(next) => {
                  if (next === undefined) {
                    const { tooltip: _removed, ...rest } = field;

                    updateField(rest);
                    return;
                  }

                  updateField({ ...field, tooltip: next });
                }}
              />
            </div>
          </FieldSection>
          {(field.kind === "choice" || field.kind === "material") && (
            <FieldSection
              title="Beállítások"
              action={
                <DetailsToggle
                  rowKey={row.key}
                  revealDetails={revealDetails}
                  onDetailsToggle={onDetailsToggle}
                />
              }
            >
              {field.kind === "choice" && (
                <ChoiceSettings
                  field={field}
                  language={language}
                  revealDetails={revealDetails}
                  showValues={revealDetails || isSource}
                  isSource={isSource}
                  isNumericSource={isNumericSource}
                  sourceErrors={sourceValueErrors}
                  baselineOptions={baselineOptions}
                  onFieldChange={updateField}
                />
              )}
              {field.kind === "material" && (
                <MaterialSettings
                  field={field}
                  language={language}
                  materialOptions={materialOptions}
                  fields={fields}
                  colorCountErrors={colorCountErrors}
                  revealDetails={revealDetails}
                  onFieldChange={updateField}
                />
              )}
            </FieldSection>
          )}
          {field.kind === "toggle" && (
            <FieldSection title="Beállítások">
              <ToggleSettings field={field} onFieldChange={updateField} />
            </FieldSection>
          )}
          {field.kind === "input" && (
            <FieldSection title="Beállítások">
              <InputSettings
                field={field}
                language={language}
                isSource={isSource}
                isNumericSource={isNumericSource}
                onFieldChange={updateField}
              />
            </FieldSection>
          )}
          {field.kind === "embroidery" && (
            <FieldSection title="Beállítások">
              <EmbroiderySettings field={field} language={language} onFieldChange={updateField} />
            </FieldSection>
          )}
          <FieldSection title="Speciális">
            {field.kind !== "material" && fields !== undefined && !isSource && (
              <VisibilityEditor
                field={field}
                fields={fields}
                language={language}
                onFieldChange={updateField}
              />
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span>Azonosító</span>
              <span className="font-mono text-xs">{field.id === "" ? "—" : field.id}</span>
            </label>
          </FieldSection>
        </div>
      )}
    </div>
  );
}
