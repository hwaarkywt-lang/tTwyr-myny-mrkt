import React, { useEffect, useState, useMemo } from 'react';
import {
  Plus, Search, Edit2, Trash2, Package, AlertTriangle, Star,
  Calendar as CalendarIcon, ClipboardList, Printer, X,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const fmt = (n, d = 2) =>
  new Intl.NumberFormat('ar-EG', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);

// ── Inventory report (printable) ─────────────────────────────────────────────
function InventoryReport({ products, categories, onClose }) {
  const now = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => { m[c.id] = c.name; });
    return m;
  }, [categories]);

  const rows = useMemo(() =>
    [...products].sort((a, b) =>
      (catMap[a.category_id] || '').localeCompare(catMap[b.category_id] || '') ||
      a.name.localeCompare(b.name)
    ), [products, catMap]);

  const totalValue  = useMemo(() => rows.reduce((s, p) => s + Number(p.cost_price || 0) * Number(p.current_stock || 0), 0), [rows]);
  const totalSaleV  = useMemo(() => rows.reduce((s, p) => s + Number(p.sale_price || 0) * Number(p.current_stock || 0), 0), [rows]);
  const lowCount    = rows.filter((p) => Number(p.current_stock) <= Number(p.min_stock_level)).length;
  const zeroCount   = rows.filter((p) => Number(p.current_stock) <= 0).length;

  const doPrint = () => window.print();

  return (
    <>
      {/* Print styles injected into <head> */}
      <style>{`
        @media print {
          body > *:not(#inv-report-root) { display: none !important; }
          #inv-report-root { display: block !important; }
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 12mm; }
          table { font-size: 10px; }
        }
      `}</style>

      <div
        id="inv-report-root"
        className="fixed inset-0 z-50 bg-white overflow-auto"
        dir="rtl"
      >
        {/* Toolbar */}
        <div className="no-print sticky top-0 z-10 bg-white border-b flex items-center justify-between px-6 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-600" />
            <span className="font-bold text-slate-900">كشف جرد المخزون</span>
            <span className="text-slate-400 text-sm">— {now}</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={doPrint} className="bg-amber-500 hover:bg-amber-600 text-white gap-2">
              <Printer className="w-4 h-4" /> طباعة / PDF
            </Button>
            <Button variant="outline" onClick={onClose} className="gap-2">
              <X className="w-4 h-4" /> إغلاق
            </Button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Report header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-extrabold text-slate-900">ميني ماركت الفنية</h1>
            <h2 className="text-lg font-bold text-amber-700 mt-1">كشف جرد المخزون الحالي</h2>
            <p className="text-slate-500 text-sm mt-0.5">{now}</p>
          </div>

          {/* KPI summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 no-print">
            {[
              { label: 'إجمالي الأصناف',    value: rows.length,         color: 'bg-slate-100 text-slate-800' },
              { label: 'قيمة التكلفة',       value: fmt(totalValue) + ' ر.ي', color: 'bg-blue-50 text-blue-800' },
              { label: 'قيمة البيع',          value: fmt(totalSaleV) + ' ر.ي', color: 'bg-emerald-50 text-emerald-800' },
              { label: 'أصناف تحت الحد الأدنى', value: lowCount,        color: lowCount > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600' },
            ].map((k) => (
              <div key={k.label} className={`rounded-xl p-4 ${k.color}`}>
                <p className="text-xs font-medium opacity-70">{k.label}</p>
                <p className="text-xl font-extrabold mt-0.5">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Print-only summary line */}
          <div className="hidden print:flex justify-between text-xs text-slate-600 mb-3 border-b pb-2">
            <span>إجمالي الأصناف: {rows.length}</span>
            <span>قيمة المخزون بالتكلفة: {fmt(totalValue)} ر.ي</span>
            <span>قيمة المخزون بسعر البيع: {fmt(totalSaleV)} ر.ي</span>
            <span>أصناف تحت الحد الأدنى: {lowCount}</span>
            <span>أصناف نفدت: {zeroCount}</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-amber-600 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-right font-semibold">#</th>
                  <th className="px-3 py-2.5 text-right font-semibold">المنتج</th>
                  <th className="px-3 py-2.5 text-right font-semibold">SKU</th>
                  <th className="px-3 py-2.5 text-right font-semibold">الفئة</th>
                  <th className="px-3 py-2.5 text-right font-semibold">الوحدة</th>
                  <th className="px-3 py-2.5 text-left font-semibold">المخزون الحالي</th>
                  <th className="px-3 py-2.5 text-left font-semibold">الحد الأدنى</th>
                  <th className="px-3 py-2.5 text-left font-semibold">سعر التكلفة</th>
                  <th className="px-3 py-2.5 text-left font-semibold">سعر البيع</th>
                  <th className="px-3 py-2.5 text-left font-semibold">قيمة المخزون</th>
                  <th className="px-3 py-2.5 text-center font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const stock     = Number(p.current_stock || 0);
                  const minStock  = Number(p.min_stock_level || 0);
                  const costVal   = Number(p.cost_price || 0) * stock;
                  const isLow     = stock <= minStock;
                  const isZero    = stock <= 0;
                  return (
                    <tr
                      key={p.id}
                      className={`border-t transition-colors ${
                        isZero ? 'bg-rose-50'
                        : isLow ? 'bg-amber-50'
                        : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-900 max-w-[180px]">
                        {p.is_featured && <Star className="inline w-3 h-3 text-amber-500 fill-amber-500 ml-0.5" />}
                        {p.name}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{p.sku}</td>
                      <td className="px-3 py-2 text-slate-600 text-xs">{catMap[p.category_id] || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs">{p.unit}</td>
                      <td className={`px-3 py-2 font-bold text-left ${isZero ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-800'}`}>
                        {fmt(stock, 2)}
                        {isLow && !isZero && <AlertTriangle className="inline w-3.5 h-3.5 mr-1 text-amber-500" />}
                        {isZero && <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full mr-1">نفد</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-left">{fmt(minStock, 2)}</td>
                      <td className="px-3 py-2 text-blue-700 text-left">{fmt(p.cost_price, 2)}</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold text-left">{fmt(p.sale_price, 2)}</td>
                      <td className="px-3 py-2 font-bold text-slate-800 text-left">{fmt(costVal, 2)}</td>
                      <td className="px-3 py-2 text-center">
                        {isZero
                          ? <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full">نفد المخزون</span>
                          : isLow
                            ? <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">تحت الحد</span>
                            : <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">متوفر</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-amber-500 bg-amber-50 font-bold">
                  <td colSpan={5} className="px-3 py-2.5 text-slate-800">
                    الإجمالي — {rows.length} صنف
                  </td>
                  <td className="px-3 py-2.5 text-left text-slate-700">
                    {fmt(rows.reduce((s, p) => s + Number(p.current_stock || 0), 0), 2)}
                  </td>
                  <td />
                  <td />
                  <td />
                  <td className="px-3 py-2.5 text-left text-amber-800 text-base">
                    {fmt(totalValue, 2)} ر.ي
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer note */}
          <div className="mt-6 text-xs text-slate-400 text-center print:mt-3">
            تاريخ الكشف: {now} — قيمة المخزون محسوبة بسعر التكلفة
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Products component ───────────────────────────────────────────────────
const Products = () => {
  const { can, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ]                   = useState('');
  const [loading, setLoading]       = useState(true);
  const [open, setOpen]             = useState(false);
  const [editing, setEditing]       = useState(null);
  const [showAudit, setShowAudit]   = useState(false);
  const canEdit = can('admin');

  const empty = {
    sku: '', name: '', description: '', category_id: '',
    unit: 'piece', cost_price: 0, sale_price: 0, tax_rate: 0,
    min_stock_level: 0, current_stock: 0, has_expiry: false,
    expiry_date: '', is_featured: false, featured_order: 0,
    barcodes: [''],
  };
  const [form, setForm] = useState(empty);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        api.get('/products', { params: { q: q || undefined, limit: 500 } }),
        api.get('/categories'),
      ]);
      setProducts(p.data);
      setCategories(c.data);
    } catch (e) {
      toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      sku: p.sku, name: p.name, description: p.description || '',
      category_id: p.category_id || '', unit: p.unit,
      cost_price: p.cost_price, sale_price: p.sale_price, tax_rate: p.tax_rate,
      min_stock_level: p.min_stock_level, current_stock: p.current_stock,
      has_expiry: p.has_expiry,
      expiry_date: p.expiry_date || '',
      is_featured: !!p.is_featured,
      featured_order: p.featured_order || 0,
      barcodes: p.barcodes?.length ? p.barcodes : [''],
    });
    setOpen(true);
  };

  const toggleFeatured = async (p) => {
    try {
      await api.patch(`/products/${p.id}/featured`, {
        is_featured: !p.is_featured,
        featured_order: p.featured_order || 0,
      });
      toast({ title: !p.is_featured ? 'تم تمييز المنتج' : 'تم إلغاء التمييز' });
      load();
    } catch (e) {
      toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' });
    }
  };

  const save = async () => {
    try {
      const payload = {
        ...form,
        cost_price: Number(form.cost_price), sale_price: Number(form.sale_price),
        tax_rate: Number(form.tax_rate), min_stock_level: Number(form.min_stock_level),
        current_stock: Number(form.current_stock),
        expiry_date: form.expiry_date || null,
        is_featured: !!form.is_featured,
        featured_order: Number(form.featured_order || 0),
        barcodes: form.barcodes.filter(Boolean),
        category_id: form.category_id || null,
      };
      if (editing) {
        const { sku, current_stock, barcodes, ...up } = payload;
        if (!isAdmin) { delete up.sale_price; delete up.cost_price; delete up.tax_rate; }
        try {
          await api.patch(`/products/${editing.id}`, up);
          toast({ title: 'تم التحديث' });
        } catch (err) {
          if (err?.response?.status === 202) {
            toast({ title: 'تم إرسال طلب التعديل للمدير', description: err.response.data.detail });
          } else { throw err; }
        }
      } else {
        await api.post('/products', payload);
        toast({ title: 'تمت إضافة المنتج' });
      }
      setOpen(false);
      load();
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const del = async (p) => {
    if (!window.confirm(`حذف المنتج "${p.name}"؟`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      toast({ title: 'تم الحذف' });
      load();
    } catch (e) {
      if (e?.response?.status === 202) {
        toast({ title: 'تم إرسال طلب الحذف للمدير', description: e.response.data.detail });
      } else {
        toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' });
      }
    }
  };

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="products-page">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">المنتجات</h1>
          <p className="text-slate-500">{products.length} منتج مسجّل</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Inventory audit button — visible to admin & manager */}
          {can('admin', 'manager') && (
            <Button
              variant="outline"
              onClick={() => setShowAudit(true)}
              className="border-amber-400 text-amber-700 hover:bg-amber-50 gap-2"
              data-testid="inventory-audit-btn"
            >
              <ClipboardList className="w-4 h-4" /> جرد المخزون
            </Button>
          )}
          {canEdit && (
            <Button
              onClick={openCreate}
              className="bg-amber-500 hover:bg-amber-600 text-white shadow-md gap-2"
              data-testid="add-product-btn"
            >
              <Plus className="w-4 h-4" /> منتج جديد
            </Button>
          )}
        </div>
      </div>

      {/* ─── Search ─── */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="بحث بالاسم، SKU، أو الباركود..."
              className="pr-10"
              data-testid="products-search-input"
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── Products table ─── */}
      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-right">المنتج</th>
                <th className="px-4 py-3 text-right">SKU</th>
                <th className="px-4 py-3 text-right">الفئة</th>
                <th className="px-4 py-3 text-right">السعر</th>
                <th className="px-4 py-3 text-right">المخزون</th>
                <th className="px-4 py-3 text-right">الصلاحية</th>
                <th className="px-4 py-3 text-center">مميز</th>
                <th className="px-4 py-3 text-right">الحالة</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="9" className="text-center py-8 text-slate-400">جاري التحميل...</td></tr>
              )}
              {!loading && products.length === 0 && (
                <tr><td colSpan="9" className="text-center py-12">
                  <Package className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-400">لا توجد منتجات</p>
                </td></tr>
              )}
              {products.map((p) => {
                const low = Number(p.current_stock) <= p.min_stock_level;
                let expBadge = null;
                if (p.expiry_date) {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const exp = new Date(p.expiry_date);
                  const daysLeft = Math.ceil((exp - today) / 86400000);
                  if (daysLeft < 0)
                    expBadge = <Badge className="bg-rose-100 text-rose-700">منتهي ({Math.abs(daysLeft)} يوم)</Badge>;
                  else if (daysLeft <= 7)
                    expBadge = <Badge className="bg-rose-100 text-rose-700">{daysLeft} يوم</Badge>;
                  else if (daysLeft <= 30)
                    expBadge = <Badge className="bg-amber-100 text-amber-700">{daysLeft} يوم</Badge>;
                  else
                    expBadge = <span className="text-xs text-slate-600">{p.expiry_date}</span>;
                }
                return (
                  <tr key={p.id} className="border-t hover:bg-slate-50" data-testid={`product-row-${p.id}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.is_featured && <Star className="inline w-3.5 h-3.5 text-amber-500 fill-amber-500 ml-1" />}
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{p.category_name || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">{Number(p.sale_price).toFixed(2)} ر.ي</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${low ? 'text-rose-600' : 'text-slate-700'}`}>
                        {Number(p.current_stock).toFixed(2)} {p.unit}
                      </span>
                      {low && <AlertTriangle className="inline w-4 h-4 mr-1 text-rose-500" />}
                    </td>
                    <td className="px-4 py-3">{expBadge || <span className="text-slate-300 text-xs">—</span>}</td>
                    <td className="px-4 py-3 text-center">
                      {canEdit ? (
                        <button
                          onClick={() => toggleFeatured(p)}
                          data-testid={`toggle-featured-${p.id}`}
                          title={p.is_featured ? 'إلغاء التمييز' : 'تمييز في POS'}
                          className="hover:scale-110 transition-transform"
                        >
                          <Star className={`w-5 h-5 ${p.is_featured ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`} />
                        </button>
                      ) : (
                        p.is_featured && <Star className="w-5 h-5 text-amber-500 fill-amber-500 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.is_active
                        ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">نشط</Badge>
                        : <Badge variant="secondary">معطل</Badge>}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          {can('admin') && (
                            <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700"
                              onClick={() => del(p)} data-testid={`delete-product-${p.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── Inventory audit report (fullscreen overlay) ─── */}
      {showAudit && (
        <InventoryReport
          products={products}
          categories={categories}
          onClose={() => setShowAudit(false)}
        />
      )}

      {/* ─── Add / Edit product dialog ─── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل منتج' : 'منتج جديد'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                disabled={!!editing} data-testid="product-sku-input" />
            </div>
            <div>
              <Label>اسم المنتج</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="product-name-input" />
            </div>
            <div className="col-span-2">
              <Label>الفئة</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger data-testid="product-category-select"><SelectValue placeholder="اختر فئة" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>سعر التكلفة {!isAdmin && <span className="text-xs text-slate-400">(للمدير فقط)</span>}</Label>
              <Input type="number" step="0.01" value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                disabled={!isAdmin} data-testid="product-cost-input" />
            </div>
            <div>
              <Label>سعر البيع
                {editing && !isAdmin && <span className="text-xs text-rose-600 mr-1">(مقفل)</span>}
              </Label>
              <Input type="number" step="0.01" value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                disabled={!!editing && !isAdmin} data-testid="product-price-input" />
            </div>
            <div>
              <Label>الحد الأدنى للمخزون</Label>
              <Input type="number" value={form.min_stock_level}
                onChange={(e) => setForm({ ...form, min_stock_level: e.target.value })} />
            </div>
            {!editing && (
              <div>
                <Label>المخزون الابتدائي</Label>
                <Input type="number" step="0.01" value={form.current_stock}
                  onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                  data-testid="product-stock-input" />
              </div>
            )}
            <div className="col-span-2">
              <Label>الباركود</Label>
              <Input value={form.barcodes[0] || ''}
                onChange={(e) => setForm({ ...form, barcodes: [e.target.value] })}
                placeholder="مثال: 1234567890123" data-testid="product-barcode-input" />
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                تاريخ انتهاء الصلاحية
              </Label>
              <Input type="date" value={form.expiry_date || ''}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                data-testid="product-expiry-input" />
              <p className="text-[10px] text-slate-400 mt-1">سيتم تنبيهك قبل الانتهاء بـ 90/30/7 يوم</p>
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                منتج مميز (يظهر في الكاشير)
              </Label>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_featured: !form.is_featured })}
                  data-testid="product-featured-toggle"
                  className={`flex-1 px-3 py-2 rounded-md border-2 text-sm font-medium transition-all ${
                    form.is_featured
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-amber-300'
                  }`}
                >
                  {form.is_featured ? '⭐ مميز' : '☆ غير مميز'}
                </button>
                {form.is_featured && (
                  <Input type="number" placeholder="ترتيب" className="w-20"
                    value={form.featured_order || 0}
                    onChange={(e) => setForm({ ...form, featured_order: e.target.value })}
                    title="ترتيب الظهور في الكاشير" />
                )}
              </div>
            </div>
            <div className="col-span-2">
              <Label>الوصف</Label>
              <Input value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="save-product-btn">
              {editing ? 'حفظ' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
