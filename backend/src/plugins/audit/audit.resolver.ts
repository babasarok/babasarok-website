import gql from "graphql-tag";
import { Allow, Permission } from "@vendure/core";
import { Args, Query, Resolver } from "@nestjs/graphql";
import { AuditLogEntry } from "./audit.entity";
import { AuditLogList, AuditLogListOptions, AuditService } from "./audit.service";

@Resolver(() => AuditLogEntry)
export class AuditLogResolver {
  constructor(private auditService: AuditService) {}

  @Query()
  @Allow(Permission.ReadCatalog)
  auditLogEntries(
    @Args("options", { nullable: true }) options: AuditLogListOptions | null
  ): Promise<AuditLogList> {
    return this.auditService.entries(options);
  }
}

export const auditSchema = gql`
  type AuditLogEntry {
    id: ID!
    createdAt: DateTime!
    actorIdentifier: String
    entityType: String!
    entityKey: String!
    action: String!
    summary: String
    details: [AuditLogDetail!]
    source: String!
  }

  type AuditLogDetail {
    field: String!
    from: String
    to: String
  }

  type AuditLogEntryList {
    items: [AuditLogEntry!]!
    totalItems: Int!
  }

  input AuditLogListOptions {
    skip: Int
    take: Int
    entityType: String
    source: String
    from: DateTime
    to: DateTime
  }

  extend type Query {
    auditLogEntries(options: AuditLogListOptions): AuditLogEntryList!
  }
`;
