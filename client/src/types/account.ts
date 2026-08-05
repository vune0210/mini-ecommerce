/**
 * Mirrors the server `addresses` entity. Dates arrive as ISO strings, and the
 * book is returned default-first, newest-after.
 */
export type Address = {
  id: string;
  userId: string;
  /** Free-text nickname such as "Nhà riêng" or "Công ty". */
  label: string | null;
  recipientName: string;
  phone: string;
  addressLine: string;
  ward: string | null;
  district: string | null;
  city: string;
  /** At most one per user; the API enforces it inside a transaction. */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Body of `POST /api/addresses`. The optional strings are sent even when blank
 * so an edit can clear a ward or a label — the API turns '' into null.
 * `isDefault: false` is meaningless: the API only ever promotes, never demotes.
 */
export type AddressInput = {
  label?: string;
  recipientName: string;
  phone: string;
  addressLine: string;
  ward?: string;
  district?: string;
  city: string;
  isDefault?: boolean;
};

/** `id` travels in the path; the API runs forbidNonWhitelisted on the body. */
export type UpdateAddressInput = Partial<AddressInput> & { id: string };

export type ProfileInput = { name: string };

export type ChangePasswordInput = { currentPassword: string; newPassword: string };
