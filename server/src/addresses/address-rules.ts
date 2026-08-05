/**
 * Vietnamese mobile/landline shape, shared by the address book and checkout so
 * a number accepted into the book cannot be rejected at the till.
 */
export const VN_PHONE_PATTERN = /^(0\d{9,10}|\+84\d{9,10})$/;

export const VN_PHONE_MESSAGE = 'phone must be a valid Vietnamese phone number';

/** The delivery fields an order copies at checkout. */
export type ShippingSnapshot = {
  recipientName: string;
  phone: string;
  addressLine: string;
  ward: string | null;
  district: string | null;
  city: string;
};

type ShippingSource = {
  recipientName: string;
  phone: string;
  addressLine: string;
  ward?: string | null;
  district?: string | null;
  city: string;
};

/**
 * Normalizes either a saved address or inline checkout fields into the exact
 * shape `orders` stores. One function on purpose: two trim/blank policies would
 * drift, and the difference only surfaces on a delivery label.
 */
export function shippingSnapshot(source: ShippingSource): ShippingSnapshot {
  return {
    recipientName: source.recipientName.trim(),
    phone: source.phone.trim(),
    addressLine: source.addressLine.trim(),
    ward: source.ward?.trim() || null,
    district: source.district?.trim() || null,
    city: source.city.trim(),
  };
}

/**
 * The first address a user saves becomes the default whether or not they asked
 * — an address book with no default makes checkout pick arbitrarily.
 */
export function shouldBecomeDefault(
  requested: boolean | undefined,
  existingCount: number,
): boolean {
  return requested === true || existingCount === 0;
}
