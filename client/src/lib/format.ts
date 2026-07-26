import type { OrderStatus } from '../types/order';

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });

/** Prices arrive as decimal strings from the API, never as numbers. */
export const formatPrice = (value: string | number): string => currency.format(Number(value));
export const formatDateTime = (value: string): string => dateTime.format(new Date(value));
export const formatDate = (value: string): string => dateOnly.format(new Date(value));

export type StatusTone = 'amber' | 'sky' | 'violet' | 'emerald' | 'rose';

export const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'PAID',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Chờ xử lý',
  PAID: 'Đã thanh toán',
  SHIPPED: 'Đang giao',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã huỷ',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  PENDING: 'amber',
  PAID: 'sky',
  SHIPPED: 'violet',
  COMPLETED: 'emerald',
  CANCELLED: 'rose',
};

/** Vietnamese names carry diacritics; the API only accepts a-z0-9 slugs. */
export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const shippingAddress = (order: {
  addressLine: string;
  ward: string | null;
  district: string | null;
  city: string;
}): string => [order.addressLine, order.ward, order.district, order.city].filter(Boolean).join(', ');
