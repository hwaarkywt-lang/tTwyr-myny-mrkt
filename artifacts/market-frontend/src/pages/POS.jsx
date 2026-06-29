import React, { useEffect, useRef, useState } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Banknote,
  CreditCard, Wallet, Building2, Smartphone, ArrowLeftRight, Clock,
  UserPlus, X, RotateCcw, Calendar, User,
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

// 7 وسائل دفع
const PAYMENT_METHODS = [
  { v: 'cash',          l: 'نقداً',       icon: Banknote,      color: 'from-emerald-500 to-emerald-600' },
  { v: 'jaib',          l: 'جيب',         icon: Smartphone,    color: 'from-purple-500 to-purple-600' },
  { v: 'fluusak',       l: 'فلوسك',       icon: Wallet,        color: 'from-pink-500 to-pink-600' },
  { v: 'hasib',         l: 'حاسب',        icon: CreditCard,    color: 'from-blue-500 to-blue-600' },
  { v: 'banki',         l: 'بنكي',        icon: Building2,     color: 'from-cyan-500 to-cyan-600' },
  { v: 'bank_transfer', l: 'تحويل بنكي',  icon: ArrowLeftRight, color: 'from-indigo-500 to-indigo-600' },
  { v: 'credit',        l: 'آجل',         icon: Clock,         color: 'from-rose-500 to-rose-600' },
];

