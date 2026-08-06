import { Bell, Heart, LayoutDashboard, LogOut, Menu, Package, Receipt, RotateCcw, ShieldCheck, ShoppingBag, ShoppingCart, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { apiVoid } from '../lib/api-client';
import { useCart } from '../lib/cart-api';
import { useWishlist } from '../lib/wishlist-api';
import { useAuthStore } from '../stores/auth-store';

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function AppNav() {
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const navigate = useNavigate();
  const location = useLocation();
  const cartQuery = useCart();
  const wishlistQuery = useWishlist();
  const [menuOpen, setMenuOpen] = useState(false);
  const cartCount = cartQuery.data?.totalItems ?? 0;
  const wishlistCount = wishlistQuery.data?.length ?? 0;

  // Navigating away must close the drawer, or it covers the new page.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function logOut(): Promise<void> {
    const refreshToken = useAuthStore.getState().tokens?.refreshToken;
    // Tell the server first so the refresh session is actually revoked;
    // clearing only local storage would leave a live seven-day token behind.
    // A failure here must still log the user out locally, so it is swallowed.
    if (refreshToken)
      await apiVoid('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    clearAuth();
    navigate('/login');
  }

  const links = user
    ? [
        { to: '/products', label: 'Sản phẩm', icon: Package },
        { to: '/orders', label: 'Đơn hàng', icon: Receipt },
        { to: '/returns', label: 'Trả hàng', icon: RotateCcw },
        { to: '/wishlist', label: 'Yêu thích', icon: Heart },
        { to: '/notifications', label: 'Thông báo', icon: Bell },
        { to: '/account', label: 'Tài khoản', icon: User },
        { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
        ...(user.role === 'ADMIN'
          ? [{ to: '/admin', label: 'Quản trị', icon: ShieldCheck }]
          : []),
      ]
    : [{ to: '/products', label: 'Sản phẩm', icon: Package }];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link className="flex items-center gap-2.5 text-slate-900" to="/products">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
            <ShoppingBag className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight">MiniShop</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <NavLink className={linkClass} to={link.to} key={link.to}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                className="relative hidden rounded-lg p-2.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:block"
                to="/wishlist"
                aria-label={`Yêu thích, ${wishlistCount} sản phẩm`}
              >
                <Heart className="h-5 w-5" aria-hidden />
                {wishlistCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                    {wishlistCount > 99 ? '99+' : wishlistCount}
                  </span>
                )}
              </Link>
              <Link
                className="relative rounded-lg p-2.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                to="/cart"
                aria-label={`Giỏ hàng, ${cartCount} sản phẩm`}
              >
                <ShoppingCart className="h-5 w-5" aria-hidden />
                {cartCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>
              <NotificationBell />
              <span className="hidden max-w-36 truncate text-sm font-medium text-slate-700 lg:inline">
                {user.name}
              </span>
              <button
                className="hidden rounded-lg p-2.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:block"
                onClick={logOut}
                aria-label="Đăng xuất"
                title="Đăng xuất"
              >
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link className="btn-ghost" to="/login">
                Đăng nhập
              </Link>
              <Link className="btn-primary" to="/register">
                Đăng ký
              </Link>
            </div>
          )}

          <button
            className="rounded-lg p-2.5 text-slate-600 transition-colors hover:bg-slate-100 md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Mở menu"
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="animate-fade-in border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          {links.map((link) => (
            <NavLink className={`${linkClass} flex items-center gap-3`} to={link.to} key={link.to}>
              <link.icon className="h-4 w-4" aria-hidden />
              {link.label}
            </NavLink>
          ))}
          <div className="mt-3 border-t border-slate-100 pt-3">
            {user ? (
              <button className="btn-secondary w-full" onClick={logOut}>
                <LogOut className="h-4 w-4" aria-hidden />
                Đăng xuất
              </button>
            ) : (
              <div className="grid gap-2">
                <Link className="btn-secondary" to="/login">
                  Đăng nhập
                </Link>
                <Link className="btn-primary" to="/register">
                  Đăng ký
                </Link>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
