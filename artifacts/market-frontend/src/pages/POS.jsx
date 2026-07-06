import React, { useEffect, useRef, useState } from 'react';
import {
  Search, Plus, Minus, X, ShoppingCart, Banknote,
  CreditCard, Wallet, Building2, Smartphone, ArrowLeftRight, Clock,
  UserPlus, RotateCcw, Calendar, User, Star,
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
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
  { v: 'cash',          l: 'نقداً',       icon: Banknote,       color: 'from-emerald-500 to-emerald-600' },
  { v: 'jaib',          l: 'جيب',         icon: Smartphone,     color: 'from-purple-500 to-purple-600' },
  { v: 'fluusak',       l: 'فلوسك',       icon: Wallet,         color: 'from-pink-500 to-pink-600' },
  { v: 'hasib',         l: 'حاسب',        icon: CreditCard,     color: 'from-blue-500 to-blue-600' },
  { v: 'banki',         l: 'بنكي',        icon: Building2,      color: 'from-cyan-500 to-cyan-600' },
  { v: 'bank_transfer', l: 'تحويل',       icon: ArrowLeftRight, color: 'from-indigo-500 to-indigo-600' },
  { v: 'credit',        l: 'آجل',         icon: Clock,          color: 'from-rose-500 to-rose-600' },
];

