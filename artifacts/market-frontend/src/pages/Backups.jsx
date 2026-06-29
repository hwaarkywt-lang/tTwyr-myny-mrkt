import React, { useEffect, useState } from 'react';
import {
  Database, Download, Play, RefreshCw, ShieldCheck, Trash2, Upload,
  Clock, HardDrive, AlertTriangle, Loader2,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import api, { formatApiError } from '../lib/api';
import { toast } from '../hooks/use-toast';

const formatAge = (s) => {
  if (s == null) return '—';
  if (s < 60) return `قبل ${s} ثانية`;
  if (s < 3600) return `قبل ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} ساعة`;
  return `قبل ${Math.floor(s / 86400)} يوم`;
};

export default function Backups() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [restoreOf, setRestoreOf] = useState(null);    // filename being restored
  const [restorePw, setRestorePw] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [deletingName, setDeletingName] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.get('/admin/backups'),
        api.get('/admin/backups/status'),
      ]);
      setList(a.data || []);
      setStatus(b.data || null);
    } catch (e) {
      toast({ title: 'خطأ في التحميل', description: formatApiError(e), variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runBackup = async () => {
    setRunning(true);
    try {
      const { data } = await api.post('/admin/backups/run');
      toast({ title: data.detail || 'تم بنجاح' });
      await load();
    } catch (e) {
      toast({ title: 'فشل', description: formatApiError(e), variant: 'destructive' });
    }
    setRunning(false);
  };

  const download = async (name) => {
    try {
      const r = await api.get(`/admin/backups/download/${name}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'تعذر التنزيل', description: formatApiError(e), variant: 'destructive' });
    }
  };

  const deleteBackup = async (name) => {
    if (deletingName) return;
    setDeletingName(name);
    try {
      await api.delete(`/admin/backups/${name}`);
      toast({ title: 'تم الحذف', description: name });
      await load();
    } catch (e) {
      toast({ title: 'فشل الحذف', description: formatApiError(e), variant: 'destructive' });
    }
    setDeletingName(null);
  };

  const runRestore = async () => {
    if (restoreConfirm !== 'RESTORE_DATABASE') {
      toast({ title: 'عبارة التأكيد غير صحيحة', variant: 'destructive' });
      return;
    }
    setRestoreBusy(true);
    try {
      const { data } = await api.post(`/admin/backups/restore/${restoreOf}`, {
        confirm: restoreConfirm,
        current_password: restorePw,
      });
      toast({
        title: '✅ تمت الاستعادة',
        description: `نسخة أمان: ${data.safety_backup_created || '—'} — سيتم تسجيل الخروج`,
      });
      setRestoreOf(null);
      setRestorePw('');
      setRestoreConfirm('');
      setTimeout(() => {
        localStorage.removeItem('mm_token');
        localStorage.removeItem('mm_user');
        window.location.href = '/';
      }, 2000);
    } catch (e) {
      toast({ title: 'فشل الاستعادة', description: formatApiError(e), variant: 'destructive' });
    }
    setRestoreBusy(false);
  };

  return (
    <div className="p-6 space-y-6" dir="rtl" data-testid="backups-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="text-cyan-500" /> النسخ الاحتياطية
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            جدولة تلقائية كل 24 ساعة + تشغيل يدوي + استعادة + تنزيل
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading} data-testid="refresh-backups-btn">
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </Button>
          <Button onClick={runBackup} disabled={running} className="bg-cyan-500 hover:bg-cyan-600 text-white"
                  data-testid="run-backup-btn">
            {running ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Play className="w-4 h-4 ml-1" />}
            {running ? 'جارٍ الإنشاء...' : 'نسخة احتياطية الآن'}
          </Button>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs text-emerald-700 font-medium">آخر نسخة احتياطية</p>
              <p className="font-bold text-emerald-900" data-testid="latest-backup-age">
                {status?.latest ? formatAge(status.latest.age_seconds) : 'لا توجد'}
              </p>
              {status?.latest && (
                <p className="text-[11px] text-emerald-700/80 font-mono mt-0.5">{status.latest.name}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-cyan-200 bg-cyan-50">
          <CardContent className="p-4 flex items-center gap-3">
            <HardDrive className="w-8 h-8 text-cyan-600 shrink-0" />
            <div>
              <p className="text-xs text-cyan-700 font-medium">إجمالي النسخ</p>
              <p className="font-bold text-cyan-900 text-2xl" data-testid="backup-count">{status?.count ?? 0}</p>
              <p className="text-[11px] text-cyan-700/80">{status?.total_size_human || '0 B'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs text-amber-700 font-medium">الجدولة الحالية</p>
              <p className="font-bold text-amber-900">{status?.schedule || 'كل 24 ساعة'}</p>
              <p className="text-[11px] text-amber-700/80">يُحتفظ بآخر {status?.retention_days ?? 14} نسخة</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Restore dialog (inline) */}
      {restoreOf && (
        <Card className="border-rose-300 border-2 bg-rose-50/50" data-testid="restore-dialog">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-2 text-rose-900 font-semibold">
              <AlertTriangle className="w-5 h-5 mt-0.5" />
              استعادة قاعدة البيانات من: <code className="font-mono text-sm bg-white px-2 py-0.5 rounded">{restoreOf}</code>
            </div>
            <p className="text-sm text-rose-800">
              ⚠️ ستُستبدل قاعدة البيانات الحالية بالكامل بمحتويات هذه النسخة. سيتم إنشاء نسخة أمان تلقائية من
              القاعدة الحالية قبل البدء. ستحتاج لتسجيل الدخول من جديد بعد الانتهاء.
            </p>
            <div>
              <Label className="text-sm">عبارة التأكيد: <code className="bg-white px-1.5 rounded">RESTORE_DATABASE</code></Label>
              <Input value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)}
                     placeholder="RESTORE_DATABASE" dir="ltr" className="font-mono"
                     data-testid="restore-confirm-input" />
            </div>
            <div>
              <Label className="text-sm">كلمة المرور الحالية</Label>
              <Input type="password" value={restorePw} onChange={(e) => setRestorePw(e.target.value)}
                     autoComplete="new-password" dir="ltr" data-testid="restore-password-input" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="destructive" onClick={runRestore} disabled={restoreBusy}
                      data-testid="confirm-restore-btn">
                {restoreBusy ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Upload className="w-4 h-4 ml-1" />}
                استعادة الآن
              </Button>
              <Button variant="outline" onClick={() => { setRestoreOf(null); setRestorePw(''); setRestoreConfirm(''); }}
                      disabled={restoreBusy}>
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backups table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-right">اسم الملف</th>
                <th className="px-4 py-3 text-right">الحجم</th>
                <th className="px-4 py-3 text-right">تاريخ الإنشاء</th>
                <th className="px-4 py-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={4} className="text-center py-6 text-slate-400">جارٍ التحميل...</td></tr>
              )}
              {!loading && list.length === 0 && (
                <tr><td colSpan={4} className="text-center py-6 text-slate-400">لا توجد نسخ احتياطية بعد</td></tr>
              )}
              {list.map((b) => (
                <tr key={b.name} className="border-t hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-xs">{b.name}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{b.size_human}</Badge></td>
                  <td className="px-4 py-3 text-xs">{new Date(b.created_at).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-3 flex gap-1.5 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => download(b.name)}
                            data-testid={`download-${b.name}`}>
                      <Download className="w-4 h-4 ml-1" /> تنزيل
                    </Button>
                    <Button size="sm" variant="outline"
                            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                            onClick={() => setRestoreOf(b.name)}
                            data-testid={`restore-${b.name}`}>
                      <Upload className="w-4 h-4 ml-1" /> استعادة
                    </Button>
                    <Button size="sm" variant="outline"
                            className="border-rose-300 text-rose-700 hover:bg-rose-50"
                            disabled={deletingName === b.name}
                            onClick={() => {
                              if (window.confirm(`حذف النسخة ${b.name}؟ لا يمكن التراجع.`)) deleteBackup(b.name);
                            }}
                            data-testid={`delete-${b.name}`}>
                      {deletingName === b.name
                        ? <Loader2 className="w-4 h-4 ml-1 animate-spin" />
                        : <Trash2 className="w-4 h-4 ml-1" />}
                      حذف
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
