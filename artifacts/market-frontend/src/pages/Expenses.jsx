import React, { useEffect, useState } from 'react';
import { Plus, Wallet, Trash2 } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0);

const Expenses = () => {
  const { can } = useAuth();
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const empty = { category_id: '', amount: 0, description: '', paid_to: '', payment_method: 'cash', expense_date: today };
  const [form, setForm] = useState(empty);

  const load = async () => {
    setLoading(true);
    try {
      const [e, c] = await Promise.all([api.get('/expenses'), api.get('/expense-categories')]);
      setItems(e.data); setCats(c.data);
    } catch (err) { toast({ title: 'خطأ', description: formatApiError(err), variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post('/expenses', {
        ...form,
        amount: Number(form.amount),
        category_id: form.category_id || null,
      });
      toast({ title: 'تمت إضافة المصروف' });
      setForm(empty); setOpen(false); load();
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const del = async (id) => {
    if (!window.confirm('حذف المصروف؟')) return;
    try { await api.delete(`/expenses/${id}`); toast({ title: 'تم الحذف' }); load(); }
    catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const total = items.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="expenses-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">المصروفات</h1>
          <p className="text-slate-500">إجمالي: <span className="font-bold text-rose-600">{fmt(total)} ر.ي</span></p>
        </div>
        {can('admin', 'manager') && (
          <Button onClick={() => { setForm(empty); setOpen(true); }} className="bg-amber-500 hover:bg-amber-600 text-white"
            data-testid="add-expense-btn">
            <Plus className="w-4 h-4 ml-2" /> مصروف جديد
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-right">التاريخ</th>
                <th className="px-4 py-3 text-right">الفئة</th>
                <th className="px-4 py-3 text-right">الوصف</th>
                <th className="px-4 py-3 text-right">المبلغ</th>
                <th className="px-4 py-3 text-right">الدفع</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="6" className="text-center py-8 text-slate-400">جاري التحميل...</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan="6" className="text-center py-12">
                  <Wallet className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-400">لا توجد مصروفات</p>
                </td></tr>
              )}
              {items.map((e) => (
                <tr key={e.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{e.expense_date}</td>
                  <td className="px-4 py-3">{e.category_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{e.description || '—'}</td>
                  <td className="px-4 py-3 font-bold text-rose-600">{fmt(e.amount)} ر.ي</td>
                  <td className="px-4 py-3 text-slate-600">{e.payment_method}</td>
                  <td className="px-4 py-3">
                    {can('admin', 'manager') && (
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => del(e.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>مصروف جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>المبلغ</Label>
              <Input type="number" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="expense-amount-input" /></div>
            <div><Label>الفئة</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger data-testid="expense-category-select"><SelectValue placeholder="اختر فئة" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>التاريخ</Label>
              <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
            <div><Label>الوصف</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>المدفوع إلى</Label>
              <Input value={form.paid_to} onChange={(e) => setForm({ ...form, paid_to: e.target.value })} /></div>
            <div><Label>طريقة الدفع</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدًا</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="save-expense-btn">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;
