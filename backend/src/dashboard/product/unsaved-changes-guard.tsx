import type { ReactElement } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vendure/dashboard";

/** Asks before leaving the page (in-app navigation or reload) while
 * `blocks` returns true; the in-app dialog mirrors the stock
 * NavigationConfirmation. */
export function UnsavedChangesGuard({ blocks }: { blocks: () => boolean }): ReactElement {
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: blocks,
    withResolver: true,
    enableBeforeUnload: blocks,
  });

  return (
    <Dialog open={status === "blocked"} onOpenChange={reset}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Elhagyod az oldalt?</DialogTitle>
          <DialogDescription>A konfigurátor nem mentett módosításai elvesznek.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={reset}>
            Mégse
          </Button>
          <Button type="button" onClick={proceed}>
            Elhagyás
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
