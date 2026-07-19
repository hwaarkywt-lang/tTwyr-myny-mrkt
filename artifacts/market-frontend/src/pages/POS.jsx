import React, { useEffect, useRef, useState } from 'react';
import {
  Search, Plus, Minus, X, ShoppingCart, Banknote,
  CreditCard, Wallet, Building2, Smartphone, ArrowLeftRight, Clock,
  UserPlus, RotateCcw, Calendar, User, Star, Receipt, Trash2,
  CheckCircle2, AlertCircle, PauseCircle, PlayCircle,
} from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PosReturnsDialog from '../components/pos/PosReturnsDialog';
import { STORE } from '../config/store';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0);

const PAYMENT_METHODS = [
  { v: 'cash',          l: 'نقداً',   icon: Banknote,       color: 'from-emerald-500 to-emerald-600', ring: 'ring-emerald-400' },
  { v: 'jaib',          l: 'جيب',     icon: Smartphone,     color: 'from-purple-500 to-purple-600',   ring: 'ring-purple-400' },
  { v: 'fluusak',       l: 'فلوسك',  icon: Wallet,         color: 'from-pink-500 to-pink-600',       ring: 'ring-pink-400' },
  { v: 'hasib',         l: 'حاسب',   icon: CreditCard,     color: 'from-blue-500 to-blue-600',       ring: 'ring-blue-400' },
  { v: 'banki',         l: 'بنكي',   icon: Building2,      color: 'from-cyan-500 to-cyan-600',       ring: 'ring-cyan-400' },
  { v: 'bank_transfer', l: 'تحويل',  icon: ArrowLeftRight, color: 'from-indigo-500 to-indigo-600',   ring: 'ring-indigo-400' },
  { v: 'credit',        l: 'آجل',    icon: Clock,          color: 'from-rose-500 to-rose-600',       ring: 'ring-rose-400' },
];

const HELD_KEY = 'pos_held_invoices';

function loadHeld() {
  try { return JSON.parse(localStorage.getItem(HELD_KEY) || '[]'); }
  catch { return []; }
}
function saveHeld(list) {
  try { localStorage.setItem(HELD_KEY, JSON.stringify(list)); } catch {}
}

