-- Local Docker bootstrap only. Managed production databases should create the
-- equivalent runtime and migration identities in their control plane.
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'mini_ecommerce'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `mini_ecommerce`.* TO 'mini_ecommerce'@'%';
FLUSH PRIVILEGES;
