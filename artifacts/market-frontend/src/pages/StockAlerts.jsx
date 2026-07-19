import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Package, RefreshCw, Calendar, CheckCircle } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import api from '../lib/api';

const fmt = (n) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const StockAlerts = () => {
  const [expiryProducts, setExpiryProducts]   = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [loading, setLoading]                 = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, prodRes] = await Promise.all([
        api.get('/products/expiry-report', { params: { days: 90 } }),
        api.get('/pos/products', { params: { limit: 2000 } }),
      ]);

      // منتجات الصلاحية
      setExpiryProducts(
        (expRes.data || []).sort((a, b) => {
          const dA = new Date(a.expiry_date) - new Date();
          const dB = new Date(b.expiry_date) - new Date();
          return dA - dB; // الأقرب انتهاءً أولاً
        })
      );

      // منتجات نفد مخزونها أو مخزونها منخفض
      const all = prodRes.data || [];
      setLowStockProducts(
        all
          .filter((p) => Number(p.current_stock) <= Math.max(0, Number(p.min_stock_level) || 0) || Number(p.current_stock) <= 0)
          .sort((a, b) => Number(a.current_stock) - Number(b.current_stock))
      );
    } catch (e) {
      console.error('StockAlerts load error', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Stats bar ─────────────────────────────────────────────────────────────
  const outOfStock  = lowStockProducts.filter((p) => Number(p.current_stock) <= 0).length;
  const lowStock    = lowStockProducts.filter((p) => Number(p.current_stock) > 0).length;
  const expiredNow  = expiryProducts.filter((p) => {
    const d = new Date(p.expiry_date); d.setHours(0,0,0,0);
    return d <= new Date();
  }).length;
  const nearExpiry  = expiryProducts.length - expiredNow;

  return (
    <div className="p-6 lg:p-8" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-rose-100 rounded-xl flex items-center justify-center shadow-sm">
            <AlertTriangle className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">تنبيهات المخزون</h1>
            <p className="text-slate-500 text-sm">منتجات نفد مخزونها أو اقتربت صلاحيتها من الانتهاء</p>
          </div>
        </div>
        <Button onClick={load} variant="outline" disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'نفد المخزون',        value: outOfStock,  bg: 'bg-rose-700',   icon: Package,         textColor: 'text-white' },
          { label: 'مخزون منخفض',        value: lowStock,    bg: 'bg-amber-500',  icon: AlertTriangle,   textColor: 'text-white' },
          { label: 'منتهية الصلاحية',    value: expiredNow,  bg: 'bg-purple-700', icon: Calendar,        textColor: 'text-white' },
          { label: 'صلاحيتها قريبة',     value: nearExpiry,  bg: 'bg-orange-500', icon: Calendar,        textColor: 'text-white' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="overflow-hidden border-0 shadow-md">
              <div className={`${s.bg} p-4 text-white`}>
                <Icon className="w-5 h-5 mb-2 opacity-80" />
                <p className="text-white/80 text-xs">{s.label}</p>
                <p className="text-3xl font-extrabold mt-1">{s.value}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ═══ قسم 1: نفاد المخزون والمخزون المنخفض ═══ */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-rose-700 mb-3 flex items-center gap-2">
          <Package className="w-5 h-5" />
          المنتجات التي نفد مخزونها أو مخزونها منخفض
          {lowStockProducts.length > 0 && (
            <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-sm font-bold">
              {lowStockProducts.length} منتج
            </Badge>
          )}
        </h2>

        {lowStockProducts.length === 0 ? (
          <Card className="p-10 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">جميع المنتجات متوفرة بكميات كافية ✓</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-rose-700 text-white">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold">اسم المنتج</th>
                    <th className="px-4 py-3 text-center font-semibold">المخزون الحالي</th>
                    <th className="px-4 py-3 text-center font-semibold">الحد الأدنى</th>
                    <th className="px-4 py-3 text-center font-semibold">سعر البيع</th>
                    <th className="px-4 py-3 text-center font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.map((p) => {
                    const stock  = Number(p.current_stock);
                    const isOut  = stock <= 0;
                    return (
                      <tr
                        key={p.id}
                        className={`border-t transition-colors ${
                          isOut ? 'bg-rose-50 hover:bg-rose-100' : 'bg-amber-50/60 hover:bg-amber-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-500 font-mono">{p.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-2xl font-extrabold ${isOut ? 'text-rose-700' : 'text-amber-600'}`}>
                            {fmt(stock)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500 font-semibold">
                          {fmt(p.min_stock_level)}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-700">
                          {fmt(p.sale_price)} ر.ي
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isOut ? (
                            <Badge className="bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold px-3 py-1">
                              ⛔ نفد المخزون
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-3 py-1">
                              ⚠️ مخزون منخفض
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ═══ قسم 2: الصلاحية ═══ */}
      <section>
        <h2 className="text-lg font-bold text-amber-700 mb-3 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          منتجات صلاحيتها قريبة الانتهاء (خلال 90 يوم)
          {expiryProducts.length > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-sm font-bold">
              {expiryProducts.length} منتج
            </Badge>
          )}
        </h2>

        {expiryProducts.length === 0 ? (
          <Card className="p-10 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">لا توجد منتجات قريبة انتهاء الصلاحية ✓</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-600 text-white">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold">اسم المنتج</th>
                    <th className="px-4 py-3 text-center font-semibold">تاريخ الانتهاء</th>
                    <th className="px-4 py-3 text-center font-semibold">الأيام المتبقية</th>
                    <th className="px-4 py-3 text-center font-semibold">الكمية المتاحة</th>
                    <th className="px-4 py-3 text-center font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryProducts.map((p, i) => {
                    const expDate   = new Date(p.expiry_date);
                    const today     = new Date(); today.setHours(0, 0, 0, 0);
                    const daysLeft  = Math.ceil((expDate - today) / 86400000);
                    const isExpired = daysLeft <= 0;
                    const isUrgent  = daysLeft > 0 && daysLeft <= 7;
                    const isWarning = daysLeft > 7 && daysLeft <= 30;

                    return (
                      <tr
                        key={p.id || i}
                        className={`border-t transition-colors ${
                          isExpired ? 'bg-rose-50 hover:bg-rose-100'
                          : isUrgent ? 'bg-orange-50 hover:bg-orange-100'
                          : 'bg-amber-50/40 hover:bg-amber-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-500 font-mono">{p.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs text-slate-600">
                          {expDate.toLocaleDateString('ar-EG', {
                            year: 'numeric', month: 'long', day: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-lg font-extrabold ${
                            isExpired ? 'text-rose-700'
                            : isUrgent ? 'text-orange-600'
                            : isWarning ? 'text-amber-600'
                            : 'text-slate-600'
                          }`}>
                            {isExpired
                              ? `منتهي منذ ${Math.abs(daysLeft)} يوم`
                              : `${daysLeft} يوم`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700">
                          {fmt(p.current_stock)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isExpired ? (
                            <Badge className="bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold px-3 py-1">
                              🚫 منتهية الصلاحية
                            </Badge>
                          ) : isUrgent ? (
                            <Badge className="bg-orange-100 text-orange-800 border border-orange-300 text-xs font-bold px-3 py-1">
                              🔴 عاجل
                            </Badge>
                          ) : isWarning ? (
                            <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-3 py-1">
                              ⚠️ تنبيه
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 text-xs font-bold px-3 py-1">
                              📅 مراقبة
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
};

export default StockAlerts;
