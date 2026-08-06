import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminCategoriesPage } from './pages/AdminCategoriesPage';
import { AdminAuditLogPage } from './pages/AdminAuditLogPage';
import { AdminCouponsPage } from './pages/AdminCouponsPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminInventoryPage } from './pages/AdminInventoryPage';
import { AdminOrderDetailPage } from './pages/AdminOrderDetailPage';
import { AdminOrdersPage } from './pages/AdminOrdersPage';
import { AdminProductsPage } from './pages/AdminProductsPage';
import { AdminQuestionsPage } from './pages/AdminQuestionsPage';
import { AdminReviewsPage } from './pages/AdminReviewsPage';
import { AdminReturnsPage } from './pages/AdminReturnsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AddressesPage } from './pages/account/AddressesPage';
import { PasswordPage } from './pages/account/PasswordPage';
import { ProfilePage } from './pages/account/ProfilePage';
import { SessionsPage } from './pages/account/SessionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrderHistoryPage } from './pages/OrderHistoryPage';
import { HealthPage } from './pages/HealthPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductListPage } from './pages/ProductListPage';
import { RegisterPage } from './pages/RegisterPage';
import { ReturnDetailPage } from './pages/ReturnDetailPage';
import { ReturnRequestPage } from './pages/ReturnRequestPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { WishlistPage } from './pages/WishlistPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/products" replace />} />
      <Route path="/health" element={<HealthPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Public by necessity: these are opened from a mail client, which
          carries no bearer token — the token in the URL is the credential. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/products" element={<ProductListPage />} />
      <Route path="/products/:id" element={<ProductDetailPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/orders" element={<OrderHistoryPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/returns/new" element={<ReturnRequestPage />} />
        <Route path="/returns/:id" element={<ReturnDetailPage />} />
        {/* The account shell has no index page of its own; profile is the
            landing tab, so /account redirects rather than rendering blank. */}
        <Route
          path="/account"
          element={<Navigate to="/account/profile" replace />}
        />
        <Route path="/account/profile" element={<ProfilePage />} />
        <Route path="/account/password" element={<PasswordPage />} />
        <Route path="/account/sessions" element={<SessionsPage />} />
        <Route path="/account/addresses" element={<AddressesPage />} />
      </Route>
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/products" element={<AdminProductsPage />} />
        <Route path="/admin/inventory" element={<AdminInventoryPage />} />
        <Route path="/admin/categories" element={<AdminCategoriesPage />} />
        <Route path="/admin/orders" element={<AdminOrdersPage />} />
        <Route path="/admin/orders/:id" element={<AdminOrderDetailPage />} />
        <Route path="/admin/coupons" element={<AdminCouponsPage />} />
        <Route path="/admin/reviews" element={<AdminReviewsPage />} />
        <Route path="/admin/questions" element={<AdminQuestionsPage />} />
        <Route path="/admin/returns" element={<AdminReturnsPage />} />
        <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  );
}
