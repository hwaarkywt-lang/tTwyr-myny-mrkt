/**
 * Inventory.jsx — شاشة إدارة المخزون بالدفعات (Batch Inventory)
 * كل عملية شراء تُحفظ كدفعة مستقلة بسعر تكلفتها الخاصة.
 * الأرباح تُحسب فقط من سعر تكلفة الدفعة التي خرجت منها البضاعة — لا متوسط.
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  Package, TrendingUp, DollarSign, Archive, Search, RefreshCw,
  ChevronDown, ChevronUp, BarChart2, Layers, Settings2, CheckCircle,
  AlertCircle, Filter,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const fmt  = (n, d = 2) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: d }).format(Number(n) || 0);
const fmtD = (dt) => dt ? new Date(dt).toLocaleDateString('ar-EG') : '—';

const PCT_COLOR = (p) => {
  if (p >= 30) return 'text-emerald-600';
  if (p >= 15) return 'text-amber-600';
  return 'text-rose-600';
};

const METHOD_LABELS = { fifo: 'FIFO (الأقدم أولاً)', lifo: 'LIFO (الأحدث أولاً)', specific: 'تحديد خاص' };

// ─── KPI Card ────────────────────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, sub, color = 'amber' }) => {
  const colors = {
    amber:   'from-amber-400  to-amber-500  text-amber-700  bg-amber-50  border-amber-200',
    emerald: 'from-emerald-400 to-emerald-500 text-emerald-700 bg-emerald-50 border-emerald-200',
    sky:     'from-sky-400    to-sky-500    text-sky-700    bg-sky-50    border-sky-200',
    rose:    'from-rose-400   to-rose-500   text-rose-700   bg-rose-50   border-rose-200',
    violet:  'from-violet-400 to-violet-500 text-violet-700 bg-violet-50 border-violet-200',
  };
  const [bg, , text, cardBg, border] = colors[color].split(' ');
  return (
    <Card className={`border ${border} ${cardBg}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${bg} ${bg.replace('from-', 'to-')} flex items-center justify-center shadow`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className={`text-xl font-extrabold ${text}`}>{value}</p>
          {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Inventory() {
  const { can } = useAuth();

  // ── State: Batches tab
  const [batches, setBatches]               = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [showExhausted, setShowExhausted]   = useState(false);
  const [productFilter, setProductFilter]   = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');

  // ── State: Profit report tab
  const [profitRows, setProfitRows]       = useState([]);
  const [profitTotals, setProfitTotals]   = useState(null);
  const [loadingProfit, setLoadingProfit] = useState(false);
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');

  // ── State: Valuation method
  const [method, setMethod]     = useState('fifo');
  const [savingMethod, setSaving] = useState(false);

  // ── Active tab
  const [tab, setTab] = useState('batches'); // batches | profits | method

  // ── Load batches ────────────────────────────────────────────────────────────
  const loadBatches = async () => {
    setLoadingBatches(true);
    try {
      const res = await api.get('/batches', {
        params: { include_exhausted: showExhausted, limit: 1000 },
      });
      setBatches(res.data);
    } catch (e) {
      toast({ title: 'خطأ في تحميل الدفعات', description: formatApiError(e), variant: 'destructive' });
    } finally {
      setLoadingBatches(false);
    }
  };

  // ── Load valuation method ────────────────────────────────────────────────────
  const loadMethod = async () => {
    try {
      const r = await api.get('/settings/valuation-method');
      setMethod(r.data.method);
    } catch (_) {}
  };

  useEffect(() => { loadBatches(); loadMethod(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadBatches(); /* eslint-disable-next-line */ }, [showExhausted]);

  // ── Load profit report ───────────────────────────────────────────────────────
  const loadProfits = async () => {
    setLoadingProfit(true);
    try {
      const res = await api.get('/reports/batch-profits', {
        params: { date_from: dateFrom || undefined, date_to: dateTo || undefined },
      });
      setProfitRows(res.data.rows);
      setProfitTotals(res.data.totals);
    } catch (e) {
      toast({ title: 'خطأ في تحميل الأرباح', description: formatApiError(e), variant: 'destructive' });
    } finally {
      setLoadingProfit(false);
    }
  };

  useEffect(() => {
    if (tab === 'profits') loadProfits();
    /* eslint-disable-next-line */
  }, [tab]);

  // ── Save valuation method ────────────────────────────────────────────────────
  const saveMethod = async () => {
    setSaving(true);
    try {
      await api.patch('/settings/valuation-method', { method });
      toast({ title: '✅ تم حفظ طريقة التقييم', description: METHOD_LABELS[method] });
    } catch (e) {
      toast({ title: 'فشل', description: formatApiError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered batches ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let b = [...batches];
    if (productFilter.trim()) {
      const q = productFilter.trim().toLowerCase();
      b = b.filter((x) => (x.product_name || '').toLowerCase().includes(q) ||
                           (x.product_sku  || '').toLowerCase().includes(q));
    }
    if (supplierFilter.trim()) {
      const q = supplierFilter.trim().toLowerCase();
      b = b.filter((x) => (x.supplier_name || '').toLowerCase().includes(q));
    }
    return b;
  }, [batches, productFilter, supplierFilter]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const activeBatches = batches.filter((b) => !b.is_exhausted);
  const totalCostValue   = activeBatches.reduce((s, b) => s + b.batch_value_at_cost, 0);
  const totalSaleValue   = activeBatches.reduce((s, b) => s + b.batch_value_at_sale, 0);
  const totalExpProfit   = activeBatches.reduce((s, b) => s + b.expected_profit, 0);
  const uniqueProducts   = new Set(activeBatches.map((b) => b.product_id)).size;

  return (
    <div className="p-6 lg:p-8 max-w-full" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-8 h-8 text-amber-500" /> إدارة المخزون بالدفعات
          </h1>
          <p className="text-slate-500 mt-1">
            كل دفعة شراء مستقلة — سعر تكلفة دقيق — أرباح محاسبية احترافية
          </p>
        </div>
        <Button
          onClick={loadBatches}
          variant="outline"
          className="flex items-center gap-2"
          disabled={loadingBatches}
        >
          <RefreshCw className={`w-4 h-4 ${loadingBatches ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={Archive}     label="الدفعات النشطة"         value={activeBatches.length}          sub={`${uniqueProducts} منتج`}          color="amber"   />
        <KpiCard icon={DollarSign}  label="قيمة المخزون (بالتكلفة)" value={`${fmt(totalCostValue)} ر.ي`}  sub="مجموع تكلفة الكميات المتبقية"      color="sky"     />
        <KpiCard icon={Package}     label="قيمة المخزون (بالبيع)"   value={`${fmt(totalSaleValue)} ر.ي`}  sub="لو بعنا كل المخزون"                color="violet"  />
        <KpiCard icon={TrendingUp}  label="الربح المتوقع"           value={`${fmt(totalExpProfit)} ر.ي`}  sub="الفرق بين البيع والتكلفة"          color="emerald" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {[
          { id: 'batches', label: 'الدفعات', icon: Layers },
          { id: 'profits', label: 'تقرير الأرباح', icon: BarChart2 },
          { id: 'method',  label: 'طريقة التقييم', icon: Settings2 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px ${
              tab === id
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Batches ═══ */}
      {tab === 'batches' && (
        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-48">
                  <Label className="text-xs mb-1 block">بحث بالمنتج / SKU</Label>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={productFilter}
                      onChange={(e) => setProductFilter(e.target.value)}
                      placeholder="اسم المنتج أو الرمز..."
                      className="pr-9"
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-48">
                  <Label className="text-xs mb-1 block">بحث بالمورد</Label>
                  <div className="relative">
                    <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={supplierFilter}
                      onChange={(e) => setSupplierFilter(e.target.value)}
                      placeholder="اسم المورد..."
                      className="pr-9"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600 pb-1">
                  <input
                    type="checkbox"
                    checked={showExhausted}
                    onChange={(e) => setShowExhausted(e.target.checked)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  عرض الدفعات المنتهية
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          {loadingBatches ? (
            <div className="text-center text-slate-400 py-16">جارٍ تحميل الدفعات...</div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center">
              <Archive className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400">لا توجد دفعات بعد — ستظهر الدفعات بعد تسجيل عمليات الشراء</p>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-right text-slate-600 font-semibold text-xs">
                    <th className="px-4 py-3">رقم الدفعة</th>
                    <th className="px-4 py-3">المنتج</th>
                    <th className="px-4 py-3">المورد</th>
                    <th className="px-4 py-3">تاريخ الشراء</th>
                    <th className="px-4 py-3 text-center">الكمية الأصلية</th>
                    <th className="px-4 py-3 text-center">المتبقي</th>
                    <th className="px-4 py-3 text-center">سعر الشراء/حبة</th>
                    <th className="px-4 py-3 text-center">سعر البيع/حبة</th>
                    <th className="px-4 py-3 text-center">ربح/حبة</th>
                    <th className="px-4 py-3 text-center">ربح/كرتون</th>
                    <th className="px-4 py-3 text-center">قيمة المخزون</th>
                    <th className="px-4 py-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, i) => {
                    const profitPct = b.sale_price > 0
                      ? ((b.profit_per_unit / b.sale_price) * 100)
                      : 0;
                    return (
                      <tr
                        key={b.id}
                        className={`border-b border-slate-100 transition-colors ${
                          b.is_exhausted
                            ? 'bg-slate-50 opacity-60'
                            : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                        } hover:bg-amber-50/40`}
                      >
                        {/* رقم الدفعة */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            {b.batch_no}
                          </span>
                        </td>
                        {/* المنتج */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{b.product_name}</p>
                          {b.product_sku && (
                            <p className="text-[11px] text-slate-400 font-mono">{b.product_sku}</p>
                          )}
                        </td>
                        {/* المورد */}
                        <td className="px-4 py-3 text-slate-600">{b.supplier_name || '—'}</td>
                        {/* تاريخ الشراء */}
                        <td className="px-4 py-3 text-slate-500 tabular-nums text-xs">{fmtD(b.purchase_date)}</td>
                        {/* الكمية الأصلية */}
                        <td className="px-4 py-3 text-center font-semibold tabular-nums">
                          {fmt(b.original_qty, 0)}
                        </td>
                        {/* المتبقي */}
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold tabular-nums ${
                            b.remaining_qty <= 0 ? 'text-slate-400' :
                            b.remaining_qty <= b.original_qty * 0.2 ? 'text-rose-600' :
                            'text-emerald-700'
                          }`}>
                            {fmt(b.remaining_qty, 0)}
                          </span>
                        </td>
                        {/* سعر الشراء */}
                        <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                          {fmt(b.unit_cost)} ر.ي
                        </td>
                        {/* سعر البيع */}
                        <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                          {b.sale_price > 0 ? `${fmt(b.sale_price)} ر.ي` : '—'}
                        </td>
                        {/* ربح/حبة */}
                        <td className="px-4 py-3 text-center">
                          {b.sale_price > 0 ? (
                            <span className={`font-bold tabular-nums ${PCT_COLOR(profitPct)}`}>
                              {fmt(b.profit_per_unit)} ر.ي
                              <span className="text-[10px] opacity-70 mr-1">({fmt(profitPct, 1)}%)</span>
                            </span>
                          ) : '—'}
                        </td>
                        {/* ربح/كرتون */}
                        <td className="px-4 py-3 text-center">
                          {b.units_per_carton > 1 && b.sale_price > 0 ? (
                            <span className="font-semibold text-violet-700 tabular-nums">
                              {fmt(b.profit_per_carton)} ر.ي
                              <span className="text-[10px] opacity-60 mr-1">({fmt(b.units_per_carton, 0)} حبة)</span>
                            </span>
                          ) : '—'}
                        </td>
                        {/* قيمة المخزون */}
                        <td className="px-4 py-3 text-center font-semibold tabular-nums text-sky-700">
                          {fmt(b.batch_value_at_cost)} ر.ي
                        </td>
                        {/* الحالة */}
                        <td className="px-4 py-3 text-center">
                          {b.is_exhausted ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                              <Archive className="w-3 h-3" /> منتهية
                            </span>
                          ) : b.remaining_qty <= b.original_qty * 0.2 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 bg-rose-50 rounded-full px-2 py-0.5">
                              <AlertCircle className="w-3 h-3" /> تنفد
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                              <CheckCircle className="w-3 h-3" /> نشطة
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Footer totals */}
                <tfoot className="bg-amber-50 border-t-2 border-amber-200">
                  <tr className="font-bold text-sm text-amber-800">
                    <td className="px-4 py-3" colSpan={4}>
                      الإجمالي ({filtered.length} دفعة)
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      {fmt(filtered.reduce((s, b) => s + b.original_qty, 0), 0)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      {fmt(filtered.reduce((s, b) => s + b.remaining_qty, 0), 0)}
                    </td>
                    <td className="px-4 py-3" colSpan={4}></td>
                    <td className="px-4 py-3 text-center tabular-nums text-sky-800">
                      {fmt(filtered.reduce((s, b) => s + b.batch_value_at_cost, 0))} ر.ي
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Profit Report ═══ */}
      {tab === 'profits' && (
        <div className="space-y-4">
          {/* Date filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <Label className="text-xs mb-1 block">من تاريخ</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">إلى تاريخ</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
                </div>
                <Button
                  onClick={loadProfits}
                  disabled={loadingProfit}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {loadingProfit ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      جارٍ الحساب...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4" /> احسب الأرباح
                    </span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Profit KPIs */}
          {profitTotals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard icon={DollarSign}  label="إجمالي المبيعات"   value={`${fmt(profitTotals.total_revenue)} ر.ي`}  color="sky"     />
              <KpiCard icon={Package}     label="تكلفة البضاعة (COGS)" value={`${fmt(profitTotals.total_cost)} ر.ي`} color="rose"    />
              <KpiCard icon={TrendingUp}  label="إجمالي الربح"       value={`${fmt(profitTotals.gross_profit)} ر.ي`} color="emerald" />
              <KpiCard icon={BarChart2}   label="هامش الربح الإجمالي" value={`${fmt(profitTotals.profit_margin_pct, 1)}%`}
                sub="نسبة الربح من المبيعات" color="violet" />
            </div>
          )}

          {/* Profit Table */}
          {profitRows.length === 0 && !loadingProfit ? (
            <Card className="p-12 text-center">
              <BarChart2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400">
                لا توجد بيانات أرباح — يُحتسب الربح فقط للمبيعات التي تمت بعد تفعيل نظام الدفعات
              </p>
            </Card>
          ) : profitRows.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-right text-slate-600 font-semibold text-xs">
                    <th className="px-4 py-3">المنتج</th>
                    <th className="px-4 py-3 text-center">الكمية المباعة</th>
                    <th className="px-4 py-3 text-center">إجمالي المبيعات</th>
                    <th className="px-4 py-3 text-center">تكلفة البضاعة (COGS)</th>
                    <th className="px-4 py-3 text-center">الربح الإجمالي</th>
                    <th className="px-4 py-3 text-center">هامش الربح %</th>
                  </tr>
                </thead>
                <tbody>
                  {profitRows.map((r, i) => (
                    <tr
                      key={r.product_id}
                      className={`border-b border-slate-100 hover:bg-amber-50/30 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{r.product_name}</p>
                        {r.product_sku && (
                          <p className="text-[11px] text-slate-400 font-mono">{r.product_sku}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">{fmt(r.total_qty_sold, 0)}</td>
                      <td className="px-4 py-3 text-center tabular-nums font-semibold text-sky-700">
                        {fmt(r.total_revenue)} ر.ي
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-rose-700">
                        {fmt(r.total_cost)} ر.ي
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold tabular-nums ${r.gross_profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {fmt(r.gross_profit)} ر.ي
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold tabular-nums text-sm ${PCT_COLOR(r.profit_margin_pct)}`}>
                          {fmt(r.profit_margin_pct, 1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {profitTotals && (
                  <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                    <tr className="font-bold text-emerald-800">
                      <td className="px-4 py-3">الإجمالي ({profitRows.length} منتج)</td>
                      <td></td>
                      <td className="px-4 py-3 text-center tabular-nums text-sky-800">
                        {fmt(profitTotals.total_revenue)} ر.ي
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-rose-800">
                        {fmt(profitTotals.total_cost)} ر.ي
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-emerald-900">
                        {fmt(profitTotals.gross_profit)} ر.ي
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        {fmt(profitTotals.profit_margin_pct, 1)}%
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* ═══ TAB: Valuation Method ═══ */}
      {tab === 'method' && (
        <Card className="max-w-lg">
          <CardContent className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-amber-500" />
                طريقة تقييم المخزون
              </h2>
              <p className="text-sm text-slate-500">
                تحدد كيف يسحب النظام من الدفعات عند كل عملية بيع.
                التغيير يؤثر على الفواتير القادمة فقط.
              </p>
            </div>

            <div className="space-y-3">
              {Object.entries(METHOD_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    method === key
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="method"
                    value={key}
                    checked={method === key}
                    onChange={() => setMethod(key)}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <p className="font-bold text-slate-800">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {key === 'fifo' && 'أول دفعة دخلت المخزون هي أول دفعة تُباع — الأنسب للبضائع ذات التواريخ'}
                      {key === 'lifo' && 'آخر دفعة دخلت هي أول دفعة تُباع — يعكس سعر الشراء الأحدث في التكاليف'}
                      {key === 'specific' && 'يتيح للمدير تحديد الدفعة يدوياً لكل عملية بيع — للمنتجات الفردية'}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <strong>الطريقة الحالية المفعّلة:</strong> {METHOD_LABELS[method]}
            </div>

            {can('admin', 'manager') && (
              <Button
                onClick={saveMethod}
                disabled={savingMethod}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white h-11 font-bold"
              >
                {savingMethod ? 'جارٍ الحفظ...' : '💾 حفظ الطريقة'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
