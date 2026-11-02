import { useEffect, useState, type ReactElement } from "react";
import { Button } from "@vendure/dashboard";
import type { PageContextValue } from "@vendure/dashboard";
import { Switch } from "@/vdb/components/ui/switch.js";
import { canUnifiedSave, planUnifiedSave } from "./product-definition-editor";
import { getConfiguratorSave, useConfiguratorDirty } from "./product-definition-save-store";

/** Replaces the stock product page's save button: the stock Enabled switch
 * and one Update button that saves the page form and, on generated products,
 * the configurator block together. Behaves like the stock button elsewhere. */
export function ProductSaveActionBarItem({ context }: { context: PageContextValue }): ReactElement {
  const { form } = context;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- PageContextValue.entity is typed `any` by the dashboard's own contract (page-provider.tsx)
  const entityId: unknown = context.entity?.id;
  const creating = typeof entityId !== "string";
  const configuratorDirty = useConfiguratorDirty(creating ? "" : entityId);
  const [pageState, setPageState] = useState({ dirty: false, valid: false });
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (form === undefined) {
      return;
    }

    const stop = form.subscribe({
      formState: { isDirty: true, isValid: true },
      callback: (state) => {
        setPageState({
          dirty: state.isDirty ?? false,
          valid: state.isValid ?? false,
        });
      },
    });
    const watch = form.subscribe({
      formState: { values: true },
      callback: () => {
        const value: unknown = form.getValues("enabled");

        setEnabled(value === true);
      },
    });

    const initial: unknown = form.getValues("enabled");

    setEnabled(initial === true);
    setPageState({
      dirty: form.formState.isDirty,
      valid: form.formState.isValid,
    });

    return () => {
      stop();
      watch();
    };
  }, [form]);

  const state = {
    pageDirty: pageState.dirty,
    pageValid: pageState.valid,
    configuratorDirty,
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex items-center gap-2"
        title="Bekapcsolva a termék elérhető a boltban"
        data-testid="product-enabled-switch"
      >
        <label htmlFor="product-enabled-switch-input" className="text-sm font-medium">
          Engedélyezve
        </label>
        <Switch
          id="product-enabled-switch-input"
          checked={enabled}
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

          if (plan.saveConfigurator && !creating) {
            void getConfiguratorSave(entityId)?.save();
          }
        }}
      >
        {creating ? "Létrehozás" : "Frissítés"}
      </Button>
    </div>
  );
}
