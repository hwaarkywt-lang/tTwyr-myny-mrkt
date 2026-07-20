import React, { useEffect, useState, useCallback } from 'react';
import {
  Banknote, Smartphone, Wallet, CreditCard, Building2, ArrowLeftRight,
  Clock, PieChart as PieIcon, TrendingUp, RefreshCw, Calendar, Filter,
  ChevronDown, Receipt, X,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import api from '../lib/api';

const fmt = (n) =>
  new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n) || 0);
const fmtDate = (s) =>
  s ? new Date(s).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const METHODS = [
  { key: 'cash',          label: 'نقداً',          icon: Banknote,       color: '#10b981', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  { key: 'jaib',          label: 'جيب',            icon: Smartphone,     color: '#8b5cf6', bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-700' },
  { key: 'fluusak',       label: 'فلوسك',          icon: Wallet,         color: '#ec4899', bg: 'bg-pink-50',    border: 'border-pink-200',    text: 'text-pink-700' },
  { key: 'hasib',         label: 'حاسب',           icon: CreditCard,     color: '#3b82f6', bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700' },
  { key: 'banki',         label: 'بنكي',           icon: Building2,      color: '#06b6d4', bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-700' },
  { key: 'bank_transfer', label: 'تحويل بنكي',     icon: ArrowLeftRight, color: '#6366f1', bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700' },
  { key: 'credit',        label: 'آجل',            icon: Clock,          color: '#f43f5e', bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700' },
];

const PIE_COLORS = METHODS.map((m) => m.color);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function Wallets() {
  const [dateFrom, setDateFrom]       = useState(monthStartStr);
  const [dateTo, setDateTo]           = useState(todayStr);
  const [stats, setStats]             = useState(null);
  const [sales, setSales]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null); // selected payment method

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statRes, salesRes] = await Promise.all([
        api.get('/reports/payment-methods', { params: { date_from: dateFrom, date_to: dateTo } }),
        api.get('/sales', { params: { date_from: dateFrom, date_to: `${dateTo}T23:59:59`, limit: 2000 } }),
      ]);
      setStats(statRes.data);
      setSales(salesRes.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const methodMeta = (key) => METHODS.find((m) => m.key === key) || { label: key, color: '#94a3b8', icon: Wallet, bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' };

  const filteredSales = selected
    ? sales.filter((s) => s.payment_method === selected)
    : sales;

  const pieData = (stats?.items || []).map((it) => ({
    name: methodMeta(it.method).label,
    value: it.total,
    pct: it.pct,
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center shadow-sm">
            <Wallet className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">المحافظ وطرق الدفع</h1>
            <p className="text-slate-500 text-sm">تقارير وإحصائيات مفصّلة لكل وسيلة دفع</p>
          </div>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border rounded-lg px-3 py-1.5 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm text-slate-700 border-0 outline-none w-32" />
            <span className="text-slate-400 text-xs">—</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="text-sm text-slate-700 border-0 outline-none w-32" />
          </div>
          <Button onClick={load} disabled={loading} variant="outline" className="gap-2 h-9">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'جارٍ التحميل…' : 'تحديث'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {/* الإجمالي الكلي */}
        <Card
          className={`cursor-pointer border-2 transition-all ${!selected ? 'border-slate-800 shadow-lg' : 'border-slate-200 hover:border-slate-400'}`}
          onClick={() => setSelected(null)}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-slate-600" />
              <span className="text-xs text-slate-500 font-semibold">الإجمالي الكلي</span>
            </div>
            <p className="text-2xl font-extrabold text-slate-900">{fmt(stats?.grand_total)} ر.ي</p>
            <p className="text-xs text-slate-400 mt-1">{sales.length} فاتورة</p>
          </CardContent>
        </Card>

        {/* Per-method cards */}
        {METHODS.map((m) => {
          const Icon = m.icon;
          const found = stats?.items?.find((it) => it.method === m.key);
          const isActive = selected === m.key;
          return (
            <Card
              key={m.key}
              className={`cursor-pointer border-2 transition-all ${isActive ? `${m.border} shadow-lg` : 'border-slate-200 hover:border-slate-300'}`}
              onClick={() => setSelected(isActive ? null : m.key)}
            >
              <CardContent className={`p-4 ${isActive ? m.bg : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-4 h-4 ${m.text}`} />
                    <span className={`text-xs font-semibold ${m.text}`}>{m.label}</span>
                  </div>
                  {found && (
                    <Badge className={`text-[10px] ${m.bg} ${m.text} border ${m.border}`}>
                      {found.pct}%
                    </Badge>
                  )}
                </div>
                <p className="text-xl font-extrabold text-slate-900">{fmt(found?.total || 0)} ر.ي</p>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>{found?.count || 0} عملية</span>
                  {found?.avg > 0 && <span>متوسط: {fmt(found.avg)}</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      {stats && stats.items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pie Chart */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <PieIcon className="w-5 h-5 text-purple-600" /> توزيع طرق الدفع (نسبي)
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={85} innerRadius={40} paddingAngle={3}
                    label={({ name, pct }) => `${name} ${pct}%`}
                    labelLine={false}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${fmt(v)} ر.ي`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Bar Chart */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" /> المبالغ حسب طريقة الدفع
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={stats.items.map((it) => ({
                    name: methodMeta(it.method).label,
                    total: it.total,
                    count: it.count,
                  }))}
                  margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => `${fmt(v)} ر.ي`} />
                  <Bar dataKey="total" name="الإجمالي" radius={[6, 6, 0, 0]}>
                    {stats.items.map((it, i) => (
                      <Cell key={i} fill={methodMeta(it.method).color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-slate-600" />
              كشف العمليات
              {selected && (
                <Badge className={`${methodMeta(selected).bg} ${methodMeta(selected).text} border ${methodMeta(selected).border}`}>
                  {methodMeta(selected).label}
                </Badge>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">{filteredSales.length} فاتورة</span>
              {selected && (
                <button onClick={() => setSelected(null)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 bg-slate-100 rounded-lg px-2 py-1">
                  <X className="w-3 h-3" /> إلغاء الفلتر
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-right font-semibold">رقم الفاتورة</th>
                  <th className="px-3 py-2.5 text-right font-semibold">العميل</th>
                  <th className="px-3 py-2.5 text-center font-semibold">طريقة الدفع</th>
                  <th className="px-3 py-2.5 text-center font-semibold">المبلغ</th>
                  <th className="px-3 py-2.5 text-center font-semibold">التاريخ</th>
                  <th className="px-3 py-2.5 text-center font-semibold">الموظف</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      <Receipt className="w-10 h-10 mx-auto mb-2 opacity-20" />
                      <p>لا توجد عمليات في هذه الفترة</p>
                    </td>
                  </tr>
                ) : (
                  filteredSales.slice(0, 200).map((s, i) => {
                    const m = methodMeta(s.payment_method);
                    const Icon = m.icon;
                    return (
                      <tr key={s.id || s._id || i}
                        className={`border-t transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-slate-100`}>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{s.invoice_no || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-800">{s.customer_name || 'عميل نقدي'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${m.bg} ${m.text} border ${m.border}`}>
                            <Icon className="w-3 h-3" />{m.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-slate-900">{fmt(s.total)} ر.ي</td>
                        <td className="px-3 py-2.5 text-center text-xs text-slate-500">{fmtDate(s.created_at)}</td>
                        <td className="px-3 py-2.5 text-center text-xs text-slate-500">{s.created_by_name || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {filteredSales.length > 200 && (
              <p className="text-center text-xs text-slate-400 py-3">
                يُعرض أول 200 سجل من أصل {filteredSales.length} — استخدم فلتر التاريخ لتضييق النتائج
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
