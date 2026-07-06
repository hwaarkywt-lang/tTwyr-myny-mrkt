import React, { useEffect, useState, useMemo } from 'react';
import { Plus, Wallet, Calendar, TrendingDown, BarChart3, Filter, ChevronDown, ChevronUp } from 'lucide-react';
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

const PAYMENT_LABELS = { cash: 'نقداً', card: 'بطاقة', bank_transfer: 'تحويل' };

const Expenses = () => {
  const { can } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  const [items, setItems]       = useState([]);
  const [cats, setCats]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo]     = useState(today);
  const [expandedDay, setExpandedDay] = useState(null); // which day is expanded in detail view

  const empty = {
    category_id: '', amount: '', description: '',
    paid_to: '', payment_method: 'cash', expense_date: today,
  };
  const [form, setForm] = useState(empty);

  // ─── fetch expenses ───────────────────────────────────────────────
  const load = async (from = dateFrom, to = dateTo) => {
    setLoading(true);
    try {
      const [e, c] = await Promise.all([
        api.get('/expenses', { params: { date_from: from, date_to: to, limit: 500 } }),
        api.get('/expense-categories'),
      ]);
      setItems(e.data);
      setCats(c.data);
    } catch (err) {
      toast({ title: 'خطأ', description: formatApiError(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const applyFilter = () => load(dateFrom, dateTo);

  const setPreset = (from, to) => {
    setDateFrom(from); setDateTo(to); load(from, to);
  };

  // ─── group by day ─────────────────────────────────────────────────
  const byDay = useMemo(() => {
    const map = {};
    for (const e of items) {
      const day = e.expense_date || e.created_at?.split('T')[0] || '—';
      if (!map[day]) map[day] = { date: day, total: 0, count: 0, rows: [] };
      map[day].total += Number(e.amount);
      map[day].count += 1;
      map[day].rows.push(e);
    }
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [items]);

  const grandTotal = items.reduce((s, e) => s + Number(e.amount), 0);
  const todayTotal = useMemo(
    () => items.filter((e) => (e.expense_date || '').startsWith(today))
               .reduce((s, e) => s + Number(e.amount), 0),
    [items, today],
  );
  const monthTotal = useMemo(() => {
    const m = today.slice(0, 7);
    return items.filter((e) => (e.expense_date || '').startsWith(m))
                .reduce((s, e) => s + Number(e.amount), 0);
  }, [items, today]);

  // ─── save ─────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast({ title: 'المبلغ مطلوب ويجب أن يكون أكبر من صفر', variant: 'destructive' }); return;
    }
    try {
      await api.post('/expenses', {
        ...form,
        amount: Number(form.amount),
        category_id: form.category_id || null,
      });
      toast({ title: '✅ تمت إضافة المصروف' });
      setForm(empty);
      setOpen(false);
      load();
    } catch (e) {
      toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl" data-testid="expenses-page">

      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="text-rose-500" /> المصروفات
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            عرض وتسجيل مصروفات المحل — لا يمكن حذف أي مصروف بعد إدخاله
          </p>
        </div>
        {can('admin', 'manager', 'cashier') && (
          <Button
            onClick={() => { setForm(empty); setOpen(true); }}
            className="bg-rose-500 hover:bg-rose-600 text-white flex-shrink-0"
            data-testid="add-expense-btn"
          >
            <Plus className="w-4 h-4 ml-2" /> مصروف جديد
          </Button>
        )}
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-4 text-white">
              <TrendingDown className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">مصروفات اليوم</p>
              <p className="text-2xl font-bold">{fmt(todayTotal)} <span className="text-sm">ر.ي</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-orange-500 to-amber-600 p-4 text-white">
              <Calendar className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">مصروفات الشهر</p>
              <p className="text-2xl font-bold">{fmt(monthTotal)} <span className="text-sm">ر.ي</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-slate-600 to-slate-700 p-4 text-white">
              <BarChart3 className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">إجمالي الفترة المعروضة</p>
              <p className="text-2xl font-bold">{fmt(grandTotal)} <span className="text-sm">ر.ي</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Date filter ─── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">تصفية بالتاريخ</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <Button onClick={applyFilter} className="bg-amber-500 hover:bg-amber-600 text-white">
              عرض النتائج
            </Button>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setPreset(today, today)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 hover:border-amber-300 transition-colors">
                اليوم
              </button>
              <button onClick={() => setPreset(firstOfMonth, today)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 hover:border-amber-300 transition-colors">
                هذا الشهر
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Daily Summary Table ─── */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-rose-500" />
          ملخص المصروفات اليومية
          {dateFrom === dateTo
            ? ` — يوم ${dateFrom}`
            : ` — من ${dateFrom} إلى ${dateTo}`}
        </h2>

        {loading ? (
          <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
        ) : byDay.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
            <Wallet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-slate-400">لا توجد مصروفات في هذه الفترة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {byDay.map((day) => {
              const isOpen = expandedDay === day.date;
              return (
                <Card key={day.date} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* ─── Day header (clickable to expand) ─── */}
                  <button
                    className="w-full"
                    onClick={() => setExpandedDay(isOpen ? null : day.date)}
                  >
                    <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-l from-rose-50 to-transparent hover:from-rose-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-5 h-5 text-rose-600" />
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 text-base">
                            {new Date(day.date + 'T00:00:00').toLocaleDateString('ar-EG', {
                              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                            })}
                          </p>
                          <p className="text-xs text-slate-500">{day.count} عملية مصروف</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <p className="text-xs text-slate-500">إجمالي اليوم</p>
                          <p className="text-xl font-extrabold text-rose-600">{fmt(day.total)} ر.ي</p>
                        </div>
                        {isOpen
                          ? <ChevronUp className="w-5 h-5 text-slate-400" />
                          : <ChevronDown className="w-5 h-5 text-slate-400" />}
                      </div>
                    </div>
                  </button>

                  {/* ─── Expanded detail rows ─── */}
                  {isOpen && (
                    <div className="border-t">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-4 py-2 text-right font-medium">الفئة</th>
                            <th className="px-4 py-2 text-right font-medium">الوصف</th>
                            <th className="px-4 py-2 text-right font-medium">المدفوع إلى</th>
                            <th className="px-4 py-2 text-right font-medium">طريقة الدفع</th>
                            <th className="px-4 py-2 text-left font-medium">المبلغ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {day.rows.map((e) => (
                            <tr key={e.id} className="border-t hover:bg-rose-50/30 transition-colors">
                              <td className="px-4 py-2.5">
                                <span className="bg-rose-100 text-rose-700 text-xs px-2 py-0.5 rounded-full">
                                  {e.category_name || 'غير مصنّف'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-700">{e.description || '—'}</td>
                              <td className="px-4 py-2.5 text-slate-600 text-xs">{e.paid_to || '—'}</td>
                              <td className="px-4 py-2.5 text-slate-500 text-xs">
                                {PAYMENT_LABELS[e.payment_method] || e.payment_method}
                              </td>
                              <td className="px-4 py-2.5 font-bold text-rose-600 text-left">
                                {fmt(e.amount)} ر.ي
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 bg-rose-50">
                            <td colSpan={4} className="px-4 py-2.5 font-bold text-slate-800">
                              إجمالي {day.date}
                            </td>
                            <td className="px-4 py-2.5 font-extrabold text-rose-700 text-left text-base">
                              {fmt(day.total)} ر.ي
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}

            {/* Grand total row */}
            {byDay.length > 1 && (
              <div className="flex items-center justify-between bg-gradient-to-l from-rose-600 to-rose-700 text-white rounded-xl px-5 py-4 shadow-lg">
                <span className="font-bold">الإجمالي الكلي للفترة ({byDay.length} يوم — {items.length} عملية)</span>
                <span className="text-2xl font-extrabold">{fmt(grandTotal)} ر.ي</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Add Expense Dialog ─── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إضافة مصروف جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المبلغ <span className="text-rose-500">*</span></Label>
                <Input
                  type="number" step="0.01" min="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  data-testid="expense-amount-input"
                />
              </div>
              <div>
                <Label>تاريخ المصروف</Label>
                <Input
                  type="date" value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>الفئة</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger data-testid="expense-category-select">
                  <SelectValue placeholder="اختر فئة (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الوصف</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="وصف المصروف..."
              />
            </div>
            <div>
              <Label>المدفوع إلى</Label>
              <Input
                value={form.paid_to}
                onChange={(e) => setForm({ ...form, paid_to: e.target.value })}
                placeholder="اسم المورد أو الجهة المستفيدة"
              />
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقداً</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} className="bg-rose-500 hover:bg-rose-600 text-white" data-testid="save-expense-btn">
              حفظ المصروف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;
