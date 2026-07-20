import React, { useEffect, useState, useCallback } from 'react';
import {
  Database, Download, Play, RefreshCw, ShieldCheck, Trash2, Upload,
  Clock, HardDrive, AlertTriangle, Loader2, Settings, CheckCircle2,
  XCircle, CloudOff, Calendar, Zap, RotateCcw, Info, ChevronDown, ChevronUp,
  Cloud,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import api, { formatApiError } from '../lib/api';
import { toast } from '../hooks/use-toast';

// ── helpers ───────────────────────────────────────────────────────────────────
const formatAge = (s) => {
  if (s == null) return '—';
  if (s < 60)    return `قبل ${s} ثانية`;
  if (s < 3600)  return `قبل ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} ساعة`;
  return `قبل ${Math.floor(s / 86400)} يوم`;
};
const fmtDate = (s) => s ? new Date(s).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtNext = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  const mins = Math.round((d - Date.now()) / 60000);
  if (mins <= 0) return 'قريباً';
  if (mins < 60) return `بعد ${mins} دقيقة`;
  return `بعد ${Math.floor(mins / 60)} ساعة ${mins % 60 > 0 ? `و ${mins % 60} دقيقة` : ''}`;
};

const TRIGGER_META = {
  manual: { label: 'يدوي',    color: 'bg-slate-100 text-slate-700 border-slate-300' },
  auto:   { label: 'تلقائي',  color: 'bg-blue-100 text-blue-700 border-blue-300' },
  daily:  { label: 'يومي',    color: 'bg-purple-100 text-purple-700 border-purple-300' },
  safety: { label: 'أمان',    color: 'bg-amber-100 text-amber-700 border-amber-300' },
};

const INTERVAL_OPTIONS = [
  { value: 1,  label: 'كل ساعة' },
  { value: 2,  label: 'كل ساعتين' },
  { value: 4,  label: 'كل 4 ساعات' },
  { value: 6,  label: 'كل 6 ساعات' },
  { value: 12, label: 'كل 12 ساعة' },
  { value: 24, label: 'يومياً' },
];

