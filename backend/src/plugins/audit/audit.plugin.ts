import { APP_INTERCEPTOR } from "@nestjs/core";
import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AuditLogEntry } from "./audit.entity";
import { auditSchema, AuditLogResolver } from "./audit.resolver";
import { AuditService } from "./audit.service";
import { ProductAuditInterceptor } from "./product-audit.interceptor";

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [AuditLogEntry],
  adminApiExtensions: { schema: auditSchema, resolvers: [AuditLogResolver] },
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: ProductAuditInterceptor }],
  dashboard: "../../dashboard/audit/audit.tsx",
})
export class AuditPlugin {}
