import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Receipt, Calendar, DollarSign, Banknote, Clock,
  TrendingUp, ChevronDown, ChevronUp, Filter, Users,
} from 'lucide-react';
import api from '../lib/api';
import { Badge } from '../components/ui/badge';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0);

const PAYMENT_LABELS = {
  cash: 'نقداً', jaib: 'جيب', fluusak: 'فلوسك', hasib: 'حاسب',
  banki: 'بنكي', bank_transfer: 'تحويل بنكي', credit: 'آجل',
};

const STATUS_LABEL = {
  completed: { label: 'مكتملة',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  voided:    { label: 'ملغاة',   cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  pending:   { label: 'معلّقة',  cls: 'bg-amber-100 text-amber-700 border-amber-200' },
};

const Sales = () => {
  const today      = new Date().toISOString().split('T')[0];
  const firstMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  const [sales, setSales]         = useState([]);
  const [dateFrom, setDateFrom]   = useState(today);
  const [dateTo, setDateTo]       = useState(today);
  const [loading, setLoading]     = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);

  const load = async (from = dateFrom, to = dateTo) => {
    setLoading(true);
    try {
      const params = {};
      if (from) params.date_from = from;
      if (to)   params.date_to   = to + 'T23:59:59';
      const r = await api.get('/sales', { params });
      setSales(r.data || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const setPreset = (from, to) => { setDateFrom(from); setDateTo(to); load(from, to); };

  // ─── KPI calculations ─────────────────────────────────────────────
  const completed = useMemo(() => sales.filter((s) => s.status === 'completed'), [sales]);
  const totalAmt  = useMemo(() => completed.reduce((s, x) => s + Number(x.total), 0), [completed]);
  const cashAmt   = useMemo(() => completed.filter((s) => s.payment_method !== 'credit').reduce((s, x) => s + Number(x.total), 0), [completed]);
  const creditAmt = useMemo(() => completed.filter((s) => s.payment_method === 'credit').reduce((s, x) => s + Number(x.total), 0), [completed]);
  const customers = useMemo(() => new Set(completed.filter((s) => s.customer_id).map((s) => s.customer_id)).size, [completed]);

  // ─── Group by day ─────────────────────────────────────────────────
  const byDay = useMemo(() => {
    const map = {};
    for (const s of sales) {
      const day = (s.created_at || '').split('T')[0];
      if (!day) continue;
      if (!map[day]) map[day] = { date: day, total: 0, cash: 0, credit: 0, count: 0, rows: [] };
      const t = Number(s.total);
      map[day].total += t;
      map[day].count += 1;
      if (s.status === 'completed') {
        if (s.payment_method === 'credit') map[day].credit += t;
        else map[day].cash += t;
      }
      map[day].rows.push(s);
    }
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [sales]);

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl" data-testid="sales-page">

      {/* ─── Header ─── */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <Receipt className="text-emerald-500" /> المبيعات
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {sales.length} فاتورة — إجمالي: <span className="font-bold text-emerald-600">{fmt(totalAmt)} ر.ي</span>
        </p>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white">
              <DollarSign className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">إجمالي المبيعات</p>
              <p className="text-xl font-bold" data-testid="sales-total">{fmt(totalAmt)} <span className="text-sm">ر.ي</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-4 text-white">
              <Banknote className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">نقدي</p>
              <p className="text-xl font-bold" data-testid="sales-cash">{fmt(cashAmt)} <span className="text-sm">ر.ي</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-4 text-white">
              <Clock className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">آجل (دين)</p>
              <p className="text-xl font-bold" data-testid="sales-credit">{fmt(creditAmt)} <span className="text-sm">ر.ي</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-4 text-white">
              <Users className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">عدد الفواتير</p>
              <p className="text-xl font-bold" data-testid="sales-count">{completed.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Date filter ─── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">تصفية بالتاريخ</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <button onClick={() => load()} className="bg-amber-500 hover:bg-amber-600 text-white h-10 rounded-md font-medium transition-colors">
              عرض النتائج
            </button>
            <div className="flex gap-2">
              <button onClick={() => setPreset(today, today)}
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 hover:bg-amber-50 hover:border-amber-300 transition-colors">
                اليوم
              </button>
              <button onClick={() => setPreset(firstMonth, today)}
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 hover:bg-amber-50 hover:border-amber-300 transition-colors">
                هذا الشهر
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Daily Summary ─── */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          ملخص المبيعات اليومية
          {dateFrom === dateTo
            ? ` — يوم ${dateFrom}`
            : ` — من ${dateFrom} إلى ${dateTo}`}
        </h2>

        {loading ? (
          <div className="text-center py-10 text-slate-400">جاري التحميل...</div>
        ) : byDay.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
            <Receipt className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-slate-400">لا توجد مبيعات في هذه الفترة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {byDay.map((day) => {
              const isOpen = expandedDay === day.date;
              return (
                <Card key={day.date} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Day header */}
                  <button className="w-full" onClick={() => setExpandedDay(isOpen ? null : day.date)}>
                    <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-l from-emerald-50 to-transparent hover:from-emerald-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 text-base">
                            {new Date(day.date + 'T00:00:00').toLocaleDateString('ar-EG', {
                              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                            })}
                          </p>
                          <p className="text-xs text-slate-500">{day.count} فاتورة</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        {/* cash / credit breakdown */}
                        <div className="hidden md:flex gap-4 text-sm">
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400">نقدي</p>
                            <p className="font-bold text-emerald-600">{fmt(day.cash)} ر.ي</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400">آجل</p>
                            <p className="font-bold text-rose-500">{fmt(day.credit)} ر.ي</p>
                          </div>
                        </div>
                        <div className="text-left flex-shrink-0">
                          <p className="text-[10px] text-slate-400">إجمالي اليوم</p>
                          <p className="text-xl font-extrabold text-emerald-700">{fmt(day.total)} ر.ي</p>
                        </div>
                        {isOpen
                          ? <ChevronUp className="w-5 h-5 text-slate-400" />
                          : <ChevronDown className="w-5 h-5 text-slate-400" />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded invoices */}
                  {isOpen && (
                    <div className="border-t">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-4 py-2 text-right font-medium">رقم الفاتورة</th>
                            <th className="px-4 py-2 text-right font-medium">الوقت</th>
                            <th className="px-4 py-2 text-center font-medium">الأصناف</th>
                            <th className="px-4 py-2 text-right font-medium">طريقة الدفع</th>
                            <th className="px-4 py-2 text-right font-medium">الحالة</th>
                            <th className="px-4 py-2 text-left font-medium">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {day.rows.map((s) => {
                            const st = STATUS_LABEL[s.status] || STATUS_LABEL.completed;
                            return (
                              <tr key={s.id} className="border-t hover:bg-emerald-50/30 transition-colors"
                                  data-testid={`sale-row-${s.invoice_no}`}>
                                <td className="px-4 py-2.5 font-mono font-bold text-amber-700 text-xs">{s.invoice_no}</td>
                                <td className="px-4 py-2.5 text-slate-500 text-xs">
                                  {new Date(s.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="px-4 py-2.5 text-center text-slate-600">{s.items?.length || 0}</td>
                                <td className="px-4 py-2.5 text-slate-600 text-xs">
                                  {PAYMENT_LABELS[s.payment_method] || s.payment_method}
                                </td>
                                <td className="px-4 py-2.5">
                                  <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
                                </td>
                                <td className="px-4 py-2.5 font-bold text-emerald-600 text-left">
                                  {fmt(s.total)} ر.ي
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 bg-emerald-50">
                            <td colSpan={3} className="px-4 py-2.5 text-xs text-slate-500">
                              نقدي: {fmt(day.cash)} | آجل: {fmt(day.credit)}
                            </td>
                            <td colSpan={2} className="px-4 py-2.5 font-bold text-slate-800">
                              إجمالي {day.date}
                            </td>
                            <td className="px-4 py-2.5 font-extrabold text-emerald-700 text-left text-base">
                              {fmt(day.total)} ر.ي
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}

            {/* Grand total */}
            {byDay.length > 1 && (
              <div className="bg-gradient-to-l from-emerald-600 to-teal-700 text-white rounded-xl px-5 py-4 shadow-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold text-lg">الإجمالي الكلي للفترة</p>
                    <p className="text-emerald-200 text-sm">{byDay.length} يوم — {sales.length} فاتورة</p>
                  </div>
                  <div className="text-left space-y-0.5">
                    <p className="text-2xl font-extrabold">{fmt(totalAmt)} ر.ي</p>
                    <p className="text-xs text-emerald-200">
                      نقدي: {fmt(cashAmt)} | آجل: {fmt(creditAmt)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Sales;
