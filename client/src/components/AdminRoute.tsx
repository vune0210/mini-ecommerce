import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
export function AdminRoute() { const location = useLocation(); const user = useAuthStore((state) => state.user); const tokens = useAuthStore((state) => state.tokens); if (!user || !tokens) return <Navigate to="/login" replace state={{ from: location.pathname }} />; if (user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />; return <Outlet />; }
