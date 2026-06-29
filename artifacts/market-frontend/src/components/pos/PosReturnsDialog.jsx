import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, ArrowRight, ArrowLeft, RotateCcw, Repeat,
  AlertCircle, CheckCircle2, Receipt, Banknote, CreditCard, UserCheck,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../../hooks/use-toast';
import api, { formatApiError } from '../../lib/api';
import { exportVoucherPDF } from '../../lib/pdfExport';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const STEPS = {
  PICK_SALE:    1,  // اختر الفاتورة
  PICK_ITEMS:   2,  // اختر المنتجات + الكميات
  CHOOSE_MODE:  3,  // مرتجع فقط أم استبدال
  EXCHANGE:     4,  // اختر منتجات الاستبدال + التسوية
  RECEIPT:      5,  // إيصال نهائي
};

const PosReturnsDialog = ({ open, onClose, onCompleted }) => {
  const [step, setStep] = useState(STEPS.PICK_SALE);
  const [query, setQuery] = useState('');
  const [sales, setSales] = useState([]);
  const [selectedSale, setSelectedSale] = useState(null);
  const [returnable, setReturnable] = useState(null);   // { items: [...], ... }
  const [returnQtys, setReturnQtys] = useState({});      // { sale_item_id: qty }
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState(null);                // 'return' | 'exchange'

  // exchange state
  const [products, setProducts] = useState([]);
  const [newCart, setNewCart] = useState([]);            // [{product_id, name, sale_price, quantity, stock}]
  const [newSearch, setNewSearch] = useState('');
  const [settlement, setSettlement] = useState('cash');   // when diff < 0: cash_refund | credit
  const [cashPaidConfirmed, setCashPaidConfirmed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [resultReceipt, setResultReceipt] = useState(null);

  // === Reset on open/close ===
  useEffect(() => {
    if (open) {
      setStep(STEPS.PICK_SALE);
      setQuery('');
      setSales([]);
      setSelectedSale(null);
      setReturnable(null);
      setReturnQtys({});
      setReason('');
      setMode(null);
      setNewCart([]);
      setNewSearch('');
      setSettlement('cash');
      setCashPaidConfirmed(false);
      setResultReceipt(null);
      // initial sales (last 30)
      api.get('/sales-returns/search-sales', { params: { q: '', limit: 30 } })
        .then((r) => setSales(r.data)).catch(() => {});
      api.get('/pos/products', { params: { limit: 500 } })
        .then((r) => setProducts(r.data)).catch(() => {});
    }
  }, [open]);

  // search sales on query change
  useEffect(() => {
    if (!open || step !== STEPS.PICK_SALE) return;
    const t = setTimeout(() => {
      api.get('/sales-returns/search-sales', { params: { q: query, limit: 30 } })
        .then((r) => setSales(r.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, step]);

  // === Step 1 → 2 : pick sale & load returnable items ===
  const pickSale = async (s) => {
    try {
      const { data } = await api.get(`/sales/${s.id}/returnable-items`);
      setSelectedSale(s);
      setReturnable(data);
      const initial = {};
      data.items.forEach((it) => { initial[it.sale_item_id] = 0; });
      setReturnQtys(initial);
      setStep(STEPS.PICK_ITEMS);
    } catch (e) {
      toast({ title: 'تعذّر تحميل أصناف الفاتورة', description: formatApiError(e), variant: 'destructive' });
    }
  };

  // === Helpers ===
  const returnSubtotal = useMemo(() => {
    if (!returnable) return 0;
    return returnable.items.reduce((s, it) => {
      const q = Number(returnQtys[it.sale_item_id] || 0);
      const per = it.sold_quantity > 0 ? (it.line_total / it.sold_quantity) : 0;
      return s + (per * q);
    }, 0);
  }, [returnable, returnQtys]);

  const hasReturnSelection = useMemo(() =>
    Object.values(returnQtys).some((q) => Number(q) > 0),
  [returnQtys]);

  const updateReturnQty = (sale_item_id, raw, max) => {
    let q = Number(raw);
    if (Number.isNaN(q) || q < 0) q = 0;
    if (q > max) q = max;
    setReturnQtys((prev) => ({ ...prev, [sale_item_id]: q }));
  };

  const filteredProducts = useMemo(() => {
    const term = newSearch.trim().toLowerCase();
    let list = products;
    if (term) {
      list = list.filter((p) =>
        (p.name || '').toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term),
      );
    }
    return list.slice(0, 100);
  }, [products, newSearch]);

  const newCartTotal = useMemo(() =>
    newCart.reduce((s, x) => s + (Number(x.sale_price) * Number(x.quantity || 0)), 0),
  [newCart]);

  const diff = newCartTotal - returnSubtotal;  // > 0: customer pays; < 0: store owes

  const addNewProduct = (p) => {
    setNewCart((prev) => {
      const exist = prev.find((x) => x.product_id === p.id);
      if (exist) {
        if (exist.quantity + 1 > Number(p.current_stock || 0)) {
          toast({ title: 'المخزون غير كافٍ', variant: 'destructive' });
          return prev;
        }
        return prev.map((x) =>
          x.product_id === p.id ? { ...x, quantity: x.quantity + 1 } : x,
        );
      }
      if (Number(p.current_stock || 0) <= 0) {
        toast({ title: 'المنتج غير متوفر', variant: 'destructive' });
        return prev;
      }
      return [...prev, {
        product_id: p.id, name: p.name, sku: p.sku,
        sale_price: Number(p.sale_price || 0),
        quantity: 1, stock: Number(p.current_stock || 0),
      }];
    });
  };

  const updateNewQty = (pid, delta) => {
    setNewCart((prev) => prev
      .map((x) => x.product_id === pid
        ? { ...x, quantity: Math.max(0, Math.min(x.stock, x.quantity + delta)) }
        : x)
      .filter((x) => x.quantity > 0));
  };

  // === Submit handlers ===
  const submitReturnOnly = async () => {
    setSubmitting(true);
    try {
      const items = Object.entries(returnQtys)
        .filter(([, q]) => Number(q) > 0)
        .map(([sale_item_id, q]) => ({ sale_item_id, quantity: Number(q) }));
      const { data } = await api.post('/sales-returns/instant', {
        sale_id: selectedSale.id,
        items,
        reason: reason || 'مرتجع POS',
      });
      setResultReceipt({
        kind: 'return',
        return_no: data.return_no,
        total: data.total,
        return_type: data.return_type,
        items: data.items,
        invoice_no: selectedSale.invoice_no,
      });
      setStep(STEPS.RECEIPT);
      onCompleted?.();
    } catch (e) {
      toast({ title: 'فشل تنفيذ المرتجع', description: formatApiError(e), variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const submitExchange = async () => {
    if (diff > 0 && !cashPaidConfirmed) {
      toast({
        title: 'يجب تأكيد استلام فرق السعر',
        description: `العميل يدفع ${fmt(diff)} ر.ي قبل إتمام العملية`,
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    try {
      const return_items = Object.entries(returnQtys)
        .filter(([, q]) => Number(q) > 0)
        .map(([sale_item_id, q]) => ({ sale_item_id, quantity: Number(q) }));
      const new_items = newCart.map((x) => ({ product_id: x.product_id, quantity: x.quantity }));
      // settlement logic: diff > 0 => cash. diff < 0 => settlement state (cash_refund | credit). diff = 0 => cash.
      const settle = diff > 0 ? 'cash' : (diff < 0 ? settlement : 'cash');
      const { data } = await api.post('/sales-exchanges', {
        sale_id: selectedSale.id,
        return_items, new_items,
        settlement: settle,
        reason: reason || 'استبدال POS',
      });
      setResultReceipt({
        kind: 'exchange',
        return_no: data.return?.return_no,
        new_invoice_no: data.new_invoice_no,
        return_value: data.return_value,
        new_total: data.new_total,
        diff: data.diff,
        settlement: data.settlement,
        message: data.message,
        old_invoice_no: selectedSale.invoice_no,
      });
      setStep(STEPS.RECEIPT);
      onCompleted?.();
    } catch (e) {
      toast({ title: 'فشل تنفيذ الاستبدال', description: formatApiError(e), variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  // === RENDER ===
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0" data-testid="pos-returns-dialog">
        {/* Luxury header */}
        <DialogHeader className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-t-lg">
          <DialogTitle className="flex items-center gap-2 text-white">
            <RotateCcw className="w-5 h-5 text-amber-400" />
            <span>مرتجع / استبدال داخل نقطة البيع</span>
          </DialogTitle>
          {/* Steps indicator */}
          <div className="flex items-center gap-1.5 mt-3 text-xs">
            {[
              { n: 1, l: 'الفاتورة' },
              { n: 2, l: 'الأصناف' },
              { n: 3, l: 'النوع' },
              ...(mode === 'exchange' ? [{ n: 4, l: 'الاستبدال' }] : []),
              { n: 5, l: 'الإيصال' },
            ].map((s, i, arr) => (
              <React.Fragment key={s.n}>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                  step >= s.n ? 'bg-amber-500 text-slate-900 font-semibold' : 'bg-slate-700 text-slate-300'
                }`}>
                  <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold">
                    {s.n}
                  </span>
                  {s.l}
                </div>
                {i < arr.length - 1 && <ArrowLeft className="w-3 h-3 text-slate-500" />}
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">

          {/* === STEP 1: Pick sale === */}
          {step === STEPS.PICK_SALE && (
            <div className="space-y-4" data-testid="step-pick-sale">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث برقم الفاتورة أو اسم العميل أو الهاتف..."
                  className="pr-10 h-11 bg-white"
                  autoFocus
                  data-testid="returns-search-sale"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sales.length === 0 && (
                  <p className="col-span-2 text-center text-slate-400 py-8">لا توجد فواتير مطابقة</p>
                )}
                {sales.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => pickSale(s)}
                    data-testid={`returns-sale-row-${s.invoice_no}`}
                    className="text-right bg-white border-2 border-slate-200 rounded-xl p-4 hover:border-amber-400 hover:shadow-lg transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-amber-700 text-base">{s.invoice_no}</span>
                      <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
                        {s.payment_method}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{s.customer_name || '— بدون عميل —'}</p>
                    <div className="flex justify-between items-end mt-2">
                      <span className="text-xs text-slate-400">
                        {new Date(s.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                      <span className="text-xl font-extrabold text-emerald-600">{fmt(s.total)} ر.ي</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* === STEP 2: Pick items === */}
          {step === STEPS.PICK_ITEMS && returnable && (
            <div className="space-y-4" data-testid="step-pick-items">
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-600">فاتورة</p>
                  <p className="font-mono font-bold text-lg text-amber-800">{returnable.invoice_no}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-slate-600">إجمالي الفاتورة</p>
                  <p className="text-2xl font-extrabold text-amber-700">{fmt(returnable.total)} ر.ي</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">حدد الكميات المُرجَعة:</Label>
                {returnable.items.map((it) => {
                  const max = it.remaining_returnable;
                  const q = Number(returnQtys[it.sale_item_id] || 0);
                  const disabled = max <= 0;
                  return (
                    <div key={it.sale_item_id}
                      data-testid={`returnable-${it.product_sku}`}
                      className={`bg-white border-2 rounded-lg p-3 ${
                        disabled ? 'opacity-50 border-slate-200' : (q > 0 ? 'border-amber-400 shadow' : 'border-slate-200')
                      }`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-bold text-slate-900">{it.product_name}</p>
                          <p className="text-xs text-slate-500">
                            بيع: {fmt(it.sold_quantity)} • سابقاً مرتجع: {fmt(it.previously_returned)} •
                            <strong className="text-emerald-700"> متاح: {fmt(max)}</strong> •
                            سعر/وحدة: {fmt(it.unit_price)} ر.ي
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" disabled={disabled || q <= 0}
                            onClick={() => updateReturnQty(it.sale_item_id, q - 1, max)}>−</Button>
                          <Input
                            type="number" min="0" max={max} step="1"
                            value={q}
                            onChange={(e) => updateReturnQty(it.sale_item_id, e.target.value, max)}
                            className="h-9 w-20 text-center font-bold"
                            disabled={disabled}
                            data-testid={`returnable-qty-${it.product_sku}`}
                          />
                          <Button size="sm" variant="outline" disabled={disabled || q >= max}
                            onClick={() => updateReturnQty(it.sale_item_id, q + 1, max)}>+</Button>
                        </div>
                      </div>
                      {q > 0 && (
                        <div className="text-left text-sm font-bold text-amber-700 mt-1">
                          قيمة الإرجاع: {fmt((it.line_total / it.sold_quantity) * q)} ر.ي
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <Label className="text-sm">سبب المرتجع (اختياري)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="منتج تالف / لا يناسب العميل ..."
                  data-testid="returns-reason-input" />
              </div>

              <div className="bg-slate-900 text-white rounded-xl p-4 flex justify-between items-center">
                <span className="text-sm">إجمالي قيمة الإرجاع المختار</span>
                <span className="text-3xl font-extrabold text-amber-300" data-testid="return-subtotal">
                  {fmt(returnSubtotal)} ر.ي
                </span>
              </div>
            </div>
          )}

          {/* === STEP 3: Choose mode === */}
          {step === STEPS.CHOOSE_MODE && (
            <div className="space-y-4" data-testid="step-choose-mode">
              <p className="text-center text-slate-600">اختر نوع العملية:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => { setMode('return'); }}
                  data-testid="choose-mode-return"
                  className={`text-right p-6 rounded-2xl border-2 transition-all hover:shadow-2xl ${
                    mode === 'return'
                      ? 'border-amber-500 bg-gradient-to-br from-amber-50 to-orange-100 shadow-xl'
                      : 'border-slate-200 bg-white hover:border-amber-300'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center mb-3">
                    <RotateCcw className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">استرجاع فقط</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    إعادة الكميات للمخزون، خصم القيمة من المبيعات اليومية والإيرادات،
                    تعديل الأرباح تلقائياً، وإصدار سند استرجاع.
                  </p>
                </button>
                <button
                  onClick={() => { setMode('exchange'); }}
                  data-testid="choose-mode-exchange"
                  className={`text-right p-6 rounded-2xl border-2 transition-all hover:shadow-2xl ${
                    mode === 'exchange'
                      ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-100 shadow-xl'
                      : 'border-slate-200 bg-white hover:border-emerald-300'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mb-3">
                    <Repeat className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">استبدال بمنتج آخر</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    إرجاع المنتج القديم + سحب الجديد من المخزون + حساب فرق السعر تلقائياً.
                    العميل يدفع الفارق إذا كان الجديد أغلى، أو يستلمه نقداً/كرصيد إذا كان أرخص.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* === STEP 4: Exchange — pick new items + settlement === */}
          {step === STEPS.EXCHANGE && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="step-exchange">
              {/* Left: pick new products */}
              <div className="lg:col-span-2 space-y-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={newSearch}
                    onChange={(e) => setNewSearch(e.target.value)}
                    placeholder="ابحث عن منتج بديل بالاسم أو SKU..."
                    className="pr-10 h-11 bg-white"
                    data-testid="exchange-product-search"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addNewProduct(p)}
                      disabled={Number(p.current_stock || 0) <= 0}
                      data-testid={`exchange-product-${p.sku}`}
                      className="text-right bg-white rounded-lg p-2.5 border hover:border-emerald-400 hover:shadow disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <p className="text-xs font-semibold text-slate-900 line-clamp-2">{p.name}</p>
                      <p className="text-[10px] text-slate-400">{p.sku}</p>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs font-bold text-emerald-600">{fmt(p.sale_price)}</span>
                        <span className="text-[10px] text-slate-500">{fmt(p.current_stock)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: new cart + settlement */}
              <div className="space-y-3">
                <div className="bg-white rounded-xl border-2 border-emerald-200 p-3">
                  <h4 className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-1">
                    <Repeat className="w-4 h-4" /> منتجات الاستبدال
                  </h4>
                  {newCart.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs py-3">لا منتجات بعد</p>
                  ) : (
                    <div className="space-y-1.5">
                      {newCart.map((x) => (
                        <div key={x.product_id} className="bg-emerald-50 rounded p-2 text-xs">
                          <p className="font-bold text-slate-800 mb-1">{x.name}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => updateNewQty(x.product_id, -1)}>−</Button>
                              <span className="font-bold w-6 text-center">{x.quantity}</span>
                              <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => updateNewQty(x.product_id, +1)}>+</Button>
                            </div>
                            <span className="font-bold text-emerald-700">{fmt(x.sale_price * x.quantity)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Settlement card */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">قيمة المرتجع</span>
                    <span className="font-bold">{fmt(returnSubtotal)} ر.ي</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">قيمة الاستبدال</span>
                    <span className="font-bold">{fmt(newCartTotal)} ر.ي</span>
                  </div>
                  <div className="border-t border-slate-600 pt-2">
                    {diff > 0 && (
                      <div className="bg-rose-500/20 border border-rose-400 rounded-lg p-2.5">
                        <div className="flex justify-between items-center">
                          <span className="text-rose-200 text-xs">العميل يدفع</span>
                          <span className="text-2xl font-extrabold text-rose-300" data-testid="exchange-diff">
                            {fmt(diff)} ر.ي
                          </span>
                        </div>
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cashPaidConfirmed}
                            onChange={(e) => setCashPaidConfirmed(e.target.checked)}
                            data-testid="exchange-cash-confirm"
                            className="w-4 h-4 accent-amber-500"
                          />
                          <span className="text-xs text-amber-200">أؤكد استلام {fmt(diff)} ر.ي نقداً من العميل</span>
                        </label>
                      </div>
                    )}
                    {diff < 0 && (
                      <div className="bg-emerald-500/20 border border-emerald-400 rounded-lg p-2.5 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-emerald-200 text-xs">للعميل</span>
                          <span className="text-2xl font-extrabold text-emerald-300" data-testid="exchange-refund">
                            {fmt(Math.abs(diff))} ر.ي
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 mb-1">طريقة التسوية:</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => setSettlement('cash_refund')}
                            data-testid="settle-cash-refund"
                            className={`p-1.5 rounded text-xs font-medium border ${
                              settlement === 'cash_refund'
                                ? 'bg-emerald-400 text-slate-900 border-emerald-300'
                                : 'border-slate-500 text-slate-200'
                            }`}>
                            <Banknote className="w-3.5 h-3.5 inline ml-1" /> نقداً للعميل
                          </button>
                          <button
                            onClick={() => setSettlement('credit')}
                            data-testid="settle-credit"
                            disabled={!selectedSale?.customer_name}
                            className={`p-1.5 rounded text-xs font-medium border disabled:opacity-30 disabled:cursor-not-allowed ${
                              settlement === 'credit'
                                ? 'bg-emerald-400 text-slate-900 border-emerald-300'
                                : 'border-slate-500 text-slate-200'
                            }`}>
                            <UserCheck className="w-3.5 h-3.5 inline ml-1" /> رصيد دائن
                          </button>
                        </div>
                        {!selectedSale?.customer_name && (
                          <p className="text-[10px] text-amber-200 leading-relaxed">
                            * فاتورة بلا عميل — متاح فقط الرد النقدي
                          </p>
                        )}
                      </div>
                    )}
                    {diff === 0 && newCartTotal > 0 && (
                      <div className="bg-blue-500/20 border border-blue-400 rounded-lg p-2.5 text-center">
                        <CheckCircle2 className="w-5 h-5 inline ml-1 text-blue-300" />
                        <span className="text-blue-100 text-sm">استبدال بدون فرق سعر</span>
                      </div>
                    )}
                    {newCartTotal === 0 && (
                      <p className="text-xs text-slate-400 text-center">اختر منتجات الاستبدال للمتابعة</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === STEP 5: Receipt === */}
          {step === STEPS.RECEIPT && resultReceipt && (
            <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl p-6 border-2 border-emerald-200" data-testid="step-receipt">
              <div className="text-center mb-4 pb-3 border-b-2 border-dashed">
                <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500 mb-1" />
                <h2 className="text-xl font-extrabold text-emerald-700">
                  {resultReceipt.kind === 'return' ? 'تم تنفيذ المرتجع' : 'تم تنفيذ الاستبدال'}
                </h2>
                <p className="text-sm text-slate-600">ميني ماركت الفنية</p>
                <p className="text-xs text-slate-500" dir="ltr">📞 779008092</p>
              </div>
              <div className="space-y-2 text-sm">
                {resultReceipt.kind === 'return' ? (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">رقم المرتجع:</span>
                      <span className="font-mono font-bold">{resultReceipt.return_no}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">الفاتورة الأصلية:</span>
                      <span className="font-mono">{resultReceipt.invoice_no}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">نوع المرتجع:</span>
                      <span className="font-bold">{resultReceipt.return_type === 'credit' ? 'خصم من حساب العميل' : 'نقدي'}</span></div>
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 mt-3 text-center">
                      <p className="text-xs text-slate-600">قيمة المرتجع</p>
                      <p className="text-3xl font-extrabold text-amber-700" data-testid="receipt-total">{fmt(resultReceipt.total)} ر.ي</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">رقم المرتجع:</span>
                      <span className="font-mono font-bold">{resultReceipt.return_no}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">الفاتورة الأصلية:</span>
                      <span className="font-mono">{resultReceipt.old_invoice_no}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">فاتورة الاستبدال:</span>
                      <span className="font-mono font-bold text-emerald-700">{resultReceipt.new_invoice_no}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">قيمة المرتجع:</span>
                      <span>{fmt(resultReceipt.return_value)} ر.ي</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">قيمة المنتجات الجديدة:</span>
                      <span>{fmt(resultReceipt.new_total)} ر.ي</span></div>
                    <div className={`rounded-lg p-3 mt-3 text-center border-2 ${
                      resultReceipt.diff > 0 ? 'bg-rose-50 border-rose-300' :
                      resultReceipt.diff < 0 ? 'bg-emerald-50 border-emerald-300' :
                      'bg-blue-50 border-blue-300'
                    }`}>
                      <p className="text-xs text-slate-600">{resultReceipt.message}</p>
                      {resultReceipt.diff !== 0 && (
                        <p className={`text-3xl font-extrabold ${
                          resultReceipt.diff > 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}>{fmt(Math.abs(resultReceipt.diff))} ر.ي</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <p className="text-center text-xs text-slate-400 mt-4">
                {new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
          )}
        </div>

        {/* === Footer / actions === */}
        <DialogFooter className="px-6 py-3 border-t bg-white">
          {step === STEPS.PICK_SALE && (
            <Button variant="outline" onClick={onClose}>إغلاق</Button>
          )}
          {step === STEPS.PICK_ITEMS && (
            <>
              <Button variant="outline" onClick={() => setStep(STEPS.PICK_SALE)}>
                <ArrowRight className="w-4 h-4 ml-1" /> رجوع
              </Button>
              <Button
                onClick={() => setStep(STEPS.CHOOSE_MODE)}
                disabled={!hasReturnSelection}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="returns-continue-btn"
              >
                متابعة <ArrowLeft className="w-4 h-4 mr-1" />
              </Button>
            </>
          )}
          {step === STEPS.CHOOSE_MODE && (
            <>
              <Button variant="outline" onClick={() => setStep(STEPS.PICK_ITEMS)}>
                <ArrowRight className="w-4 h-4 ml-1" /> رجوع
              </Button>
              <Button
                onClick={() => {
                  if (mode === 'return') submitReturnOnly();
                  else if (mode === 'exchange') setStep(STEPS.EXCHANGE);
                }}
                disabled={!mode || submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="returns-next-mode-btn"
              >
                {mode === 'return' ? (submitting ? 'جارٍ التنفيذ...' : 'تنفيذ المرتجع') : 'متابعة'}
                <ArrowLeft className="w-4 h-4 mr-1" />
              </Button>
            </>
          )}
          {step === STEPS.EXCHANGE && (
            <>
              <Button variant="outline" onClick={() => setStep(STEPS.CHOOSE_MODE)}>
                <ArrowRight className="w-4 h-4 ml-1" /> رجوع
              </Button>
              <Button
                onClick={submitExchange}
                disabled={
                  submitting ||
                  newCart.length === 0 ||
                  (diff > 0 && !cashPaidConfirmed)
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="returns-submit-exchange-btn"
              >
                {submitting ? 'جارٍ التنفيذ...' : (
                  diff > 0 ? `استلام ${fmt(diff)} ر.ي وإتمام` :
                  diff < 0 ? `إتمام ورد ${fmt(Math.abs(diff))} ر.ي` :
                  'إتمام الاستبدال'
                )}
              </Button>
            </>
          )}
          {step === STEPS.RECEIPT && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  if (!resultReceipt) return;
                  if (resultReceipt.kind === 'return') {
                    exportVoucherPDF({
                      title: 'سند مرتجع مبيعات',
                      voucherNo: resultReceipt.return_no,
                      dateISO: new Date().toISOString(),
                      originalInvoiceLabel: 'الفاتورة الأصلية',
                      originalInvoiceNo: resultReceipt.invoice_no,
                      subjectLabel: 'العميل',
                      subjectName: selectedSale?.customer_name || '— عميل عادي —',
                      paymentMethod: resultReceipt.return_type === 'credit' ? 'خصم من حساب العميل' : 'نقدي',
                      items: resultReceipt.items || [],
                      total: resultReceipt.total,
                      paid: resultReceipt.total,    // refund is "paid" to customer
                      remaining: 0,
                      reason: reason || null,
                      accent: '#f59e0b',
                    }).catch((err) => toast({ title: 'فشل إنشاء PDF', description: err.message, variant: 'destructive' }));
                  } else {
                    exportVoucherPDF({
                      title: 'سند استبدال',
                      voucherNo: resultReceipt.new_invoice_no,
                      dateISO: new Date().toISOString(),
                      originalInvoiceLabel: 'الفاتورة الأصلية',
                      originalInvoiceNo: resultReceipt.old_invoice_no,
                      subjectLabel: 'العميل',
                      subjectName: selectedSale?.customer_name || '— عميل عادي —',
                      total: resultReceipt.new_total,
                      paid: resultReceipt.diff > 0 ? resultReceipt.diff : 0,
                      remaining: 0,
                      extraRows: [
                        { label: 'رقم المرتجع', value: resultReceipt.return_no },
                        { label: 'قيمة المرتجع', value: `${new Intl.NumberFormat('ar-EG').format(resultReceipt.return_value)} ر.ي` },
                        { label: 'قيمة المنتجات الجديدة', value: `${new Intl.NumberFormat('ar-EG').format(resultReceipt.new_total)} ر.ي` },
                        {
                          label: resultReceipt.diff > 0 ? 'دفعه العميل' : resultReceipt.diff < 0 ? 'مسترد للعميل' : 'الفرق',
                          value: `${new Intl.NumberFormat('ar-EG').format(Math.abs(resultReceipt.diff))} ر.ي`,
                          highlight: resultReceipt.diff > 0 ? 'red' : resultReceipt.diff < 0 ? 'green' : null,
                        },
                      ],
                      skipValidation: true,
                      accent: '#10b981',
                    }).catch((err) => toast({ title: 'فشل إنشاء PDF', description: err.message, variant: 'destructive' }));
                  }
                }}
                data-testid="returns-download-pdf-btn"
              >
                <Receipt className="w-4 h-4 ml-1" /> تحميل PDF
              </Button>
              <Button onClick={onClose} className="bg-slate-900 hover:bg-slate-800 text-white" data-testid="returns-finish-btn">
                إنهاء
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PosReturnsDialog;
