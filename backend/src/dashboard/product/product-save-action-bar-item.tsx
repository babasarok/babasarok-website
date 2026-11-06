import { useEffect, useReducer, type ReactElement } from "react";
import { Button } from "@vendure/dashboard";
import type { PageContextValue } from "@vendure/dashboard";
import { Switch } from "@/vdb/components/ui/switch.js";
import { canUnifiedSave, planUnifiedSave } from "./product-definition-editor";
import { getConfiguratorSave, useConfiguratorDirty } from "./product-definition-save-store";

/** Replaces the stock product page's save button: the stock Enabled switch
 * and one Update button that saves the page form and, on generated products,
 * the configurator block together. Behaves like the stock button elsewhere. */
export function ProductSaveActionBarItem({
  context,
  definitionId,
}: {
  context: PageContextValue;
  definitionId: string | null;
}): ReactElement {
  const { form } = context;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- PageContextValue.entity is typed `any` by the dashboard's own contract (page-provider.tsx)
  const entityId: unknown = context.entity?.id;
  const creating = typeof entityId !== "string";
  const configuratorDirty = useConfiguratorDirty(definitionId ?? "");
  const [, rerender] = useReducer((tick: number) => tick + 1, 0);

  // Partial notifications omit unchanged keys, so they only trigger a re-read
  // of the full form state below.
  useEffect(() => {
    if (form === undefined) {
      return;
    }

    return form.subscribe({
      formState: { isDirty: true, isValid: true, values: true },
      callback: rerender,
    });
  }, [form]);

  const enabled: unknown = form?.getValues("enabled");
  const state = {
    pageDirty: form?.formState.isDirty ?? false,
    pageValid: form?.formState.isValid ?? false,
    configuratorDirty,
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className="flex items-center gap-2"
        title="Bekapcsolt állapotban a termék elérhető a boltban"
        data-testid="product-enabled-switch"
      >
        <label htmlFor="product-enabled-switch-input" className="text-sm font-medium">
          Engedélyezve
        </label>
        <Switch
          id="product-enabled-switch-input"
          checked={enabled === true}
          onCheckedChange={(checked) => {
            form?.setValue("enabled", checked, { shouldDirty: true, shouldValidate: true });
          }}
        />
      </div>
      <Button
        type="button"
        disabled={!canUnifiedSave(state)}
        onClick={(event) => {
          const plan = planUnifiedSave(state);

          if (plan.savePage) {
            event.currentTarget.form?.requestSubmit();
          }

          if (plan.saveConfigurator && definitionId !== null) {
            void getConfiguratorSave(definitionId)?.save();
          }
        }}
      >
        {creating ? "Létrehozás" : "Frissítés"}
      </Button>
    </div>
  );
}
