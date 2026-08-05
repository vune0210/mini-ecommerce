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
  'review_votes',
  'reviews',
  'answer_votes',
  'product_answers',
  'product_questions',
  'coupon_redemptions',
  'stock_alerts',
  'stock_movements',
  'wishlist_items',
  'return_status_history',
  'return_request_items',
  'return_requests',
  'notifications',
  'notification_preferences',
  'audit_log',
  'idempotency_keys',
  'orders',
  'coupons',
  'carts',
  'addresses',
  'refresh_sessions',
  'auth_tokens',
  'product_tag_links',
  'product_tags',
  'product_images',
  'products',
  'categories',
  'users',
];

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  // categories.parent_id references categories with ON DELETE RESTRICT, and a
  // single DELETE gives no guarantee that children are removed before their
  // parents. Detaching the tree first makes the wipe order-independent.
  await dataSource.query('UPDATE `categories` SET `parent_id` = NULL');
  for (const table of TABLES_IN_DELETE_ORDER)
    await dataSource.query(`DELETE FROM \`${table}\``);
}
