import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The admin action trail. Starts empty, and deliberately so: the actions taken
 * before this table existed left no trustworthy trace to reconstruct from —
 * `updated_at` says something changed, not who changed it or from where.
 * Back-filling rows from it would produce entries with invented actors, and a
 * fabricated audit trail is worse than one that honestly begins today. (Same
 * argument as AddStockMovements.)
 */
export class AddAuditLog1784610000000 implements MigrationInterface {
  name = 'AddAuditLog1784610000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`audit_log\` (\`id\` varchar(36) NOT NULL, \`actor_user_id\` varchar(36) NULL, \`actor_email\` varchar(255) NOT NULL, \`actor_role\` varchar(20) NOT NULL, \`action\` varchar(100) NOT NULL, \`method\` varchar(10) NOT NULL, \`path\` varchar(512) NOT NULL, \`resource_type\` varchar(60) NULL, \`resource_id\` varchar(36) NULL, \`status_code\` int UNSIGNED NOT NULL, \`request_id\` varchar(64) NULL, \`metadata\` json NULL, \`ip_address\` varchar(45) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_audit_log_actor_created_at\` (\`actor_user_id\`, \`created_at\`), INDEX \`IDX_audit_log_resource\` (\`resource_type\`, \`resource_id\`), INDEX \`IDX_audit_log_created_at\` (\`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // ON DELETE SET NULL: deleting a staff account must never erase the record
    // that they acted. The actor_email and actor_role snapshots are what keep
    // the row readable once the FK has been nulled.
    await queryRunner.query(
      `ALTER TABLE \`audit_log\` ADD CONSTRAINT \`FK_audit_log_actor_user\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`audit_log\` DROP FOREIGN KEY \`FK_audit_log_actor_user\``,
    );
    await queryRunner.query(`DROP TABLE \`audit_log\``);
  }
}
