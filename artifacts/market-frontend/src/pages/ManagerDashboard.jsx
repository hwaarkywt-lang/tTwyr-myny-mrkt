import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, DollarSign, Users, Truck, Wallet, Package,
  AlertTriangle, RefreshCw, Receipt, ArrowUpRight, ArrowDownRight,
  Calendar, Award, AlertCircle, Briefcase, ShieldAlert, Banknote, Clock,
  TrendingDown, ShoppingCart,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area,
} from 'recharts';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { toast } from '../hooks/use-toast';

const formatNum = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n ?? 0);
const formatMoney = (n) => `${formatNum(n)} ر.ي`;

const PAYMENT_LABELS = {
  cash: 'نقداً', jaib: 'جيب', fluusak: 'فلوسك', hasib: 'حاسب',
  banki: 'بنكي', bank_transfer: 'تحويل', credit: 'آجل',
};
const PIE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444'];

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api.get('/dashboard/manager')
        .then(r => alive && setData(r.data))
        .catch(e => {
          if (e?.response?.status === 403) {
            toast({ title: 'ليس لديك صلاحية', description: 'لوحة المدير متاحة للمدير فقط', variant: 'destructive' });
          }
        })
        .finally(() => alive && setLoading(false));
    };
    load();
    const id = setInterval(load, 60000); // refresh every minute
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500">جاري تحميل لوحة المدير...</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-8 text-center">
        <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-rose-700">لا توجد بيانات</h2>
      </div>
    );
  }

  const hasAlerts = data.alerts.over_credit_limit.length + data.alerts.suppliers_overdue.length +
    data.alerts.low_stock.length + data.alerts.out_of_stock.length + data.alerts.expiring_soon.length > 0;

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl" data-testid="manager-dashboard">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="text-amber-500" /> لوحة المدير المالية
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            مرحباً <span className="font-semibold">{user?.full_name}</span> — آخر تحديث:{' '}
            <span className="font-mono">{new Date(data.as_of).toLocaleString('ar-EG')}</span>
          </p>
        </div>
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 px-4 py-2 text-sm">
          🔐 صلاحيات المدير فقط
        </Badge>
      </div>

      {/* ALERTS BAR */}
      {hasAlerts && (
        <Card className="border-rose-200 bg-gradient-to-l from-rose-50 to-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="font-bold text-rose-800">تنبيهات ذكية</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <AlertChip count={data.alerts.over_credit_limit.length} label="تجاوز حد ائتمان" icon={AlertCircle} color="rose" linkTo="/dashboard/customers" />
              <AlertChip count={data.alerts.suppliers_overdue.length} label="مستحقات تجار" icon={Truck} color="orange" linkTo="/dashboard/purchases" />
              <AlertChip count={data.alerts.low_stock.length} label="مخزون منخفض" icon={Package} color="amber" linkTo="/dashboard/products" />
              <AlertChip count={data.alerts.out_of_stock.length} label="نفد المخزون" icon={Package} color="red" linkTo="/dashboard/products" />
              <AlertChip count={data.alerts.expiring_soon.length} label="قارب انتهاء" icon={Clock} color="purple" linkTo="/dashboard/products" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* SALES KPIs */}
      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-600" /> المبيعات
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="مبيعات اليوم"   value={formatMoney(data.sales.today)} gradient="from-emerald-500 to-teal-600" icon={Receipt} testid="kpi-sales-today" />
          <KpiCard label="مبيعات الأسبوع" value={formatMoney(data.sales.week)}  gradient="from-emerald-600 to-emerald-700" icon={Receipt} testid="kpi-sales-week" />
          <KpiCard label="مبيعات الشهر"  value={formatMoney(data.sales.month)} gradient="from-teal-600 to-teal-700" icon={Receipt} testid="kpi-sales-month" />
          <KpiCard label="مبيعات السنة"  value={formatMoney(data.sales.year)}  gradient="from-cyan-600 to-cyan-700" icon={TrendingUp} testid="kpi-sales-year" />
        </div>
      </section>

      {/* PROFITS KPIs */}
      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-600" /> الأرباح (للمدير فقط)
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="ربح اليوم"   value={formatMoney(data.profits.today)} gradient="from-amber-500 to-orange-600" icon={ArrowUpRight} testid="kpi-profit-today" />
          <KpiCard label="ربح الأسبوع" value={formatMoney(data.profits.week)}  gradient="from-amber-600 to-orange-700" icon={ArrowUpRight} testid="kpi-profit-week" />
          <KpiCard label="ربح الشهر"  value={formatMoney(data.profits.month)} gradient="from-orange-600 to-red-600" icon={ArrowUpRight} testid="kpi-profit-month" />
          <KpiCard label="ربح السنة"  value={formatMoney(data.profits.year)}  gradient="from-orange-700 to-red-700" icon={ArrowUpRight} testid="kpi-profit-year" />
        </div>
      </section>

      {/* SALES BREAKDOWN — cash vs credit */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-600" />
            <span className="text-sm text-slate-700">مبيعات اليوم النقدية</span>
          </div>
          <strong className="text-emerald-700 font-bold" data-testid="kpi-sales-today-cash">
            {formatMoney(data.sales.today_cash ?? 0)}
          </strong>
        </div>
        <div className="flex justify-between items-center p-3 bg-rose-50 rounded-xl border border-rose-200">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-rose-600" />
            <span className="text-sm text-slate-700">مبيعات اليوم الآجلة</span>
          </div>
          <strong className="text-rose-700 font-bold" data-testid="kpi-sales-today-credit">
            {formatMoney(data.sales.today_credit ?? 0)}
          </strong>
        </div>
        <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-slate-700">عدد فواتير اليوم</span>
          </div>
          <strong className="text-blue-700 font-bold" data-testid="kpi-invoices-today">
            {data.sales.invoices_today ?? 0}
          </strong>
        </div>
      </div>

      {/* Cash Box + Returns + Customers + Suppliers Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-2 border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-emerald-900 flex items-center gap-2"><Banknote className="w-5 h-5" /> ملخص الصندوق (اليوم)</h3>
              <Badge className="bg-emerald-100 text-emerald-700">حركة اليوم</Badge>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-emerald-200">
                <span className="text-sm text-slate-600">صافي الصندوق اليوم</span>
                <span className={`text-2xl font-bold ${data.cash_box.current_balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                      data-testid="cash-current">
                  {formatMoney(data.cash_box.current_balance)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white/70 rounded p-2">
                  <p className="text-xs text-slate-500">مقبوضات</p>
                  <p className="font-bold text-emerald-600" data-testid="cash-in">{formatMoney(data.cash_box.total_received_today)}</p>
                  <p className="text-xs text-slate-500 mt-1">منها مبيعات نقدية: {formatMoney(data.cash_box.sales_cash)}</p>
                  <p className="text-xs text-slate-500">سندات قبض: {formatMoney(data.cash_box.customer_receipts)}</p>
                </div>
                <div className="bg-white/70 rounded p-2">
                  <p className="text-xs text-slate-500">مدفوعات</p>
                  <p className="font-bold text-rose-600" data-testid="cash-out">{formatMoney(data.cash_box.total_paid_today)}</p>
                  <p className="text-xs text-slate-500 mt-1">مصروفات: {formatMoney(data.cash_box.expenses_paid)}</p>
                  <p className="text-xs text-slate-500">سداد تجار: {formatMoney(data.cash_box.supplier_paid)}</p>
                  <p className="text-xs text-slate-500">مرتجعات: {formatMoney(data.cash_box.cash_returns)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-rose-600" />
              <h3 className="font-bold text-rose-900">ديون العملاء</h3>
            </div>
            <p className="text-3xl font-bold text-rose-700 mb-1" data-testid="customers-debt">
              {formatMoney(data.customers.total_debt)}
            </p>
            <p className="text-sm text-slate-600">عدد المدينين: <strong>{data.customers.debtors_count}</strong></p>
            <Link to="/dashboard/customers" className="text-xs text-rose-600 underline mt-2 inline-block">عرض الكل ←</Link>
          </CardContent>
        </Card>

        <Card className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-5 h-5 text-orange-600" />
              <h3 className="font-bold text-orange-900">مستحقات التجار</h3>
            </div>
            <p className="text-3xl font-bold text-orange-700 mb-1" data-testid="suppliers-due">
              {formatMoney(data.suppliers.total_due)}
            </p>
            <p className="text-sm text-slate-600">عدد التجار: <strong>{data.suppliers.due_count}</strong></p>
            <Link to="/dashboard/purchases" className="text-xs text-orange-600 underline mt-2 inline-block">عرض الكل ←</Link>
          </CardContent>
        </Card>
      </div>

      {/* RETURNS + EXPENSES summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-orange-500" /> المرتجعات
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                <p className="text-xs text-amber-700">معلقة</p>
                <p className="text-2xl font-bold text-amber-700" data-testid="ret-pending">{data.returns.pending_count}</p>
              </div>
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                <p className="text-xs text-emerald-700">معتمدة</p>
                <p className="text-2xl font-bold text-emerald-700" data-testid="ret-approved">{data.returns.approved_count}</p>
              </div>
              <div className="bg-rose-50 p-3 rounded-lg border border-rose-200">
                <p className="text-xs text-rose-700">مرفوضة</p>
                <p className="text-2xl font-bold text-rose-700" data-testid="ret-rejected">{data.returns.rejected_count}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between p-2 bg-slate-50 rounded">
                <span className="text-slate-600">إجمالي اليوم</span>
                <strong>{formatMoney(data.returns.today_total)}</strong>
              </div>
              <div className="flex justify-between p-2 bg-slate-50 rounded">
                <span className="text-slate-600">إجمالي الشهر</span>
                <strong>{formatMoney(data.returns.month_total)}</strong>
              </div>
            </div>
            <Link to="/dashboard/returns" className="text-xs text-orange-600 underline mt-3 inline-block">إدارة المرتجعات ←</Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-pink-500" /> المصروفات
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div className="bg-pink-50 p-3 rounded-lg">
                <p className="text-xs text-pink-700">اليوم</p>
                <p className="text-xl font-bold text-pink-700" data-testid="exp-today">{formatMoney(data.expenses.today)}</p>
              </div>
              <div className="bg-fuchsia-50 p-3 rounded-lg">
                <p className="text-xs text-fuchsia-700">الشهر</p>
                <p className="text-xl font-bold text-fuchsia-700" data-testid="exp-month">{formatMoney(data.expenses.month)}</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <p className="text-xs text-purple-700">الكلي</p>
                <p className="text-xl font-bold text-purple-700" data-testid="exp-total">{formatMoney(data.expenses.total)}</p>
              </div>
            </div>
            {data.expenses.categories.length > 0 && (
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={data.expenses.categories} dataKey="total" nameKey="category" cx="50%" cy="50%"
                       outerRadius={55} innerRadius={28} paddingAngle={2}>
                    {data.expenses.categories.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CHARTS: Sales/Profit/Expenses 30d */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-600" /> الأداء المالي - آخر 30 يوم
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.chart_30d} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatMoney(v)} labelFormatter={(d) => new Date(d).toLocaleDateString('ar-EG')} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="sales" name="المبيعات" stroke="#10b981" fill="url(#gSales)" />
              <Area type="monotone" dataKey="expenses" name="المصروفات" stroke="#ef4444" fill="url(#gExp)" />
              <Area type="monotone" dataKey="profit" name="الربح" stroke="#f59e0b" fill="url(#gProfit)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── بطاقات طرق الدفع المفصّلة ── */}
      {data.payment_methods?.length > 0 && (() => {
        const PM_META = [
          { key: 'cash',          label: 'نقداً',       color: '#10b981' },
          { key: 'jaib',          label: 'جيب',         color: '#8b5cf6' },
          { key: 'fluusak',       label: 'فلوسك',       color: '#ec4899' },
          { key: 'hasib',         label: 'حاسب',        color: '#3b82f6' },
          { key: 'banki',         label: 'بنكي',        color: '#06b6d4' },
          { key: 'bank_transfer', label: 'تحويل بنكي',  color: '#6366f1' },
          { key: 'credit',        label: 'آجل',         color: '#f43f5e' },
        ];
        const grandTotal = data.payment_methods.reduce((s, p) => s + Number(p.total || 0), 0);
        return (
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-purple-600" /> طرق الدفع تفصيلياً — هذا الشهر
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 mb-2">
              {PM_META.map(({ key, label, color }) => {
                const found = data.payment_methods.find((p) => p.method === key);
                const pct = grandTotal > 0 && found ? Math.round(Number(found.total) / grandTotal * 100) : 0;
                return (
                  <Link key={key} to="/dashboard/wallets"
                    className="bg-white rounded-xl border-2 border-slate-100 hover:border-slate-300 p-4 hover:shadow-md transition-all group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                           style={{ background: color + '20' }}>
                        <Banknote className="w-4 h-4" style={{ color }} />
                      </div>
                      {pct > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: color }}>
                          {pct}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-semibold mb-1">{label}</p>
                    <p className="text-xl font-extrabold text-slate-900">
                      {formatMoney(found?.total || 0)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{found?.count || 0} عملية</p>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Payment Methods Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-blue-600" /> توزيع طرق الدفع (30 يوم)
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.payment_methods.map(p => ({ ...p, label: PAYMENT_LABELS[p.method] || p.method }))}
                        margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatMoney(v)} />
                <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-rose-600" /> أكبر 10 عملاء مدينين
            </h3>
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {data.customers.top_debtors.length === 0 ? (
                <p className="text-slate-400 text-center py-6">لا توجد ديون حالياً ✓</p>
              ) : data.customers.top_debtors.map((c, i) => (
                <Link key={c.id} to={`/dashboard/customers/${c.id}`}
                  className="flex justify-between items-center bg-rose-50 hover:bg-rose-100 rounded-lg p-2 transition-colors">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-rose-200 text-rose-800 w-7 h-7 rounded-full flex items-center justify-center">{i + 1}</Badge>
                    <div>
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.phone || '—'}</p>
                    </div>
                  </div>
                  <span className="font-bold text-rose-700">{formatMoney(c.balance)}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ProductsList title="أكثر مبيعاً" icon={ShoppingCart} color="emerald" items={data.products.top_selling} field="quantity" />
        <ProductsList title="أعلى ربحاً" icon={Award} color="amber" items={data.products.top_profit} field="profit" money />
        <ProductsList title="أقل مبيعاً" icon={TrendingDown} color="slate" items={data.products.least_selling} field="quantity" />
      </div>

      {/* Suppliers */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Truck className="w-5 h-5 text-orange-600" /> أكبر 10 تجار مستحق لهم
          </h3>
          {data.suppliers.top_suppliers.length === 0 ? (
            <p className="text-slate-400 text-center py-4">لا توجد مستحقات حالياً ✓</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.suppliers.top_suppliers.map((s, i) => (
                <Link key={s.id} to={`/dashboard/suppliers/${s.id}`}
                  className="flex justify-between items-center bg-orange-50 hover:bg-orange-100 rounded-lg p-3 transition-colors">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-orange-200 text-orange-800 w-7 h-7 rounded-full flex items-center justify-center">{i + 1}</Badge>
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.phone || '—'}</p>
                    </div>
                  </div>
                  <span className="font-bold text-orange-700">{formatMoney(s.balance)}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== Sub-components ==============
function KpiCard({ label, value, gradient, icon: Icon, testid }) {
  return (
    <Card className="overflow-hidden border-0 shadow-lg hover:shadow-2xl transition-all">
      <CardContent className="p-0">
        <div className={`bg-gradient-to-br ${gradient} p-5 text-white`}>
          <div className="flex items-start justify-between mb-3">
            <Icon className="h-7 w-7 opacity-90" />
          </div>
          <p className="text-white/80 text-sm mb-1">{label}</p>
          <p className="text-2xl font-bold" data-testid={testid}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertChip({ count, label, icon: Icon, color, linkTo }) {
  const colorMap = {
    rose: 'bg-rose-100 text-rose-700 border-rose-300',
    orange: 'bg-orange-100 text-orange-700 border-orange-300',
    amber: 'bg-amber-100 text-amber-700 border-amber-300',
    red: 'bg-red-100 text-red-700 border-red-300',
    purple: 'bg-purple-100 text-purple-700 border-purple-300',
  };
  return (
    <Link to={linkTo || '#'} className={`flex items-center gap-2 ${colorMap[color]} border rounded-lg p-2 hover:scale-105 transition`}>
      <Icon className="w-5 h-5" />
      <div>
        <p className="text-xs">{label}</p>
        <p className="font-bold text-lg">{count}</p>
      </div>
    </Link>
  );
}

function ProductsList({ title, icon: Icon, color, items, field, money }) {
  const colorMap = {
    emerald: 'text-emerald-600 bg-emerald-100',
    amber: 'text-amber-600 bg-amber-100',
    slate: 'text-slate-600 bg-slate-100',
  };
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className={`font-bold mb-3 flex items-center gap-2 ${colorMap[color]?.split(' ')[0]}`}>
          <Icon className="w-5 h-5" /> {title}
        </h3>
        {items.length === 0 ? (
          <p className="text-slate-400 text-center py-4">لا توجد بيانات</p>
        ) : (
          <div className="space-y-2">
            {items.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                <Badge className={`${colorMap[color]} w-7 h-7 rounded-full flex items-center justify-center`}>{i + 1}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" title={p.name}>{p.name}</p>
                  <p className="text-xs text-slate-400 truncate">{p.sku}</p>
                </div>
                <span className="font-bold text-sm">
                  {money ? formatMoney(p[field]) : formatNum(p[field])}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
