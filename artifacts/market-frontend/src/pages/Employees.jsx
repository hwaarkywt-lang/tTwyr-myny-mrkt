import React, { useEffect, useState } from 'react';
import { Plus, UserCircle, Shield, Trash2 } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const roleLabels = {
  admin: 'مدير', manager: 'مشرف', cashier: 'كاشير',
};
const roleColors = {
  admin: 'bg-rose-100 text-rose-700',
  manager: 'bg-blue-100 text-blue-700',
  cashier: 'bg-emerald-100 text-emerald-700',
};

const Employees = () => {
  const { user: me } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const empty = { username: '', email: '', full_name: '', password: '', role: 'cashier', phone: '' };
  const [form, setForm] = useState(empty);

  const load = async () => {
    try { setItems((await api.get('/users')).data); }
    catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post('/auth/register', form);
      toast({ title: 'تمت إضافة الموظف' });
      setForm(empty); setOpen(false); load();
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const del = async (u) => {
    if (!window.confirm(`حذف الموظف "${u.full_name}"؟`)) return;
    try { await api.delete(`/users/${u.id}`); toast({ title: 'تم الحذف' }); load(); }
    catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="employees-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">الموظفون</h1>
          <p className="text-slate-500">{items.length} موظف</p>
        </div>
        <Button onClick={() => { setForm(empty); setOpen(true); }}
          className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="add-employee-btn">
          <Plus className="w-4 h-4 ml-2" /> موظف جديد
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-right">الاسم</th>
                <th className="px-4 py-3 text-right">المستخدم</th>
                <th className="px-4 py-3 text-right">البريد</th>
                <th className="px-4 py-3 text-right">الدور</th>
                <th className="px-4 py-3 text-right">الحالة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan="6" className="text-center py-12">
                  <UserCircle className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-400">لا يوجد موظفون</p>
                </td></tr>
              )}
              {items.map((u) => (
                <tr key={u.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium flex items-center gap-2">
                    {u.role === 'admin' && <Shield className="w-4 h-4 text-rose-500" />}
                    {u.full_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.username}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3"><Badge className={roleColors[u.role]}>{roleLabels[u.role]}</Badge></td>
                  <td className="px-4 py-3">
                    {u.is_active
                      ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">نشط</Badge>
                      : <Badge variant="secondary">معطل</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {u.id !== me?.id && (
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => del(u)}>
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
          <DialogHeader><DialogTitle>موظف جديد</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>الاسم الكامل</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="employee-name-input" /></div>
            <div><Label>اسم المستخدم</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} data-testid="employee-username-input" /></div>
            <div><Label>البريد الإلكتروني</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="employee-email-input" /></div>
            <div><Label>الهاتف</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>كلمة المرور</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="employee-password-input" /></div>
            <div className="col-span-2"><Label>الدور</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="employee-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">مشرف</SelectItem>
                  <SelectItem value="cashier">كاشير</SelectItem>
                  {me?.role === 'admin' && <SelectItem value="admin">مدير</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="save-employee-btn">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Employees;
