import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `RETURN` to the stock ledger's reason enum.
 *
 * Received customer returns were the one stock movement the enum could not
 * name. Filing them under CANCELLATION would assert in the audit trail that
 * delivered, completed orders had been cancelled, and under ADJUSTMENT that a
 * human had merely corrected a count — the ledger exists precisely so neither
 * of those becomes the record.
 *
 * Enum members are appended, never reordered: MySQL stores the ordinal, so
 * inserting a value in the middle silently relabels every existing row.
 */
export class AddReturnStockMovementReason1784630000000 implements MigrationInterface {
  name = 'AddReturnStockMovementReason1784630000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`stock_movements\` MODIFY \`reason\` enum ('SALE', 'CANCELLATION', 'ADJUSTMENT', 'RESTOCK', 'RETURN') NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Rows that used the value being removed would become '' under a plain
    // MODIFY, so they are relabelled first. ADJUSTMENT is where returns lived
    // before this member existed, and the note on each row still names the RMA.
    await queryRunner.query(
      `UPDATE \`stock_movements\` SET \`reason\` = 'ADJUSTMENT' WHERE \`reason\` = 'RETURN'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock_movements\` MODIFY \`reason\` enum ('SALE', 'CANCELLATION', 'ADJUSTMENT', 'RESTOCK') NOT NULL`,
    );
  }
}
