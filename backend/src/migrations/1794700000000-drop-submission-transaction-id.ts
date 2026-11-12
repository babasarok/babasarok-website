import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Drops the order's `submissionTransactionId` custom field: it stored the
 * per-attempt UUID shown as the failure reference on a failed submission,
 * and the buyer-facing reference is the order's native code now. Nothing
 * reads the stored values — the order code identifies orders natively — so
 * the column drops without an archive.
 */
export const DROP_SUBMISSION_TRANSACTION_ID_STATEMENTS: readonly string[] = [
  `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsSubmissiontransactionid"`,
];

export class DropSubmissionTransactionId1794700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    for (const statement of DROP_SUBMISSION_TRANSACTION_ID_STATEMENTS) {
      await queryRunner.query(statement);
    }
  }

  // Best effort: the dropped values were random per-attempt UUIDs and are
  // not recoverable; the re-added column starts empty.
  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customFieldsSubmissiontransactionid" character varying(255)`,
      undefined
    );
  }
}
