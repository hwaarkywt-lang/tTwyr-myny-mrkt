import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Settings as SettingsIcon, Cloud, Shield, Bell, Database,
  AlertTriangle, ShieldCheck, Power, Trash2, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from '../hooks/use-toast';
import api from '../lib/api';

const SystemModeCard = ({ mode, onChanged }) => {
  const [saving, setSaving] = useState(false);

  const flip = async (next) => {
    if (next === mode) return;
    if (next === 'production') {
      toast({
        title: 'استخدم "تفعيل التشغيل الحقيقي"',
        description: 'الانتقال للإنتاج يتطلب تأكيد كلمة المرور وإعدادات إضافية بالأسفل',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const r = await api.patch('/admin/system/mode', { mode: next });
      toast({ title: 'تم التحديث', description: `الوضع الحالي: ${r.data.mode}` });
      onChanged(r.data.mode);
    } catch (e) {
      toast({ title: 'فشل', description: e.response?.data?.detail || 'خطأ', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="system-mode-card" className={mode === 'production' ? 'border-emerald-500 border-2' : 'border-amber-400 border'}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              mode === 'production' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              <Power className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">وضع النظام</h3>
              <p className="text-sm text-slate-500 mt-1">
                {mode === 'production'
                  ? 'النظام يعمل في وضع التشغيل الحقيقي — الحسابات التجريبية مخفية والبيانات الوهمية ممنوعة.'
                  : 'النظام في وضع الاختبار — تظهر الحسابات التجريبية على شاشة الدخول. استخدم زر "تفعيل التشغيل الحقيقي" بالأسفل للانتقال.'}
              </p>
              <span className={`inline-block mt-2 px-2.5 py-0.5 text-xs font-semibold rounded ${
                mode === 'production' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
              }`} data-testid="current-mode-badge">
                {mode === 'production' ? '🟢 تشغيل حقيقي' : '🟡 اختبار'}
              </span>
            </div>
          </div>
          {mode === 'production' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => flip('test')}
              disabled={saving}
              data-testid="switch-to-test-btn"
            >
              عودة لوضع الاختبار
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const ResetDemoDataCard = () => {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (confirm !== 'DELETE_ALL_DEMO_DATA') {
      toast({ title: 'عبارة التأكيد غير صحيحة', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/admin/system/reset-demo-data', { confirm });
      toast({
        title: '✅ تم المسح',
        description: `نسخة احتياطية: ${r.data.backup_created || '—'} | جداول: ${r.data.tables_truncated}`,
      });
      setOpen(false);
      setConfirm('');
    } catch (e) {
      toast({ title: 'فشل', description: e.response?.data?.detail || 'خطأ', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-rose-300 border-2" data-testid="reset-demo-card">
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
            <Trash2 className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 text-lg">مسح البيانات التجريبية</h3>
            <p className="text-sm text-slate-500 mt-1">
              يحذف جميع: المنتجات، العملاء، التجار، الفواتير، المبيعات، المرتجعات، المصروفات، حركات المخزون، السجلات.
              <br/>
              <span className="font-semibold text-emerald-700">يتم إنشاء نسخة احتياطية تلقائياً قبل المسح.</span>
              <br/>
              <span className="text-rose-700">لا يحذف: المستخدمين، تصنيفات المصروفات، إعدادات النظام.</span>
            </p>
            {!open ? (
              <Button
                variant="destructive"
                className="mt-3"
                onClick={() => setOpen(true)}
                data-testid="open-reset-demo-btn"
              >
                <Trash2 className="w-4 h-4 ml-2" /> بدء المسح
              </Button>
            ) : (
              <div className="mt-3 space-y-2 p-3 bg-rose-50 rounded-lg border border-rose-200">
                <Label className="text-sm font-medium text-rose-900">
                  للتأكيد، اكتب: <code className="bg-white px-2 py-0.5 rounded font-mono">DELETE_ALL_DEMO_DATA</code>
                </Label>
                <Input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="DELETE_ALL_DEMO_DATA"
                  data-testid="reset-confirm-input"
                  dir="ltr"
                  className="text-left font-mono"
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={run}
                    disabled={busy || confirm !== 'DELETE_ALL_DEMO_DATA'}
                    data-testid="confirm-reset-btn"
                  >
                    {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Trash2 className="w-4 h-4 ml-2" />}
                    مسح نهائياً
                  </Button>
                  <Button variant="outline" onClick={() => { setOpen(false); setConfirm(''); }}>
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ActivateProductionCard = ({ mode, onActivated }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    current_password: '',
    new_username: '',
    new_email: '',
    new_full_name: '',
    new_password: '',
    new_password_confirm: '',
    wipe_business_data: true,
    remove_demo_accounts: true,
  });

  const submit = async () => {
    if (form.new_password !== form.new_password_confirm) {
      toast({ title: 'كلمتا المرور غير متطابقتين', variant: 'destructive' });
      return;
    }
    if (form.new_password.length < 8) {
      toast({ title: 'كلمة المرور قصيرة جداً (8 على الأقل)', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/admin/system/activate-production', {
        current_password: form.current_password,
        new_username: form.new_username.trim(),
        new_email: form.new_email.trim(),
        new_full_name: form.new_full_name.trim(),
        new_password: form.new_password,
        wipe_business_data: form.wipe_business_data,
        remove_demo_accounts: form.remove_demo_accounts,
      });
      toast({
        title: '🎉 تم تفعيل التشغيل الحقيقي',
        description: `المالك: ${r.data.owner_username} | نسخة احتياطية: ${r.data.backup_created}`,
      });
      onActivated();
      setOpen(false);
      // Force re-login since credentials changed
      setTimeout(() => {
        localStorage.removeItem('mm_token');
        localStorage.removeItem('mm_user');
        window.location.href = '/';
      }, 1800);
    } catch (e) {
      toast({ title: 'فشل', description: e.response?.data?.detail || 'خطأ', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'production') {
    return (
      <Card className="border-emerald-300 bg-emerald-50/40" data-testid="production-active-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-600" />
            <div>
              <h3 className="font-bold text-slate-900">وضع التشغيل الحقيقي مُفعّل</h3>
              <p className="text-sm text-slate-600">الحسابات التجريبية مخفية والبيانات الوهمية ممنوعة.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-indigo-300 border-2" data-testid="activate-prod-card">
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Power className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 text-lg">تفعيل وضع التشغيل الحقيقي</h3>
            <p className="text-sm text-slate-500 mt-1">
              يقوم بـ: (1) نسخة احتياطية كاملة، (2) مسح البيانات التجريبية، (3) حذف حسابات (مدير/مشرف/كاشير) الافتراضية،
              (4) تحويل حسابك الحالي إلى بيانات المالك الجديدة، (5) إخفاء الحسابات التجريبية من شاشة الدخول.
            </p>
            {!open ? (
              <Button
                className="mt-4 bg-indigo-600 hover:bg-indigo-700"
                onClick={() => setOpen(true)}
                data-testid="open-activate-prod-btn"
              >
                <Power className="w-4 h-4 ml-2" /> ابدأ التفعيل
              </Button>
            ) : (
              <div className="mt-4 p-4 bg-indigo-50/60 rounded-lg border border-indigo-200 space-y-3">
                <div className="flex items-start gap-2 text-amber-900 bg-amber-50 p-2 rounded text-sm border border-amber-300">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>سيتم تسجيل خروجك تلقائياً بعد التفعيل لإعادة الدخول ببيانات المالك الجديدة. احتفظ بها في مكان آمن!</span>
                </div>

                <div>
                  <Label>كلمة المرور الحالية للتأكيد</Label>
                  <Input type="password" autoComplete="new-password" value={form.current_password}
                         onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                         data-testid="prod-current-pw" dir="ltr" />
                </div>

                <div className="border-t pt-3">
                  <p className="text-sm font-bold text-slate-800 mb-2">بيانات المالك الجديدة:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>اسم المستخدم الجديد</Label>
                      <Input value={form.new_username} placeholder="owner"
                             onChange={(e) => setForm({ ...form, new_username: e.target.value })}
                             data-testid="prod-new-username" dir="ltr" />
                    </div>
                    <div>
                      <Label>البريد الإلكتروني</Label>
                      <Input type="email" value={form.new_email} placeholder="owner@market.com"
                             onChange={(e) => setForm({ ...form, new_email: e.target.value })}
                             data-testid="prod-new-email" dir="ltr" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>الاسم الكامل</Label>
                      <Input value={form.new_full_name} placeholder="اسم المالك"
                             onChange={(e) => setForm({ ...form, new_full_name: e.target.value })}
                             data-testid="prod-new-fullname" />
                    </div>
                    <div>
                      <Label>كلمة المرور الجديدة (8+)</Label>
                      <Input type="password" autoComplete="new-password" value={form.new_password}
                             onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                             data-testid="prod-new-password" dir="ltr" />
                    </div>
                    <div>
                      <Label>تأكيد كلمة المرور</Label>
                      <Input type="password" autoComplete="new-password" value={form.new_password_confirm}
                             onChange={(e) => setForm({ ...form, new_password_confirm: e.target.value })}
                             data-testid="prod-new-password-confirm" dir="ltr" />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.wipe_business_data}
                           onChange={(e) => setForm({ ...form, wipe_business_data: e.target.checked })}
                           data-testid="prod-wipe-data" />
                    مسح جميع البيانات التجريبية (موصى به)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.remove_demo_accounts}
                           onChange={(e) => setForm({ ...form, remove_demo_accounts: e.target.checked })}
                           data-testid="prod-remove-accounts" />
                    حذف حسابات (مشرف / كاشير) الافتراضية
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={submit} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700"
                          data-testid="confirm-activate-prod-btn">
                    {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Power className="w-4 h-4 ml-2" />}
                    تفعيل وضع التشغيل الحقيقي
                  </Button>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>إلغاء</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Settings = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState('test');
  const [loadingMode, setLoadingMode] = useState(true);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) { setLoadingMode(false); return; }
    api.get('/admin/system/mode')
      .then((r) => setMode(r.data.mode))
      .catch(() => {})
      .finally(() => setLoadingMode(false));
  }, [isAdmin]);

  const sections = [
    { icon: Cloud, title: 'المزامنة', desc: 'وضع Offline-First مع طابور مزامنة سحابي', status: 'مُفعّل' },
    { icon: Shield, title: 'الأمان', desc: 'JWT + قفل الحساب بعد 5 محاولات + سجل تدقيق', status: 'مُفعّل' },
    { icon: Database, title: 'قاعدة البيانات', desc: 'PostgreSQL مع Soft Delete + ACID Transactions', status: 'PostgreSQL 15' },
    { icon: Bell, title: 'الإشعارات', desc: 'تنبيهات المخزون المنخفض والمنتجات منتهية الصلاحية', status: 'قريباً' },
  ];

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="settings-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <SettingsIcon className="w-7 h-7 text-amber-600" />
          الإعدادات
        </h1>
        <p className="text-slate-500">إعدادات النظام والحساب ووضع التشغيل</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">معلومات الحساب</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 mb-1">الاسم</p>
              <p className="font-medium" data-testid="account-fullname">{user?.full_name}</p>
            </div>
            <div>
              <p className="text-slate-500 mb-1">البريد</p>
              <p className="font-medium" data-testid="account-email">{user?.email}</p>
            </div>
            <div>
              <p className="text-slate-500 mb-1">اسم المستخدم</p>
              <p className="font-medium" data-testid="account-username">{user?.username}</p>
            </div>
            <div>
              <p className="text-slate-500 mb-1">الدور</p>
              <p className="font-medium">{user?.role}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && !loadingMode && (
        <div className="space-y-4 mb-6">
          <h2 className="text-xl font-bold text-slate-900">إدارة النظام (المالك فقط)</h2>
          <SystemModeCard mode={mode} onChanged={setMode} />
          <ActivateProductionCard mode={mode} onActivated={() => setMode('production')} />
          <ResetDemoDataCard />
        </div>
      )}

      <h2 className="text-xl font-bold text-slate-900 mb-3">حالة الخدمات</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900">{s.title}</h3>
                    <p className="text-sm text-slate-500 mb-2">{s.desc}</p>
                    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
                      {s.status}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Settings;
