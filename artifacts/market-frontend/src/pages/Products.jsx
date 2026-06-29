import React, { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Package, AlertTriangle, Star, Calendar as CalendarIcon } from 'lucide-react';
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

const Products = () => {
  const { can, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  // State for editing / dialog
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const canEdit = can('admin');  // فقط المدير يعدل المنتجات

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

  useEffect(() => { load(); }, []);

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

  // Toggle featured directly from list (Admin/Manager only)
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
        // المشرف لا يستطيع تعديل أي حقل سعري - نزيلها قبل الإرسال
        const { sku, current_stock, barcodes, ...up } = payload;
        if (!isAdmin) {
          delete up.sale_price;
          delete up.cost_price;
          delete up.tax_rate;
        }
        try {
          await api.patch(`/products/${editing.id}`, up);
          toast({ title: 'تم التحديث' });
        } catch (err) {
          if (err?.response?.status === 202) {
            toast({
              title: 'تم إرسال طلب التعديل للمدير',
              description: err.response.data.detail,
            });
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

  // ✋ ملاحظة: تم إلغاء "طلب تعديل سعر" نهائياً — تعديل الأسعار من صلاحيات المدير حصراً.

  const del = async (p) => {
    if (!window.confirm(`حذف المنتج "${p.name}"؟ (سيحتاج موافقة المدير إذا كنت مشرفاً)`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      toast({ title: 'تم الحذف' });
      load();
    } catch (e) {
      if (e?.response?.status === 202) {
        toast({
          title: 'تم إرسال طلب الحذف للمدير',
          description: e.response.data.detail,
        });
      } else {
        toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' });
      }
    }
  };

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="products-page">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">المنتجات</h1>
          <p className="text-slate-500">{products.length} منتج مسجّل</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} data-testid="add-product-btn"
            className="bg-amber-500 hover:bg-amber-600 text-white shadow-md">
            <Plus className="w-4 h-4 ml-2" /> منتج جديد
          </Button>
        )}
      </div>

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
                {canEdit && <th className="px-4 py-3"></th>}
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
                // Expiry coloring
                let expBadge = null;
                if (p.expiry_date) {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const exp = new Date(p.expiry_date);
                  const daysLeft = Math.ceil((exp - today) / 86400000);
                  if (daysLeft < 0) expBadge = <Badge className="bg-rose-100 text-rose-700">منتهي ({Math.abs(daysLeft)} يوم)</Badge>;
                  else if (daysLeft <= 7) expBadge = <Badge className="bg-rose-100 text-rose-700">{daysLeft} يوم</Badge>;
                  else if (daysLeft <= 30) expBadge = <Badge className="bg-amber-100 text-amber-700">{daysLeft} يوم</Badge>;
                  else expBadge = <span className="text-xs text-slate-600">{p.expiry_date}</span>;
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
              <Label>سعر التكلفة {!isAdmin && '(للمدير فقط)'}</Label>
              <Input type="number" step="0.01" value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                disabled={!isAdmin}
                data-testid="product-cost-input" />
            </div>
            <div>
              <Label>
                سعر البيع
                {editing && !isAdmin && (
                  <span className="text-xs text-rose-600 mr-1">(مقفل - استخدم زر «طلب تعديل سعر»)</span>
                )}
              </Label>
              <Input type="number" step="0.01" value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                disabled={!!editing && !isAdmin}
                data-testid="product-price-input" />
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

            {/* Expiry date */}
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

            {/* Featured toggle */}
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
                    title="ترتيب الظهور في الكاشير (الأقل يظهر أولاً)" />
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