const POS = () => {
  const { user } = useAuth();

  // Featured products — always shown in sidebar
  const [featuredProducts, setFeaturedProducts] = useState([]);
  // Search results — shown when query is non-empty
  const [searchResults, setSearchResults] = useState([]);

  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [creditCustomer, setCreditCustomer] = useState(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const barcodeRef = useRef(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Load featured products once
  useEffect(() => {
    api.get('/pos/products', { params: { featured_only: true, limit: 200 } })
      .then((r) => setFeaturedProducts(r.data))
      .catch(() => {});
    barcodeRef.current?.focus();
  }, []);

  // Search on query change (debounced)
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.get('/pos/products', { params: { q: query.trim(), limit: 500 } })
        .then((r) => setSearchResults(r.data))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Load customers when picker opens
  useEffect(() => {
    if (showCustomerPicker) {
      api.get('/customers', { params: { q: customerSearch || undefined } })
        .then((r) => setCustomers(r.data));
    }
  }, [showCustomerPicker, customerSearch]);

  // Products shown in main grid
  const displayProducts = query.trim() ? searchResults : featuredProducts;

  const addToCart = (p) => {
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
      }];
    });
  };

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
  const removeItem = (idx) => setCart((prev) => prev.filter((_, i) => i !== idx));

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
      toast({ title: 'السلة فارغة', variant: 'destructive' });
      return;
    }
    if (paymentMethod === 'credit' && !creditCustomer) {
      toast({ title: 'يجب اختيار عميل للبيع الآجل', variant: 'destructive' });
      return;
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
      // Refresh featured products
      api.get('/pos/products', { params: { featured_only: true, limit: 200 } })
        .then((r) => setFeaturedProducts(r.data)).catch(() => {});
      barcodeRef.current?.focus();
    } catch (e) {
      toast({ title: 'فشل البيع', description: formatApiError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-2 p-3 bg-gradient-to-br from-slate-100 via-slate-50 to-amber-50/60" dir="rtl" data-testid="pos-page">

      {/* ══ TOP BAR ══ */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl shadow-xl px-4 py-2.5 flex items-center gap-3 text-white flex-shrink-0">
        {/* Store brand */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
            <ShoppingCart className="w-5 h-5 text-slate-900" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-extrabold leading-tight">{STORE.name}</p>
            <p className="text-[10px] text-slate-300 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {now.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>
        </div>

        {/* Last invoice badge */}
        {lastInvoice && (
          <div className="hidden md:flex bg-emerald-500/20 border border-emerald-400/60 rounded-lg px-2.5 py-1 text-xs text-emerald-300 flex-shrink-0 items-center gap-1">
            ✓ <span className="font-mono font-bold">{lastInvoice.invoice_no}</span>
          </div>
        )}

        {/* ── Barcode input — center flex ── */}
        <form onSubmit={onBarcodeSubmit} className="flex-1 flex gap-2 max-w-md mx-auto">
          <Input
            ref={barcodeRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="🔍 امسح الباركود ثم Enter..."
            className="h-9 text-sm bg-slate-700/80 border-slate-600 text-white placeholder:text-slate-400 focus:bg-slate-700"
            autoComplete="off"
            data-testid="pos-barcode-input"
          />
          <Button type="submit" className="h-9 bg-amber-500 hover:bg-amber-600 text-white px-3 flex-shrink-0 text-sm">
            إضافة
          </Button>
        </form>

        {/* Actions + user */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            onClick={() => setReturnsOpen(true)}
            data-testid="pos-open-returns-btn"
            className="bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white h-9 px-3 text-sm shadow"
          >
            <RotateCcw className="w-3.5 h-3.5 ml-1" />
            مرتجع
          </Button>
          <div className="hidden lg:flex items-center gap-2 bg-slate-700/40 rounded-lg px-2.5 py-1.5 border border-slate-600/60">
            <User className="w-3.5 h-3.5 text-amber-400" />
            <div className="text-xs">
              <p className="font-semibold leading-tight">{user?.full_name || user?.email}</p>
              <p className="text-[10px] text-slate-400 leading-tight">
                {user?.role === 'cashier' ? 'كاشير' : user?.role === 'manager' ? 'مشرف' : 'مدير'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ══ BODY: 3 columns ══ */}
      <div className="flex-1 flex flex-row gap-3 min-h-0">

        {/* ── 1. INVOICE PANEL (right in RTL = first child) ── */}
        <Card className="w-[360px] xl:w-[400px] flex-shrink-0 shadow-lg flex flex-col" style={{ maxHeight: 'calc(100vh - 108px)' }}>
          {/* Header */}
          <div className="px-4 py-2.5 bg-slate-900 text-white rounded-t-lg flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              <h2 className="font-bold text-sm">الفاتورة الحالية</h2>
            </div>
            {cart.length > 0 && (
              <Badge className="bg-amber-500 text-white border-0 text-xs">{cart.length} صنف</Badge>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {cart.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">السلة فارغة</p>
                <p className="text-xs mt-1 text-slate-300">انقر منتجاً أو امسح الباركود</p>
              </div>
            ) : cart.map((it, i) => (
              <div key={it.product_id || `cart-${i}`} className="bg-slate-50 rounded-lg p-2.5 border border-slate-200" data-testid={`cart-item-${i}`}>
                <div className="flex justify-between items-start mb-1.5">
                  <p className="font-semibold text-sm flex-1 leading-snug text-slate-900">{it.name}</p>
                  <button onClick={() => removeItem(i)} className="text-rose-400 hover:text-rose-600 mr-1 flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="w-6 h-6 p-0" onClick={() => updateQty(i, -1)}>
                      <Minus className="w-2.5 h-2.5" />
                    </Button>
                    <span className="font-bold w-7 text-center text-sm">{it.quantity}</span>
                    <Button size="sm" variant="outline" className="w-6 h-6 p-0" onClick={() => updateQty(i, 1)}>
                      <Plus className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                  <span className="font-bold text-amber-600 text-sm">{fmt(it.quantity * it.unit_price)} ر.ي</span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer: total + payment + checkout */}
          <div className="p-3 border-t bg-white space-y-2.5 rounded-b-lg flex-shrink-0">
            {/* Total row */}
            <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
              <span className="font-bold text-slate-800">الإجمالي</span>
              <span className="text-xl font-extrabold text-amber-600" data-testid="pos-total">{fmt(total)} ر.ي</span>
            </div>

            {/* Payment methods — compact 4+3 grid */}
            <div>
              <p className="text-[10px] text-slate-500 mb-1 font-medium">طريقة الدفع</p>
              <div className="grid grid-cols-4 gap-1 mb-1">
                {PAYMENT_METHODS.slice(0, 4).map((p) => {
                  const Icon = p.icon;
                  const active = paymentMethod === p.v;
                  return (
                    <button
                      key={p.v}
                      onClick={() => onPaymentSelect(p.v)}
                      data-testid={`pos-payment-${p.v}`}
                      className={`py-1.5 px-1 rounded-lg border text-[10px] font-semibold flex flex-col items-center gap-0.5 transition-all ${
                        active
                          ? `bg-gradient-to-br ${p.color} text-white border-transparent shadow-md`
                          : 'border-slate-200 text-slate-600 hover:border-slate-400 bg-white'
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
                      className={`py-1.5 px-1 rounded-lg border text-[10px] font-semibold flex flex-col items-center gap-0.5 transition-all ${
                        active
                          ? `bg-gradient-to-br ${p.color} text-white border-transparent shadow-md`
                          : 'border-slate-200 text-slate-600 hover:border-slate-400 bg-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {p.l}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Credit customer info */}
            {paymentMethod === 'credit' && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5" data-testid="pos-credit-info">
                {creditCustomer ? (
                  <>
                    <div className="flex justify-between mb-1.5">
                      <p className="text-sm font-bold text-rose-900">{creditCustomer.full_name}</p>
                      <button onClick={() => setShowCustomerPicker(true)} className="text-xs text-rose-600 underline">تغيير</button>
                    </div>
                    <div className="text-xs space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-slate-600">الرصيد السابق:</span>
                        <span className="font-semibold">{fmt(creditCustomer.balance)} ر.ي</span>
                      </div>
                      <div className="flex justify-between text-rose-600">
                        <span>+ الفاتورة:</span>
                        <span className="font-semibold">{fmt(total)} ر.ي</span>
                      </div>
                      <div className="flex justify-between font-bold border-t border-rose-200 pt-1 text-rose-900">
                        <span>الرصيد الجديد:</span>
                        <span>{fmt(Number(creditCustomer.balance) + total)} ر.ي</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => setShowCustomerPicker(true)}
                    className="w-full text-sm text-rose-700 font-medium flex items-center gap-1 justify-center py-1"
                  >
                    <UserPlus className="w-4 h-4" /> اختر عميلاً
                  </button>
                )}
              </div>
            )}

            {/* Complete sale button */}
            <Button
              onClick={completeSale}
              disabled={loading || cart.length === 0 || (paymentMethod === 'credit' && !creditCustomer)}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-lg disabled:opacity-50"
              data-testid="pos-complete-sale-btn"
            >
              {loading
                ? 'جارٍ الحفظ...'
                : cart.length === 0
                  ? 'إتمام البيع'
                  : `✓ إتمام البيع — ${fmt(total)} ر.ي`}
            </Button>

            {lastInvoice && (
              <p className="text-center text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5" data-testid="pos-last-invoice">
                آخر فاتورة: <strong className="font-mono">{lastInvoice.invoice_no}</strong>
              </p>
            )}
          </div>
        </Card>

        {/* ── 2. PRODUCTS GRID (center, flex-1) ── */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو SKU..."
              className="pr-10 h-10 bg-white shadow-sm"
              data-testid="pos-search-input"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Label */}
          <div className="flex items-center justify-between px-1 flex-shrink-0">
            <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {query.trim()
                ? `نتائج البحث (${displayProducts.length})`
                : `المنتجات المميزة (${displayProducts.length})`}
            </h3>
            {!query.trim() && (
              <span className="text-[10px] text-slate-400">ابحث بالأعلى لعرض جميع المنتجات</span>
            )}
          </div>

          {/* Grid */}
          <div
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-y-auto flex-1"
            style={{ minHeight: 0 }}
          >
            {displayProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                data-testid={`pos-product-${p.sku}`}
                className="bg-white rounded-xl p-3 shadow-sm border border-slate-200 hover:shadow-md hover:border-amber-400 active:scale-95 transition-all text-right flex flex-col justify-between h-[100px]"
              >
                <p className="font-semibold text-slate-900 text-sm line-clamp-2 leading-snug">{p.name}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="font-bold text-amber-600 text-sm">{fmt(p.sale_price)} ر.ي</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5">{fmt(p.current_stock)}</Badge>
                </div>
              </button>
            ))}
            {displayProducts.length === 0 && (
              <div className="col-span-full text-center text-slate-400 py-16 bg-white/60 rounded-xl border-2 border-dashed border-slate-300">
                {query.trim() ? (
                  <p className="text-sm">لا توجد منتجات تطابق &quot;{query}&quot;</p>
                ) : (
                  <div className="space-y-2">
                    <Star className="w-10 h-10 mx-auto opacity-20" />
                    <p className="text-sm font-medium">لا توجد منتجات مميزة</p>
                    <p className="text-xs">ابحث بالأعلى أو امسح الباركود لإضافة منتج</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 3. FEATURED SIDEBAR (left in RTL = last child) ── */}
        {featuredProducts.length > 0 && (
          <div
            className="w-36 xl:w-44 flex-shrink-0 flex flex-col gap-2"
            style={{ maxHeight: 'calc(100vh - 108px)' }}
          >
            <div className="flex items-center gap-1.5 flex-shrink-0 px-1">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <h3 className="text-xs font-bold text-slate-600">مميزة</h3>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1.5">
              {featuredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="w-full bg-gradient-to-br from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-200 hover:border-amber-500 rounded-xl p-2.5 text-right transition-all shadow-sm active:scale-95"
                >
                  <p className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug mb-1">{p.name}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-amber-700">{fmt(p.sale_price)} ر.ي</span>
                    <span className="text-[9px] text-slate-400">{fmt(p.current_stock)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══ DIALOGS ══ */}
      <PosReturnsDialog
        open={returnsOpen}
        onClose={() => setReturnsOpen(false)}
        onCompleted={() => {
          api.get('/pos/products', { params: { featured_only: true, limit: 200 } })
            .then((r) => setFeaturedProducts(r.data)).catch(() => {});
        }}
      />

      {/* Customer picker */}
      <Dialog open={showCustomerPicker} onOpenChange={setShowCustomerPicker}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>اختر العميل للبيع الآجل</DialogTitle>
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
                className="w-full text-right p-3 rounded-lg border hover:bg-amber-50 hover:border-amber-400 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-slate-900">{c.full_name}</p>
                    <p className="text-xs text-slate-500">{c.phone || '—'}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-slate-500">الرصيد</p>
                    <p className={`font-bold ${Number(c.balance) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {fmt(c.balance)}
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
};

export default POS;