export default function POS() {
  const { user } = useAuth();

  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [searchResults, setSearchResults]       = useState([]);
  const [cart, setCart]                         = useState([]);
  const [query, setQuery]                       = useState('');
  const [barcode, setBarcode]                   = useState('');
  const [paymentMethod, setPaymentMethod]       = useState('cash');
  const [creditCustomer, setCreditCustomer]     = useState(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customers, setCustomers]               = useState([]);
  const [customerSearch, setCustomerSearch]     = useState('');
  const [loading, setLoading]                   = useState(false);
  const [lastInvoice, setLastInvoice]           = useState(null);
  const [returnsOpen, setReturnsOpen]           = useState(false);
  const [now, setNow]                           = useState(new Date());
  const [heldInvoices, setHeldInvoices]         = useState(loadHeld);
  const [showHeldDialog, setShowHeldDialog]     = useState(false);
  const barcodeRef = useRef(null);
  const searchRef  = useRef(null);

  // ساعة مباشرة
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // تحميل المنتجات المميزة
  useEffect(() => {
    api.get('/pos/products', { params: { featured_only: true, limit: 200 } })
      .then((r) => setFeaturedProducts(r.data))
      .catch(() => {});
    barcodeRef.current?.focus();
  }, []);

  // بحث ذكي بتأخير
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      api.get('/pos/products', { params: { q: query.trim(), limit: 500 } })
        .then((r) => setSearchResults(r.data))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // تحميل العملاء عند فتح نافذة الاختيار
  useEffect(() => {
    if (showCustomerPicker) {
      api.get('/customers', { params: { q: customerSearch || undefined } })
        .then((r) => setCustomers(r.data));
    }
  }, [showCustomerPicker, customerSearch]);

  const displayProducts = query.trim() ? searchResults : featuredProducts;

  // إضافة منتج للسلة
  const addToCart = (p) => {
    const stock = Number(p.current_stock ?? 0);

    // نفد المخزون كلياً
    if (stock <= 0) {
      toast({
        title: '⛔ نفد المخزون',
        description: `"${p.name}" — لا توجد كمية متاحة في المخزون حالياً`,
        variant: 'destructive',
      });
      return;
    }

    // التحقق من عدم تجاوز الكمية المتاحة
    const existingQty = cart.find((x) => x.product_id === p.id)?.quantity || 0;
    if (existingQty + 1 > stock) {
      toast({
        title: '⚠️ تجاوز الكمية المتاحة',
        description: `الكمية المتاحة من "${p.name}" هي ${fmt(stock)} فقط`,
        variant: 'destructive',
      });
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.product_id === p.id);
      if (idx >= 0) {
        const c = [...prev];
        c[idx] = { ...c[idx], quantity: c[idx].quantity + 1 };
        return c;
      }
      return [...prev, {
        product_id: p.id, name: p.name, sku: p.sku, unit: p.unit,
        quantity: 1, unit_price: Number(p.sale_price),
        stock: stock,
      }];
    });
  };

  // قراءة الباركود
  const onBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    try {
      const { data } = await api.get(`/products/by-barcode/${encodeURIComponent(barcode.trim())}`);
      addToCart(data);
      setBarcode('');
      barcodeRef.current?.focus();
    } catch (err) {
      toast({ title: 'باركود غير موجود', description: formatApiError(err), variant: 'destructive' });
      setBarcode('');
    }
  };

  const updateQty = (idx, delta) => {
    setCart((prev) => {
      const c = [...prev];
      const q = c[idx].quantity + delta;
      if (q <= 0) return c.filter((_, i) => i !== idx);
      c[idx] = { ...c[idx], quantity: q };
      return c;
    });
  };

  const setQtyDirect = (idx, val) => {
    const q = Number(val);
    if (isNaN(q) || q < 0) return;
    if (q === 0) {
      setCart((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setCart((prev) => {
        const c = [...prev];
        c[idx] = { ...c[idx], quantity: q };
        return c;
      });
    }
  };

  const removeItem = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));
  const clearCart  = () => { if (window.confirm('هل تريد مسح السلة كاملاً؟')) setCart([]); };

  // ── تعليق الفاتورة ──────────────────────────────────────────────
  const holdInvoice = () => {
    if (cart.length === 0) { toast({ title: 'السلة فارغة — لا يوجد شيء لتعليقه', variant: 'destructive' }); return; }
    const held = {
      id: Date.now(),
      cart: [...cart],
      paymentMethod,
      creditCustomer,
      savedAt: new Date().toISOString(),
      total: cart.reduce((s, it) => s + it.quantity * it.unit_price, 0),
    };
    const updated = [...heldInvoices, held];
    setHeldInvoices(updated);
    saveHeld(updated);
    setCart([]);
    setCreditCustomer(null);
    setPaymentMethod('cash');
    toast({ title: `✅ تم تعليق الفاتورة (${held.cart.length} صنف)`, description: 'يمكنك استئنافها من زر الفواتير المعلقة' });
  };

  const resumeHeld = (held) => {
    if (cart.length > 0 && !window.confirm('السلة الحالية ستُستبدل بالفاتورة المعلقة. متابعة؟')) return;
    setCart(held.cart);
    setPaymentMethod(held.paymentMethod || 'cash');
    setCreditCustomer(held.creditCustomer || null);
    const updated = heldInvoices.filter((h) => h.id !== held.id);
    setHeldInvoices(updated);
    saveHeld(updated);
    setShowHeldDialog(false);
    toast({ title: 'تم استئناف الفاتورة المعلقة' });
  };

  const discardHeld = (id) => {
    if (!window.confirm('حذف هذه الفاتورة المعلقة؟')) return;
    const updated = heldInvoices.filter((h) => h.id !== id);
    setHeldInvoices(updated);
    saveHeld(updated);
  };

  const total = cart.reduce((s, it) => s + it.quantity * it.unit_price, 0);

  const onPaymentSelect = (method) => {
    setPaymentMethod(method);
    if (method === 'credit') {
      if (cart.length === 0) {
        toast({ title: 'أضف منتجاً أولاً قبل اختيار آجل', variant: 'destructive' });
        return;
      }
      setShowCustomerPicker(true);
    } else {
      setCreditCustomer(null);
    }
  };

  const selectCustomer = (c) => {
    setCreditCustomer(c);
    setShowCustomerPicker(false);
  };

  const completeSale = async () => {
    if (cart.length === 0) {
      toast({ title: 'السلة فارغة', variant: 'destructive' }); return;
    }
    if (paymentMethod === 'credit' && !creditCustomer) {
      toast({ title: 'يجب اختيار عميل للبيع الآجل', variant: 'destructive' }); return;
    }
    setLoading(true);
    try {
      const payload = {
        customer_id: paymentMethod === 'credit' ? creditCustomer.id : null,
        items: cart.map((c) => ({
          product_id: c.product_id, quantity: c.quantity, unit_price: c.unit_price,
        })),
        payment_method: paymentMethod,
      };
      const { data } = await api.post('/sales', payload);
      setLastInvoice(data);
      toast({
        title: '✅ تم إتمام البيع',
        description: `فاتورة ${data.invoice_no} — ${fmt(data.total)} ر.ي`,
      });
      setCart([]);
      setCreditCustomer(null);
      setPaymentMethod('cash');
      api.get('/pos/products', { params: { featured_only: true, limit: 200 } })
        .then((r) => setFeaturedProducts(r.data)).catch(() => {});
      barcodeRef.current?.focus();
    } catch (e) {
      toast({ title: 'فشل البيع', description: formatApiError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const activePayment = PAYMENT_METHODS.find((p) => p.v === paymentMethod);

  return (
    <div
      className="flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
      style={{ height: 'calc(100vh - 60px)' }}
      dir="rtl"
      data-testid="pos-page"
    >
      {/* ═══════════ شريط علوي احترافي ═══════════ */}
      <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2 border-b border-slate-700/60">

        {/* الشعار + اسم الفرع */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-900/40 flex-shrink-0">
            <ShoppingCart className="w-5 h-5 text-slate-900" />
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-extrabold text-white tracking-wide">{STORE.name}</p>
            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
              <Calendar className="w-2.5 h-2.5" />
              {now.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>
        </div>

        {/* رقم آخر فاتورة */}
        {lastInvoice && (
          <div className="hidden md:flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-2.5 py-1 text-xs text-emerald-300 flex-shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-mono font-bold">{lastInvoice.invoice_no}</span>
          </div>
        )}

        {/* قارئ الباركود — وسط */}
        <form onSubmit={onBarcodeSubmit} className="flex-1 flex gap-2 max-w-sm mx-auto">
          <Input
            ref={barcodeRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="🔍 امسح الباركود..."
            className="h-9 text-sm bg-slate-800/80 border-slate-600/80 text-white placeholder:text-slate-400 focus:bg-slate-800 focus:border-amber-500/60"
            autoComplete="off"
            data-testid="pos-barcode-input"
          />
          <Button type="submit" className="h-9 bg-amber-500 hover:bg-amber-400 text-slate-900 px-3 flex-shrink-0 font-bold text-xs shadow-lg shadow-amber-900/30">
            إضافة
          </Button>
        </form>

        {/* أزرار الإجراءات + معلومات المستخدم */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* زر تعليق الفاتورة */}
          <Button
            onClick={holdInvoice}
            disabled={cart.length === 0}
            title="تعليق الفاتورة الحالية لاستئنافها لاحقاً"
            className="h-9 bg-slate-700 hover:bg-yellow-500 hover:text-slate-900 text-white border border-slate-600 transition-all text-xs px-3 font-semibold disabled:opacity-40"
          >
            <PauseCircle className="w-3.5 h-3.5 ml-1" /> تعليق
          </Button>
          {/* زر الفواتير المعلقة */}
          <Button
            onClick={() => setShowHeldDialog(true)}
            title="الفواتير المعلقة"
            className="relative h-9 bg-slate-700 hover:bg-yellow-400 hover:text-slate-900 text-white border border-slate-600 transition-all text-xs px-3 font-semibold"
          >
            <PlayCircle className="w-3.5 h-3.5 ml-1" /> معلقة
            {heldInvoices.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-yellow-400 text-slate-900 rounded-full text-[9px] font-extrabold flex items-center justify-center">
                {heldInvoices.length}
              </span>
            )}
          </Button>
          <Button
            onClick={() => setReturnsOpen(true)}
            data-testid="pos-open-returns-btn"
            className="h-9 bg-slate-700 hover:bg-amber-500 hover:text-slate-900 text-white border border-slate-600 transition-all text-xs px-3 font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5 ml-1" /> مرتجع
          </Button>
          <div className="hidden lg:flex items-center gap-2 bg-slate-800/60 rounded-xl px-3 py-1.5 border border-slate-700/60">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xs leading-tight">
              <p className="font-semibold text-white">{user?.full_name || user?.email}</p>
              <p className="text-slate-400">
                {user?.role === 'cashier' ? 'كاشير' : user?.role === 'manager' ? 'مشرف' : 'مدير'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ المحتوى الرئيسي: 3 أعمدة ═══════════ */}
      <div className="flex-1 flex gap-2.5 p-2.5 min-h-0">

        {/* ──────────── 1. لوحة الفاتورة (يمين — أول في RTL) ──────────── */}
        <div
          className="w-[370px] xl:w-[400px] flex-shrink-0 flex flex-col bg-slate-900 rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden"
        >
          {/* رأس الفاتورة */}
          <div className="px-4 py-3 bg-gradient-to-l from-slate-800 to-slate-900 border-b border-slate-700/50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-400" />
              <h2 className="font-bold text-sm text-white">الفاتورة الحالية</h2>
              {lastInvoice && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {lastInvoice.invoice_no}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 border text-xs">
                  {cart.length} صنف
                </Badge>
              )}
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-slate-500 hover:text-rose-400 transition-colors"
                  title="مسح السلة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* بنود السلة */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 min-h-0">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 py-12">
                <ShoppingCart className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium text-slate-500">السلة فارغة</p>
                <p className="text-xs text-slate-600 mt-1">انقر منتجاً أو امسح الباركود</p>
              </div>
            ) : cart.map((it, i) => (
              <div
                key={it.product_id || `cart-${i}`}
                className="bg-slate-800/60 hover:bg-slate-800 rounded-xl p-2.5 border border-slate-700/40 transition-colors group"
                data-testid={`cart-item-${i}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <p className="font-semibold text-sm flex-1 leading-snug text-white ml-1 line-clamp-2">{it.name}</p>
                  <button
                    onClick={() => removeItem(i)}
                    className="text-slate-600 hover:text-rose-400 flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateQty(i, -1)}
                      className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-rose-500/80 text-slate-300 hover:text-white flex items-center justify-center transition-all"
                    >
                      <Minus className="w-2.5 h-2.5" />
                    </button>
                    <input
                      type="number"
                      value={it.quantity}
                      onChange={(e) => setQtyDirect(i, e.target.value)}
                      className="w-10 h-6 text-center text-sm font-bold bg-slate-700/60 text-white rounded-lg border border-slate-600/60 focus:outline-none focus:border-amber-500"
                      min="0"
                    />
                    <button
                      onClick={() => updateQty(i, 1)}
                      className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-emerald-500/80 text-slate-300 hover:text-white flex items-center justify-center transition-all"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-amber-400 text-sm">{fmt(it.quantity * it.unit_price)}</p>
                    <p className="text-[10px] text-slate-500">{fmt(it.unit_price)} × {it.quantity}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* أسفل الفاتورة: الإجمالي + الدفع + الإتمام */}
          <div className="flex-shrink-0 border-t border-slate-700/60 bg-slate-950/80 rounded-b-2xl p-3 space-y-3">

            {/* الإجمالي */}
            <div className="bg-gradient-to-l from-amber-500/10 to-transparent border border-amber-500/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <span className="text-slate-400 text-sm font-medium">الإجمالي</span>
              <span className="text-2xl font-extrabold text-amber-400 tabular-nums" data-testid="pos-total">
                {fmt(total)} <span className="text-sm text-amber-600">ر.ي</span>
              </span>
            </div>

            {/* طرق الدفع */}
            <div>
              <p className="text-[10px] text-slate-500 mb-1.5 font-semibold tracking-wide">طريقة الدفع</p>
              <div className="grid grid-cols-4 gap-1 mb-1">
                {PAYMENT_METHODS.slice(0, 4).map((p) => {
                  const Icon = p.icon;
                  const active = paymentMethod === p.v;
                  return (
                    <button
                      key={p.v}
                      onClick={() => onPaymentSelect(p.v)}
                      data-testid={`pos-payment-${p.v}`}
                      className={`py-1.5 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5 transition-all ${
                        active
                          ? `bg-gradient-to-br ${p.color} text-white shadow-lg`
                          : 'bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-white hover:border-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {p.l}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {PAYMENT_METHODS.slice(4).map((p) => {
                  const Icon = p.icon;
                  const active = paymentMethod === p.v;
                  return (
                    <button
                      key={p.v}
                      onClick={() => onPaymentSelect(p.v)}
                      data-testid={`pos-payment-${p.v}`}
                      className={`py-1.5 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5 transition-all ${
                        active
                          ? `bg-gradient-to-br ${p.color} text-white shadow-lg`
                          : 'bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-white hover:border-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {p.l}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* معلومات العميل الآجل */}
            {paymentMethod === 'credit' && (
              <div className="bg-rose-900/30 border border-rose-500/40 rounded-xl p-2.5" data-testid="pos-credit-info">
                {creditCustomer ? (
                  <>
                    <div className="flex justify-between mb-1.5">
                      <p className="text-sm font-bold text-rose-200">{creditCustomer.full_name}</p>
                      <button onClick={() => setShowCustomerPicker(true)} className="text-xs text-rose-400 underline">تغيير</button>
                    </div>
                    <div className="text-xs space-y-1 text-slate-300">
                      <div className="flex justify-between">
                        <span>الرصيد السابق</span>
                        <span className="font-semibold text-rose-300">{fmt(creditCustomer.balance)} ر.ي</span>
                      </div>
                      <div className="flex justify-between text-amber-400">
                        <span>+ هذه الفاتورة</span>
                        <span className="font-semibold">{fmt(total)} ر.ي</span>
                      </div>
                      <div className="flex justify-between font-bold border-t border-rose-500/30 pt-1 text-rose-200">
                        <span>الرصيد الجديد</span>
                        <span>{fmt(Number(creditCustomer.balance) + total)} ر.ي</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => setShowCustomerPicker(true)}
                    className="w-full text-sm text-rose-300 font-medium flex items-center gap-1.5 justify-center py-1.5 hover:text-rose-200"
                  >
                    <UserPlus className="w-4 h-4" /> اختر عميلاً للبيع الآجل
                  </button>
                )}
              </div>
            )}

            {/* زر إتمام البيع */}
            <button
              onClick={completeSale}
              disabled={loading || cart.length === 0 || (paymentMethod === 'credit' && !creditCustomer)}
              data-testid="pos-complete-sale-btn"
              className={`w-full h-12 rounded-xl font-extrabold text-sm transition-all shadow-xl disabled:opacity-40 disabled:cursor-not-allowed ${
                cart.length > 0 && !(paymentMethod === 'credit' && !creditCustomer)
                  ? `bg-gradient-to-l ${activePayment?.color || 'from-emerald-500 to-emerald-600'} text-white shadow-emerald-900/40 hover:scale-[1.01] active:scale-[0.99]`
                  : 'bg-slate-700 text-slate-500'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  جارٍ الحفظ...
                </span>
              ) : cart.length === 0 ? (
                'إتمام البيع'
              ) : (
                <span className="flex items-center gap-2 justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                  إتمام البيع — {fmt(total)} ر.ي
                </span>
              )}
            </button>

            {lastInvoice && (
              <div className="text-center text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-1.5" data-testid="pos-last-invoice">
                ✓ آخر فاتورة: <strong className="font-mono">{lastInvoice.invoice_no}</strong>
              </div>
            )}
          </div>
        </div>

        {/* ──────────── 2. شبكة المنتجات (وسط) ──────────── */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {/* البحث */}
          <div className="relative flex-shrink-0">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو SKU..."
              className="pr-10 h-10 bg-slate-800/80 border-slate-700/60 text-white placeholder:text-slate-500 focus:border-amber-500/60"
              data-testid="pos-search-input"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* تسمية */}
          <div className="flex items-center justify-between px-1 flex-shrink-0">
            <h3 className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {query.trim()
                ? `نتائج البحث (${displayProducts.length})`
                : `المنتجات المميزة (${displayProducts.length})`}
            </h3>
            {!query.trim() && (
              <span className="text-[10px] text-slate-600">ابحث بالأعلى أو امسح الباركود</span>
            )}
          </div>

          {/* شبكة المنتجات */}
          <div
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 overflow-y-auto flex-1"
            style={{ minHeight: 0 }}
          >
            {displayProducts.map((p) => {
              const outOfStock = Number(p.current_stock) <= 0;
              const lowStock   = !outOfStock && Number(p.current_stock) <= 3;
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  data-testid={`pos-product-${p.sku}`}
                  className={`relative rounded-2xl p-3 border active:scale-95 transition-all text-right flex flex-col justify-between h-[96px] shadow-sm group
                    ${outOfStock
                      ? 'bg-slate-800/30 border-rose-900/30 opacity-60'
                      : 'bg-slate-800/70 hover:bg-slate-700/90 border-slate-700/40 hover:border-amber-500/50 hover:shadow-amber-900/20 hover:shadow-lg'
                    }`}
                >
                  {/* شارة نفاد المخزون */}
                  {outOfStock && (
                    <span className="absolute top-1.5 left-1.5 text-[9px] bg-rose-700 text-white px-1.5 py-0.5 rounded font-bold leading-none">
                      نفد
                    </span>
                  )}
                  {/* شارة مخزون منخفض */}
                  {lowStock && (
                    <span className="absolute top-1.5 left-1.5 text-[9px] bg-amber-600 text-white px-1.5 py-0.5 rounded font-bold leading-none">
                      قليل
                    </span>
                  )}
                  <p className={`font-semibold text-xs line-clamp-2 leading-snug ${outOfStock ? 'text-slate-500' : 'text-slate-100 group-hover:text-white'}`}>
                    {p.name}
                  </p>
                  <div className="flex justify-between items-center mt-1">
                    <span className={`font-extrabold text-sm ${outOfStock ? 'text-slate-600' : 'text-amber-400'}`}>
                      {fmt(p.sale_price)}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                      outOfStock ? 'bg-rose-900/40 text-rose-400'
                      : lowStock  ? 'bg-amber-900/40 text-amber-400'
                      : 'text-slate-500 bg-slate-700/60'
                    }`}>
                      {fmt(p.current_stock)}
                    </span>
                  </div>
                </button>
              );
            })}
            {displayProducts.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center text-slate-600 py-16 bg-slate-800/20 rounded-2xl border-2 border-dashed border-slate-700/40">
                {query.trim() ? (
                  <>
                    <AlertCircle className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm text-slate-500">لا توجد منتجات تطابق "{query}"</p>
                  </>
                ) : (
                  <>
                    <Star className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm font-medium text-slate-500">لا توجد منتجات مميزة</p>
                    <p className="text-xs text-slate-600 mt-1">ابحث أو امسح الباركود لإضافة منتج</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ──────────── 3. الشريط الجانبي المميز (يسار) ──────────── */}
        {featuredProducts.length > 0 && (
          <div
            className="w-40 xl:w-48 flex-shrink-0 flex flex-col gap-2"
            style={{ maxHeight: '100%' }}
          >
            <div className="flex items-center gap-1.5 px-1 flex-shrink-0">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <h3 className="text-xs font-bold text-slate-400">الأكثر مبيعاً</h3>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1.5">
              {featuredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="w-full bg-gradient-to-br from-amber-900/30 to-orange-900/20 hover:from-amber-800/50 hover:to-orange-800/30 border border-amber-700/30 hover:border-amber-500/60 rounded-xl p-2.5 text-right transition-all shadow-sm active:scale-95 group"
                >
                  <p className="font-bold text-xs text-slate-100 group-hover:text-white line-clamp-2 leading-snug mb-1.5">{p.name}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-extrabold text-amber-400">{fmt(p.sale_price)} ر.ي</span>
                    <span className="text-[9px] text-slate-500">{fmt(p.current_stock)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ النوافذ المنبثقة ═══════════ */}

      {/* نافذة المرتجعات */}
      <PosReturnsDialog
        open={returnsOpen}
        onClose={() => setReturnsOpen(false)}
        onCompleted={() => {
          api.get('/pos/products', { params: { featured_only: true, limit: 200 } })
            .then((r) => setFeaturedProducts(r.data)).catch(() => {});
        }}
      />

      {/* ═══════════ نافذة الفواتير المعلقة ═══════════ */}
      <Dialog open={showHeldDialog} onOpenChange={setShowHeldDialog}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="w-5 h-5 text-yellow-500" />
              الفواتير المعلقة ({heldInvoices.length})
            </DialogTitle>
          </DialogHeader>
          {heldInvoices.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <PauseCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>لا توجد فواتير معلقة</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {heldInvoices.map((held) => (
                <div key={held.id}
                  className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3 hover:border-yellow-400 transition-all"
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">
                        {held.cart.length} صنف
                        {held.creditCustomer ? ` — ${held.creditCustomer.full_name}` : ''}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(held.savedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="font-extrabold text-amber-600 text-lg">{fmt(held.total)} ر.ي</p>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mb-2 line-clamp-1">
                    {held.cart.map((i) => i.name).join(' · ')}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => resumeHeld(held)}
                      className="flex-1 h-8 bg-yellow-400 hover:bg-yellow-300 text-slate-900 text-xs font-bold"
                    >
                      <PlayCircle className="w-3.5 h-3.5 ml-1" /> استئناف
                    </Button>
                    <Button
                      onClick={() => discardHeld(held.id)}
                      variant="outline"
                      className="h-8 border-rose-300 text-rose-600 hover:bg-rose-50 text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* نافذة اختيار العميل */}
      <Dialog open={showCustomerPicker} onOpenChange={setShowCustomerPicker}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-rose-500" /> اختر العميل للبيع الآجل
            </DialogTitle>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              autoFocus
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف..."
              className="pr-10"
              data-testid="pos-customer-search-input"
            />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {customers.length === 0 ? (
              <p className="text-center text-slate-400 py-6">لا يوجد عملاء</p>
            ) : customers.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCustomer(c)}
                data-testid={`pos-customer-pick-${c.id}`}
                className="w-full text-right p-3 rounded-xl border border-slate-200 hover:bg-rose-50 hover:border-rose-300 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-slate-900">{c.full_name}</p>
                    <p className="text-xs text-slate-500">{c.phone || '—'}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-slate-500">الرصيد</p>
                    <p className={`font-bold text-sm ${Number(c.balance) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {fmt(c.balance)} ر.ي
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
