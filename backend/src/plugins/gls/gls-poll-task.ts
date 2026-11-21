import { ScheduledTask } from "@vendure/core";
import { GlsService } from "./gls.service";

/** Runs in the worker process (DefaultSchedulerStrategy); the server ignores it. */
export const glsStatusPollTask = new ScheduledTask({
  id: "gls-status-poll",
  description: "GLS-csomagok állapotának lekérdezése 30 percenként (shipped/delivered/probléma)",
  schedule: "*/30 * * * *",
  execute: async ({ injector, scheduledContext }) => {
    await injector.get(GlsService).pollStatuses(scheduledContext);
  },
});