// ── component ─────────────────────────────────────────────────────────────────
export default function Backups() {
  const [list,          setList]          = useState([]);
  const [status,        setStatus]        = useState(null);
  const [settings,      setSettings]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [running,       setRunning]       = useState(false);
  const [savingSettings,setSavingSettings]= useState(false);
  const [showSettings,  setShowSettings]  = useState(false);

  // local settings form state
  const [localInterval, setLocalInterval] = useState(2);
  const [midnightOn,    setMidnightOn]    = useState(true);
  const [retention,     setRetention]     = useState(30);

  // restore dialog
  const [restoreOf,      setRestoreOf]      = useState(null);
  const [restorePw,      setRestorePw]      = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoreBusy,    setRestoreBusy]    = useState(false);

  // delete state
  const [deletingName, setDeletingName] = useState(null);

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        api.get('/admin/backups'),
        api.get('/admin/backups/status'),
        api.get('/admin/backups/settings'),
      ]);
      setList(a.data || []);
      setStatus(b.data || null);
      const s = c.data || {};
      setSettings(s);
      setLocalInterval(s.local_interval_hours ?? 2);
      setMidnightOn(s.daily_midnight ?? true);
      setRetention(s.retention_count ?? 30);
    } catch (e) {
      toast({ title: 'خطأ في التحميل', description: formatApiError(e), variant: 'destructive' });
    }
    if (!quiet) setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [load]);

  // ── actions ───────────────────────────────────────────────────────────────
  const runBackup = async () => {
    setRunning(true);
    try {
      const { data } = await api.post('/admin/backups/run');
      toast({ title: data.detail || '✅ تم إنشاء النسخة' });
      await load(true);
    } catch (e) {
      toast({ title: 'فشل إنشاء النسخة', description: formatApiError(e), variant: 'destructive' });
    }
    setRunning(false);
  };

  const download = async (name) => {
    try {
      const r = await api.get(`/admin/backups/download/${name}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast({ title: '✅ تم التنزيل', description: name });
    } catch (e) {
      toast({ title: 'تعذر التنزيل', description: formatApiError(e), variant: 'destructive' });
    }
  };

  const deleteBackup = async (name) => {
    if (deletingName) return;
    setDeletingName(name);
    try {
      await api.delete(`/admin/backups/${name}`);
      toast({ title: '🗑️ تم الحذف', description: name });
      await load(true);
    } catch (e) {
      toast({ title: 'فشل الحذف', description: formatApiError(e), variant: 'destructive' });
    }
    setDeletingName(null);
  };

  const runRestore = async () => {
    if (restoreConfirm !== 'RESTORE_DATABASE') {
      toast({ title: 'عبارة التأكيد غير صحيحة', variant: 'destructive' }); return;
    }
    setRestoreBusy(true);
    try {
      const { data } = await api.post(`/admin/backups/restore/${restoreOf}`, {
        confirm: restoreConfirm, current_password: restorePw,
      });
      toast({ title: '✅ تمت الاستعادة', description: `نسخة أمان: ${data.safety_backup_created || '—'}` });
      setRestoreOf(null); setRestorePw(''); setRestoreConfirm('');
      setTimeout(() => {
        localStorage.removeItem('mm_token'); localStorage.removeItem('mm_user');
        window.location.href = '/';
      }, 2000);
    } catch (e) {
      toast({ title: 'فشل الاستعادة', description: formatApiError(e), variant: 'destructive' });
    }
    setRestoreBusy(false);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put('/admin/backups/settings', {
        local_interval_hours: localInterval,
        daily_midnight: midnightOn,
        retention_count: retention,
        drive_enabled: settings?.drive_enabled ?? false,
        drive_interval_hours: settings?.drive_interval_hours ?? 4,
      });
      toast({ title: '✅ تم حفظ الإعدادات' });
      await load(true);
    } catch (e) {
      toast({ title: 'فشل الحفظ', description: formatApiError(e), variant: 'destructive' });
    }
    setSavingSettings(false);
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl" data-testid="backups-page">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-cyan-100 rounded-xl flex items-center justify-center shadow-sm">
            <Database className="w-6 h-6 text-cyan-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">النسخ الاحتياطية</h1>
            <p className="text-slate-500 text-sm">
              {status?.scheduler_running
                ? `جدولة تلقائية نشطة — ${status.schedule}`
                : 'يدوي — الجدولة التلقائية غير نشطة'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => load()} disabled={loading} data-testid="refresh-backups-btn">
            <RefreshCw className={`w-4 h-4 ml-1.5 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </Button>
          <Button variant="outline" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="w-4 h-4 ml-1.5" />
            الإعدادات
            {showSettings ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          </Button>
          <Button
            onClick={runBackup}
            disabled={running}
            className="bg-cyan-600 hover:bg-cyan-700 text-white gap-1.5"
            data-testid="run-backup-btn"
          >
            {running
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />}
            {running ? 'جارٍ الإنشاء…' : 'إنشاء نسخة الآن'}
          </Button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {status?.last_auto_error && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-800 text-sm">فشل آخر نسخة تلقائية</p>
            <p className="text-rose-700 text-xs mt-0.5 font-mono">{status.last_auto_error}</p>
          </div>
        </div>
      )}

      {/* ── Status Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Scheduler status */}
        <Card className={`border-2 ${status?.scheduler_running ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <CardContent className="p-4 flex items-center gap-3">
            {status?.scheduler_running
              ? <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
              : <XCircle className="w-8 h-8 text-rose-600 flex-shrink-0" />}
            <div className="min-w-0">
              <p className={`text-xs font-semibold ${status?.scheduler_running ? 'text-emerald-700' : 'text-rose-700'}`}>
                الجدولة التلقائية
              </p>
              <p className={`font-bold text-sm ${status?.scheduler_running ? 'text-emerald-900' : 'text-rose-900'}`}>
                {status?.scheduler_running ? 'نشطة ✓' : 'متوقفة'}
              </p>
              <p className="text-[10px] text-slate-500 truncate mt-0.5">{status?.schedule || '—'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Last backup */}
        <Card className="border-2 border-cyan-200 bg-cyan-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-cyan-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-cyan-700">آخر نسخة</p>
              <p className="font-bold text-cyan-900 text-sm" data-testid="latest-backup-age">
                {status?.latest ? formatAge(status.latest.age_seconds) : 'لا توجد'}
              </p>
              <p className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">
                {status?.latest?.name?.replace('market_db_', '').replace('.json.gz', '') || '—'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Next backup */}
        <Card className="border-2 border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Zap className="w-8 h-8 text-amber-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-700">النسخة القادمة</p>
              <p className="font-bold text-amber-900 text-sm">
                {fmtNext(status?.next_backup_local)}
              </p>
              {status?.next_backup_daily && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  <Calendar className="w-2.5 h-2.5 inline ml-0.5" />
                  يومية: {fmtNext(status.next_backup_daily)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Count / size */}
        <Card className="border-2 border-slate-200 bg-slate-50">
          <CardContent className="p-4 flex items-center gap-3">
            <HardDrive className="w-8 h-8 text-slate-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-slate-600">إجمالي النسخ</p>
              <p className="font-bold text-slate-900 text-2xl" data-testid="backup-count">{status?.count ?? 0}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {status?.total_size_human || '0 B'} • آخر {status?.retention_count ?? 30} محفوظة
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Google Drive card ── */}
      <Card className="border-2 border-dashed border-slate-300 bg-slate-50/50">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center shadow-sm flex-shrink-0">
            <Cloud className="w-5 h-5 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-700">Google Drive — غير مربوط</p>
            <p className="text-sm text-slate-500 mt-0.5">
              لتفعيل الرفع التلقائي إلى Google Drive، يرجى تفعيل التكامل من لوحة Replit ثم ضبط الإعدادات.
            </p>
          </div>
          <Badge className="bg-slate-100 text-slate-500 border border-slate-300 flex-shrink-0">قريباً</Badge>
        </CardContent>
      </Card>

      {/* ── Settings panel ── */}
      {showSettings && settings && (
        <Card className="border-2 border-blue-200">
          <CardContent className="p-5">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-600" /> إعدادات الجدولة التلقائية
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Local interval */}
              <div>
                <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                  التكرار التلقائي المحلي
                </Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {INTERVAL_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setLocalInterval(value)}
                      className={`text-sm rounded-lg border px-3 py-2 text-right transition-all
                        ${localInterval === value
                          ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Daily midnight toggle */}
              <div>
                <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                  نسخة يومية منتصف الليل
                </Label>
                <button
                  onClick={() => setMidnightOn(!midnightOn)}
                  className={`w-full rounded-lg border-2 px-4 py-3 flex items-center gap-3 transition-all
                    ${midnightOn
                      ? 'bg-purple-50 border-purple-300 text-purple-800'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                >
                  <div className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0
                    ${midnightOn ? 'bg-purple-600' : 'bg-slate-300'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all
                      ${midnightOn ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                  <span className="font-semibold text-sm">
                    {midnightOn ? 'مفعّل — كل يوم 12:00 ص' : 'معطّل'}
                  </span>
                </button>
                <p className="text-xs text-slate-400 mt-1.5">
                  {midnightOn
                    ? 'سيتم إنشاء نسخة يومية بغض النظر عن التكرار التلقائي'
                    : 'النسخ فقط عبر التكرار الأعلى'}
                </p>
              </div>

              {/* Retention */}
              <div>
                <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                  الاحتفاظ بـ (عدد النسخ)
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[10, 20, 30, 50, 75, 100].map((v) => (
                    <button
                      key={v}
                      onClick={() => setRetention(v)}
                      className={`text-sm rounded-lg border px-2 py-2 transition-all
                        ${retention === v
                          ? 'bg-slate-800 border-slate-800 text-white font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
                        }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  النسخ الأقدم تُحذف تلقائياً عند تجاوز الحد
                </p>
              </div>
            </div>

            <div className="flex justify-end mt-5 pt-4 border-t">
              <Button onClick={saveSettings} disabled={savingSettings} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {savingSettings ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Restore dialog ── */}
      {restoreOf && (
        <Card className="border-2 border-rose-300 bg-rose-50/60" data-testid="restore-dialog">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-2 text-rose-900 font-semibold">
              <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span>
                استعادة من:
                <code className="font-mono text-sm bg-white px-2 py-0.5 rounded mx-1 border border-rose-200">
                  {restoreOf}
                </code>
              </span>
            </div>
            <div className="bg-rose-100 rounded-lg p-3 text-sm text-rose-800 flex gap-2">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                ستُستبدل قاعدة البيانات الحالية بالكامل. سيتم إنشاء نسخة أمان تلقائية الآن قبل البدء.
                ستحتاج لتسجيل الدخول مجدداً بعد الاستعادة.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">
                  عبارة التأكيد: <code className="bg-white px-1.5 rounded border text-rose-700">RESTORE_DATABASE</code>
                </Label>
                <Input value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)}
                       placeholder="RESTORE_DATABASE" dir="ltr" className="font-mono mt-1"
                       data-testid="restore-confirm-input" />
              </div>
              <div>
                <Label className="text-sm">كلمة المرور الحالية</Label>
                <Input type="password" value={restorePw} onChange={(e) => setRestorePw(e.target.value)}
                       autoComplete="new-password" dir="ltr" className="mt-1"
                       data-testid="restore-password-input" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="destructive" onClick={runRestore} disabled={restoreBusy}
                      data-testid="confirm-restore-btn">
                {restoreBusy ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <RotateCcw className="w-4 h-4 ml-1" />}
                {restoreBusy ? 'جارٍ الاستعادة…' : 'استعادة الآن'}
              </Button>
              <Button variant="outline"
                      onClick={() => { setRestoreOf(null); setRestorePw(''); setRestoreConfirm(''); }}
                      disabled={restoreBusy}>
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Backups table ── */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-4 py-3 text-right font-semibold">اسم الملف</th>
                <th className="px-4 py-3 text-center font-semibold">النوع</th>
                <th className="px-4 py-3 text-center font-semibold">الحجم</th>
                <th className="px-4 py-3 text-center font-semibold">تاريخ الإنشاء</th>
                <th className="px-4 py-3 text-center font-semibold">Google Drive</th>
                <th className="px-4 py-3 text-center font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">
                  <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin opacity-40" />
                  <p>جارٍ التحميل…</p>
                </td></tr>
              )}
              {!loading && list.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">
                  <Database className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p>لا توجد نسخ احتياطية بعد — اضغط "إنشاء نسخة الآن"</p>
                </td></tr>
              )}
              {list.map((b, i) => {
                const tm = TRIGGER_META[b.trigger] || TRIGGER_META.manual;
                return (
                  <tr key={b.name}
                      className={`border-t transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-blue-50/30`}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {b.name.replace('market_db_', '').replace('.json.gz', '')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full border font-semibold ${tm.color}`}>
                        {tm.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="text-xs">{b.size_human}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600">{fmtDate(b.created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="flex items-center justify-center gap-1 text-xs text-slate-400">
                        <CloudOff className="w-3.5 h-3.5" /> غير مربوط
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap justify-center">
                        <Button size="sm" variant="outline" onClick={() => download(b.name)}
                                className="text-xs h-7 px-2" data-testid={`download-${b.name}`}>
                          <Download className="w-3.5 h-3.5 ml-1" /> تنزيل
                        </Button>
                        {b.name.endsWith('.json.gz') && (
                          <Button size="sm" variant="outline"
                                  className="text-xs h-7 px-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                                  onClick={() => setRestoreOf(b.name)}
                                  data-testid={`restore-${b.name}`}>
                            <RotateCcw className="w-3.5 h-3.5 ml-1" /> استعادة
                          </Button>
                        )}
                        <Button size="sm" variant="outline"
                                className="text-xs h-7 px-2 border-rose-300 text-rose-700 hover:bg-rose-50"
                                disabled={deletingName === b.name}
                                onClick={() => {
                                  if (window.confirm(`حذف النسخة؟\n${b.name}\n\nلا يمكن التراجع.`)) deleteBackup(b.name);
                                }}
                                data-testid={`delete-${b.name}`}>
                          {deletingName === b.name
                            ? <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5 ml-1" />}
                          حذف
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Info footer ── */}
      <p className="text-xs text-slate-400 text-center">
        النسخ محفوظة في <code className="bg-slate-100 px-1 rounded">data/backups/</code> داخل الخادم
        • يُحتفظ بآخر {status?.retention_count ?? 30} نسخة • تحديث تلقائي كل 30 ثانية
      </p>
    </div>
  );
}
