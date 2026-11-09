import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AuditLogEntry } from "./audit.entity";
import { auditSchema, AuditLogResolver } from "./audit.resolver";
import { AuditService } from "./audit.service";

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [AuditLogEntry],
  adminApiExtensions: { schema: auditSchema, resolvers: [AuditLogResolver] },
  providers: [AuditService],
  dashboard: "../../dashboard/audit/audit.tsx",
})
export class AuditPlugin {}