const POS = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [creditCustomer, setCreditCustomer] = useState(null);  // selected customer for آجل
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

  const loadProducts = (searchTerm) => {
    // When user is searching, fetch all matches. Otherwise, fetch only featured products.
    const params = searchTerm && searchTerm.trim()
      ? { q: searchTerm.trim(), limit: 500 }
      : { featured_only: true, limit: 200 };
    return api.get('/pos/products', { params }).then((r) => setProducts(r.data));
  };

  // Reload products when query changes (debounced)
  useEffect(() => {
    const t = setTimeout(() => loadProducts(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    loadProducts('');
    barcodeRef.current?.focus();
  }, []);

  // Load customers when picker opens
  useEffect(() => {
    if (showCustomerPicker) {
      api.get('/customers', { params: { q: customerSearch || undefined } })
        .then((r) => setCustomers(r.data));
    }
  }, [showCustomerPicker, customerSearch]);

  // Products list now comes pre-filtered from backend (featured-only OR search results).
  const filteredProducts = products;

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

  const subtotal = cart.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const total = subtotal;

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
      loadProducts(query);
      barcodeRef.current?.focus();
    } catch (e) {
      toast({ title: 'فشل البيع', description: formatApiError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3 p-4 bg-gradient-to-br from-slate-100 via-slate-50 to-amber-50" dir="rtl" data-testid="pos-page">
      {/* Luxury top bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-xl px-5 py-3 flex items-center justify-between text-white">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
            <ShoppingCart className="w-6 h-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold leading-tight">{STORE.name}</h1>
            <p className="text-[11px] text-slate-300 flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              {now.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
              <span className="text-amber-300" dir="ltr">• 📞 {STORE.phone}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setReturnsOpen(true)}
            data-testid="pos-open-returns-btn"
            className="bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold h-10 px-4 shadow-lg hover:shadow-amber-500/50 transition-all"
          >
            <RotateCcw className="w-4 h-4 ml-1.5" />
            مرتجع / استبدال
          </Button>
          <div className="hidden md:flex items-center gap-2 bg-slate-700/40 backdrop-blur rounded-xl px-3 py-1.5 border border-slate-600">
            <User className="w-4 h-4 text-amber-400" />
            <div className="text-xs">
              <p className="font-semibold text-white leading-tight">{user?.full_name || user?.email}</p>
              <p className="text-[10px] text-slate-400 leading-tight">
                {user?.role === 'cashier' ? 'كاشير' : user?.role === 'manager' ? 'مشرف' : 'مدير'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
      {/* Products grid */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <form onSubmit={onBarcodeSubmit} className="flex gap-2">
          <Input
            ref={barcodeRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="🔍 امسح الباركود واضغط Enter..."
            className="h-12 text-lg"
            data-testid="pos-barcode-input"
            autoComplete="off"
          />
          <Button type="submit" className="h-12 bg-amber-500 hover:bg-amber-600 text-white px-6">
            إضافة
          </Button>
        </form>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالاسم أو SKU..."
            className="pr-10"
            data-testid="pos-search-input"
          />
        </div>

        {/* Section label */}
        <div className="flex items-center justify-between mb-1.5 px-1">
          <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            {query.trim() ? `نتائج البحث (${filteredProducts.length})` : `المنتجات المميزة (${filteredProducts.length})`}
          </h3>
          {!query.trim() && filteredProducts.length === 0 && (
            <span className="text-[10px] text-slate-400">ابحث بالاسم أو الباركود ↑</span>
          )}
        </div>

        <div
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 320px)' }}
        >
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              data-testid={`pos-product-${p.sku}`}
              className="bg-white rounded-xl p-3 shadow-sm border border-slate-200 hover:shadow-md hover:border-amber-400 transition-all text-right"
            >
              <p className="font-semibold text-slate-900 text-sm line-clamp-2 mb-1">{p.name}</p>
              <p className="text-xs text-slate-500 mb-2">{p.sku}</p>
              <div className="flex justify-between items-center">
                <span className="font-bold text-amber-600">{fmt(p.sale_price)} ر.ي</span>
                <Badge variant="secondary" className="text-xs">{fmt(p.current_stock)}</Badge>
              </div>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center text-slate-400 py-12 bg-white/50 rounded-xl border-2 border-dashed border-slate-300">
              {query.trim() ? (
                <p className="text-sm">لا توجد منتجات تطابق &quot;{query}&quot;</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">لا توجد منتجات مميزة بعد</p>
                  <p className="text-xs">اطلب من المدير تمييز المنتجات الأكثر استخداماً من صفحة &quot;المنتجات&quot;</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <Card className="w-full lg:w-[420px] shadow-lg flex flex-col flex-shrink-0" style={{ maxHeight: 'calc(100vh - 100px)' }}>
        <div className="p-4 border-b bg-slate-900 text-white rounded-t-lg flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          <h2 className="font-bold">الفاتورة الحالية ({cart.length})</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <p className="text-center text-slate-400 py-12">السلة فارغة</p>
          ) : cart.map((it, i) => (
            <div key={it.product_id || `cart-${i}`} className="bg-slate-50 rounded-lg p-3 border" data-testid={`cart-item-${i}`}>
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium text-sm flex-1">{it.name}</p>
                <button onClick={() => removeItem(i)} className="text-rose-500 hover:text-rose-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="w-7 h-7 p-0" onClick={() => updateQty(i, -1)}>
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="font-bold w-8 text-center">{it.quantity}</span>
                  <Button size="sm" variant="outline" className="w-7 h-7 p-0" onClick={() => updateQty(i, 1)}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <span className="font-bold text-amber-600">{fmt(it.quantity * it.unit_price)} ر.ي</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t bg-white space-y-3 rounded-b-lg">
          {/* Total */}
          <div className="flex justify-between text-lg font-bold pb-2 border-b">
            <span>الإجمالي</span>
            <span className="text-amber-600" data-testid="pos-total">{fmt(total)} ر.ي</span>
          </div>

          {/* Locked paid amount */}
          <div>
            <Label className="text-xs text-slate-500">المبلغ المدفوع (تلقائي)</Label>
            <Input
              value={paymentMethod === 'credit' ? '0.00' : fmt(total)}
              disabled
              readOnly
              className="h-10 text-base font-bold bg-slate-50 cursor-not-allowed text-center"
              data-testid="pos-paid-input"
            />
          </div>

          {/* Payment methods grid 7 */}
          <div>
            <Label className="text-xs text-slate-500 mb-1.5 block">طريقة الدفع</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {PAYMENT_METHODS.slice(0, 4).map((p) => {
                const Icon = p.icon;
                const active = paymentMethod === p.v;
                return (
                  <button
                    key={p.v}
                    onClick={() => onPaymentSelect(p.v)}
                    data-testid={`pos-payment-${p.v}`}
                    className={`p-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      active
                        ? `bg-gradient-to-br ${p.color} text-white border-transparent shadow-md`
                        : 'border-slate-200 text-slate-700 hover:border-slate-400 bg-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {p.l}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              {PAYMENT_METHODS.slice(4).map((p) => {
                const Icon = p.icon;
                const active = paymentMethod === p.v;
                return (
                  <button
                    key={p.v}
                    onClick={() => onPaymentSelect(p.v)}
                    data-testid={`pos-payment-${p.v}`}
                    className={`p-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      active
                        ? `bg-gradient-to-br ${p.color} text-white border-transparent shadow-md`
                        : 'border-slate-200 text-slate-700 hover:border-slate-400 bg-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {p.l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Credit customer info */}
          {paymentMethod === 'credit' && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3" data-testid="pos-credit-info">
              {creditCustomer ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-rose-900">{creditCustomer.full_name}</p>
                    <button onClick={() => setShowCustomerPicker(true)} className="text-xs text-rose-600 underline">
                      تغيير
                    </button>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span>الرصيد السابق:</span>
                      <span className="font-semibold">{fmt(creditCustomer.balance)} ر.ي</span></div>
                    <div className="flex justify-between"><span>قيمة الفاتورة:</span>
                      <span className="font-semibold text-rose-700">+ {fmt(total)} ر.ي</span></div>
                    <div className="flex justify-between pt-1 border-t border-rose-200">
                      <span className="font-bold">الرصيد الجديد:</span>
                      <span className="font-bold text-rose-900">{fmt(Number(creditCustomer.balance) + total)} ر.ي</span>
                    </div>
                  </div>
                </>
              ) : (
                <button onClick={() => setShowCustomerPicker(true)}
                  className="w-full text-sm text-rose-700 font-medium">
                  <UserPlus className="w-4 h-4 inline ml-1" /> اختر عميلاً
                </button>
              )}
            </div>
          )}

          <Button
            onClick={completeSale}
            disabled={loading || cart.length === 0 || (paymentMethod === 'credit' && !creditCustomer)}
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold shadow-lg"
            data-testid="pos-complete-sale-btn"
          >
            {loading ? 'جارٍ الحفظ...' : 'إتمام البيع'}
          </Button>

          {lastInvoice && (
            <p className="text-center text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-2" data-testid="pos-last-invoice">
              ✓ آخر فاتورة: <strong>{lastInvoice.invoice_no}</strong>
            </p>
          )}
        </div>
      </Card>
      </div>{/* end inner flex (products + cart) */}

      {/* Returns/Exchange dialog */}
      <PosReturnsDialog
        open={returnsOpen}
        onClose={() => setReturnsOpen(false)}
        onCompleted={() => { loadProducts(query); }}
      />

      {/* Customer picker modal */}
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
