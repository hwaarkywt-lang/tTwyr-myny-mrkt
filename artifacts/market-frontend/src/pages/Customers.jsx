import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Users, Phone, Receipt, Eye, Printer, Wallet,
  Edit2, Trash2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const Customers = () => {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const empty = { code: '', full_name: '', phone: '', email: '', address: '', credit_limit: 0 };
  const [form, setForm] = useState(empty);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/customers', { params: { q: q || undefined } });
      setItems(r.data);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    try {
      const payload = { ...form, credit_limit: Number(form.credit_limit) };
      if (!payload.email) delete payload.email;
      if (editing) await api.patch(`/customers/${editing.id}`, payload);
      else await api.post('/customers', payload);
      toast({ title: editing ? 'تم التحديث' : 'تمت الإضافة' });
      setOpen(false); load();
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const del = async (c) => {
    if (!window.confirm(`حذف العميل "${c.full_name}"؟`)) return;
    try { await api.delete(`/customers/${c.id}`); toast({ title: 'تم الحذف' }); load(); }
    catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="customers-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">العملاء</h1>
          <p className="text-slate-500">{items.length} عميل مسجّل</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}
          className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="add-customer-btn">
          <Plus className="w-4 h-4 ml-2" /> عميل جديد
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="ابحث بالاسم أو الهاتف..." className="pr-10"
              data-testid="customers-search-input" />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center text-slate-400 py-12">جاري التحميل...</div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400">لا يوجد عملاء بعد</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => {
            const balance = Number(c.balance);
            const isDebt = balance > 0;
            return (
              <Card key={c.id} className="shadow-sm hover:shadow-lg transition-all group overflow-hidden" data-testid={`customer-card-${c.id}`}>
                <CardContent className="p-5">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg shadow"
                         style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
                      {c.full_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/dashboard/customers/${c.id}`}
                        className="font-bold text-slate-900 hover:text-amber-600 transition-colors block truncate"
                        data-testid={`customer-link-${c.id}`}
                      >
                        {c.full_name}
                      </Link>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {c.phone || '—'}
                      </p>
                    </div>
                    {isDebt
                      ? <AlertCircle className="w-4 h-4 text-rose-500" title="عليه ديون" />
                      : <CheckCircle2 className="w-4 h-4 text-emerald-500" title="لا توجد ديون" />
                    }
                  </div>

                  {/* Balance */}
                  <div className={`rounded-xl p-3 mb-3 ${
                    isDebt ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'
                  }`}>
                    <p className="text-xs text-slate-500 mb-1">الرصيد الحالي</p>
                    <p className={`text-2xl font-bold ${isDebt ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {fmt(balance)} <span className="text-sm font-medium">ر.ي</span>
                    </p>
                    {c.credit_limit > 0 && (
                      <p className="text-xs text-slate-500 mt-1">حد الائتمان: {fmt(c.credit_limit)} ر.ي</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      onClick={() => navigate(`/dashboard/customers/${c.id}`)}
                      variant="outline" size="sm" className="text-xs"
                      data-testid={`view-account-${c.id}`}
                    >
                      <Eye className="w-3.5 h-3.5 ml-1" /> الحساب
                    </Button>
                    <Button
                      onClick={() => navigate(`/dashboard/customers/${c.id}?action=pay`)}
                      variant="outline" size="sm"
                      className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      data-testid={`add-payment-${c.id}`}
                    >
                      <Wallet className="w-3.5 h-3.5 ml-1" /> سداد
                    </Button>
                    <Button
                      onClick={() => navigate(`/dashboard/customers/${c.id}?action=print`)}
                      variant="outline" size="sm" className="text-xs"
                      data-testid={`print-statement-${c.id}`}
                    >
                      <Printer className="w-3.5 h-3.5 ml-1" /> طباعة
                    </Button>
                  </div>

                  {/* Edit/Delete (small) */}
                  <div className="flex justify-end gap-1 mt-2 pt-2 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setForm({ ...c }); setOpen(true); }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    {can('admin', 'manager') && (
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => del(c)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editing ? 'تعديل عميل' : 'عميل جديد'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>الاسم الكامل</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="customer-name-input" /></div>
            <div><Label>الكود</Label><Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>الهاتف</Label><Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="customer-phone-input" /></div>
            <div className="col-span-2"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="col-span-2"><Label>العنوان</Label><Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>حد الائتمان</Label><Input type="number" step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="save-customer-btn">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
