import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Store, Phone, Eye, Printer, Wallet, Edit2, Trash2 } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const Suppliers = () => {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const empty = { code: '', name: '', contact_person: '', phone: '', email: '', address: '' };
  const [form, setForm] = useState(empty);

  const load = async () => {
    setLoading(true);
    try { setItems((await api.get('/suppliers', { params: { q: q || undefined } })).data); }
    catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    try {
      const payload = { ...form };
      if (!payload.email) delete payload.email;
      if (editing) await api.patch(`/suppliers/${editing.id}`, payload);
      else await api.post('/suppliers', payload);
      toast({ title: editing ? 'تم التحديث' : 'تمت الإضافة' });
      setOpen(false); load();
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const del = async (s) => {
    if (!window.confirm(`حذف التاجر "${s.name}"؟`)) return;
    try { await api.delete(`/suppliers/${s.id}`); toast({ title: 'تم الحذف' }); load(); }
    catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const totalDue = items.reduce((s, x) => s + Number(x.balance || 0), 0);

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="suppliers-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">حسابات التجار</h1>
          <p className="text-slate-500">{items.length} تاجر</p>
        </div>
        <div className="flex gap-3 items-center">
          <Card className="px-4 py-2 bg-gradient-to-r from-rose-500 to-rose-600 text-white border-0 shadow">
            <p className="text-xs opacity-90">إجمالي المستحق للتجار</p>
            <p className="text-xl font-bold" data-testid="total-due-suppliers">{fmt(totalDue)} ر.ي</p>
          </Card>
          {can('admin', 'manager') && (
            <Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}
              className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="add-supplier-btn">
              <Plus className="w-4 h-4 ml-2" /> تاجر جديد
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="ابحث بالاسم أو الهاتف..." className="pr-10"
              data-testid="suppliers-search-input" />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center text-slate-400 py-12">جاري التحميل...</div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center">
          <Store className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400">لا يوجد تجار بعد</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((s) => {
            const balance = Number(s.balance);
            const isDebt = balance > 0;
            return (
              <Card key={s.id} className="shadow-sm hover:shadow-lg transition-all group" data-testid={`supplier-card-${s.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-lg shadow"
                         style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
                      <Store className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link to={`/dashboard/suppliers/${s.id}`}
                        className="font-bold text-slate-900 hover:text-amber-600 truncate block"
                        data-testid={`supplier-link-${s.id}`}>{s.name}</Link>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {s.phone || '—'}
                      </p>
                    </div>
                  </div>

                  <div className={`rounded-xl p-3 mb-3 ${
                    isDebt ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'
                  }`}>
                    <p className="text-xs text-slate-500 mb-1">الرصيد المستحق</p>
                    <p className={`text-2xl font-bold ${isDebt ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {fmt(balance)} <span className="text-sm font-medium">ر.ي</span>
                    </p>
                  </div>

                  <Button
                    onClick={() => navigate(`/dashboard/suppliers/${s.id}`)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white"
                    data-testid={`open-supplier-${s.id}`}
                  >
                    <Eye className="w-4 h-4 ml-1" /> فتح الحساب
                  </Button>

                  <div className="flex justify-end gap-1 mt-2 pt-2 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                    {can('admin', 'manager') && (
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setForm({ ...s }); setOpen(true); }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {can('admin') && (
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => del(s)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editing ? 'تعديل تاجر' : 'تاجر جديد'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>اسم التاجر</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="supplier-name-input" /></div>
            <div><Label>الكود</Label><Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>المسؤول</Label><Input value={form.contact_person || ''} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div><Label>الهاتف</Label><Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>البريد</Label><Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="col-span-2"><Label>العنوان</Label><Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="save-supplier-btn">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppliers;
