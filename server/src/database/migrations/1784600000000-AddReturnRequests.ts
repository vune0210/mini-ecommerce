import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Return requests (RMA) and their audit trail.
 *
 * Both `order_id` and `user_id` are ON DELETE RESTRICT: a return is the record
 * of money owed and stock expected back, so it must pin the order it disputes
 * and the customer who filed it rather than outlive them as an orphan.
 * `order_item_id` is RESTRICT for the same reason — it is the proof the unit
 * was bought, and the only route to the product that gets restocked.
 *
 * Nothing is backfilled: there is no honest way to invent past returns.
 */
export class AddReturnRequests1784600000000 implements MigrationInterface {
  name = 'AddReturnRequests1784600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`return_requests\` (\`id\` varchar(36) NOT NULL, \`order_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`request_number\` varchar(24) NOT NULL, \`status\` enum ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED', \`reason\` enum ('DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'CHANGED_MIND', 'OTHER') NOT NULL, \`note\` varchar(500) NULL, \`refund_amount\` decimal(10,2) NOT NULL, \`resolved_at\` datetime(6) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_return_requests_request_number\` (\`request_number\`), INDEX \`IDX_return_requests_user_created_at\` (\`user_id\`, \`created_at\`), INDEX \`IDX_return_requests_order_status\` (\`order_id\`, \`status\`), INDEX \`IDX_return_requests_status_created_at\` (\`status\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`return_request_items\` (\`id\` varchar(36) NOT NULL, \`return_request_id\` varchar(36) NOT NULL, \`order_item_id\` varchar(36) NOT NULL, \`product_name\` varchar(255) NOT NULL, \`quantity\` int UNSIGNED NOT NULL, \`unit_price\` decimal(10,2) NOT NULL, \`subtotal\` decimal(10,2) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_return_request_items_request\` (\`return_request_id\`), INDEX \`IDX_return_request_items_order_item\` (\`order_item_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`return_status_history\` (\`id\` varchar(36) NOT NULL, \`return_request_id\` varchar(36) NOT NULL, \`from_status\` enum ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CANCELLED') NULL, \`to_status\` enum ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CANCELLED') NOT NULL, \`actor_user_id\` varchar(36) NULL, \`actor_role\` varchar(20) NULL, \`note\` varchar(500) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_return_status_history_request_created_at\` (\`return_request_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_requests\` ADD CONSTRAINT \`FK_return_requests_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_requests\` ADD CONSTRAINT \`FK_return_requests_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    // The lines belong to the request and mean nothing without it, so they
    // cascade — unlike the audit trail's references, which must survive.
    await queryRunner.query(
      `ALTER TABLE \`return_request_items\` ADD CONSTRAINT \`FK_return_request_items_request\` FOREIGN KEY (\`return_request_id\`) REFERENCES \`return_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_request_items\` ADD CONSTRAINT \`FK_return_request_items_order_item\` FOREIGN KEY (\`order_item_id\`) REFERENCES \`order_items\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_status_history\` ADD CONSTRAINT \`FK_return_status_history_request\` FOREIGN KEY (\`return_request_id\`) REFERENCES \`return_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // SET NULL, matching order_status_history: deleting a staff account must
    // never erase the record that someone approved a refund. The actor_role
    // snapshot is what keeps the row readable afterwards.
    await queryRunner.query(
      `ALTER TABLE \`return_status_history\` ADD CONSTRAINT \`FK_return_status_history_actor_user\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`return_status_history\` DROP FOREIGN KEY \`FK_return_status_history_actor_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_status_history\` DROP FOREIGN KEY \`FK_return_status_history_request\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_request_items\` DROP FOREIGN KEY \`FK_return_request_items_order_item\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_request_items\` DROP FOREIGN KEY \`FK_return_request_items_request\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_requests\` DROP FOREIGN KEY \`FK_return_requests_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_requests\` DROP FOREIGN KEY \`FK_return_requests_order\``,
    );
    await queryRunner.query(`DROP TABLE \`return_status_history\``);
    await queryRunner.query(`DROP TABLE \`return_request_items\``);
    await queryRunner.query(`DROP TABLE \`return_requests\``);
  }
}
