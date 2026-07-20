import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Users, TrendingUp,
  Wallet, FileText, Settings, UserCircle, LogOut, Store,
  ShieldCheck, Bell, RefreshCw, ScrollText, Lock, Database, AlertTriangle, PieChart,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { STORE } from '../../config/store';
import ConnectivityBadge from '../ConnectivityBadge';

// Updated RBAC per user spec (نظام 3 أدوار فقط - لا يوجد موظف مخزون):
// CASHIER (الكاشير): POS + Customers + own Sales + own Expenses + Logout
// MANAGER (المشرف): Purchases + Products (إضافة فقط) + Customers + Suppliers + Sales (NO profit)
//                   لا يرى: الموظفين، الأرباح، التكاليف، التقارير المالية
// ADMIN (المدير): everything + cost/profit + approvals + employees + reports + settings
const menuItems = [
  { path: '/dashboard',              label: 'لوحة التحكم',   icon: LayoutDashboard, roles: ['admin', 'manager'] },
  { path: '/dashboard/pos',          label: 'نقطة البيع',     icon: ShoppingCart,    roles: ['admin', 'manager', 'cashier'] },
  { path: '/dashboard/sales',        label: 'المبيعات',       icon: TrendingUp,      roles: ['admin', 'manager', 'cashier'] },
  { path: '/dashboard/customers',    label: 'العملاء',        icon: Users,           roles: ['admin', 'manager', 'cashier'] },
  { path: '/dashboard/products',      label: 'المنتجات',         icon: Package,         roles: ['admin'] },
  { path: '/dashboard/stock-alerts', label: 'تنبيهات المخزون', icon: AlertTriangle,   roles: ['manager', 'cashier'] },
  { path: '/dashboard/purchases',    label: 'حسابات التجار',   icon: Store,           roles: ['admin', 'manager'] },
  { path: '/dashboard/expenses',     label: 'المصروفات',     icon: Wallet,          roles: ['admin', 'manager', 'cashier'] },
  { path: '/dashboard/returns',      label: 'المرتجعات',      icon: RefreshCw,       roles: ['admin', 'manager', 'cashier'] },
  { path: '/dashboard/approvals',    label: 'طلبات التعديل',  icon: ShieldCheck,     roles: ['admin'] },
  { path: '/dashboard/wallets',       label: 'المحافظ والدفع', icon: PieChart,        roles: ['admin', 'manager'] },
  { path: '/dashboard/reports',      label: 'التقارير',       icon: FileText,        roles: ['admin'] },
  { path: '/dashboard/day-close',    label: 'إقفال اليوم',     icon: Lock,            roles: ['admin'] },
  { path: '/dashboard/audit-logs',   label: 'سجل العمليات',   icon: ScrollText,      roles: ['admin'] },
  { path: '/dashboard/backups',      label: 'النسخ الاحتياطية', icon: Database,      roles: ['admin'] },
  { path: '/dashboard/employees',    label: 'الموظفون',       icon: UserCircle,      roles: ['admin'] },
  { path: '/dashboard/settings',     label: 'الإعدادات',      icon: Settings,        roles: ['admin'] },
];

const roleLabels = {
  admin: 'مدير',
  manager: 'مشرف',
  cashier: 'كاشير',
};

const Sidebar = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const userRole = user?.role || 'cashier';
  const visibleItems = menuItems.filter((m) => m.roles.includes(userRole));

  useEffect(() => {
    let alive = true;
    const tick = () => api.get('/notifications/unread-count')
      .then((r) => alive && setUnread(r.data.count)).catch(() => {});
    tick();
    const id = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="h-screen w-64 bg-slate-900 text-slate-200 flex flex-col shadow-2xl" dir="rtl">
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
               style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            <Store className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-white text-base leading-tight">{STORE.name}</p>
            <p className="text-xs text-amber-400" dir="ltr">📞 {STORE.phone}</p>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <ConnectivityBadge />
        </div>
      </div>

      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white shadow-md"
               style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
            {(user?.full_name || 'U').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm truncate" data-testid="sidebar-user-name">
              {user?.full_name || 'مستخدم'}
            </p>
            <p className="text-xs text-amber-400">{roleLabels[userRole] || userRole}</p>
          </div>
          {unread > 0 && (
            <div className="relative" data-testid="notif-badge">
              <Bell className="w-5 h-5 text-amber-400" />
              <span className="absolute -top-1 -left-1 bg-rose-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
                           (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.path.split('/').pop() || 'home'}`}
              className={`flex items-center gap-3 px-5 py-3 transition-all border-r-2 ${
                isActive
                  ? 'bg-slate-800/70 text-amber-400 border-amber-500 shadow-inner'
                  : 'border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={logout}
          data-testid="logout-btn"
          className="flex items-center gap-3 w-full px-4 py-3 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium text-sm">تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
