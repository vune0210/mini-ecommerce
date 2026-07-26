import { DataSource } from 'typeorm';

/**
 * FK-ordered wipe shared by every e2e spec. Children precede parents so plain
 * DELETEs work without disabling FOREIGN_KEY_CHECKS. New tables MUST be added
 * here in child-before-parent position — a missing entry leaks rows across
 * tests, a misplaced one fails with ER_ROW_IS_REFERENCED.
 */
const TABLES_IN_DELETE_ORDER = [
  'cart_items',
  'order_items',
  'order_status_history',
  'reviews',
  'orders',
  'carts',
  'products',
  'categories',
  'users',
];

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  for (const table of TABLES_IN_DELETE_ORDER)
    await dataSource.query(`DELETE FROM \`${table}\``);
}
