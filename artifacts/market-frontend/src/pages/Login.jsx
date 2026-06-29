import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Eye, EyeOff, Store, ShieldCheck, Phone } from 'lucide-react';
import { toast } from '../hooks/use-toast';
import { STORE } from '../config/store';

const API = process.env.REACT_APP_BACKEND_URL;

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('test'); // 'test' | 'production'
  const [storeName, setStoreName] = useState(STORE.name);

  // Fetch public system info to decide whether to show demo buttons.
  useEffect(() => {
    let alive = true;
    axios.get(`${API}/api/system/info`)
      .then((r) => {
        if (!alive) return;
        setMode(r.data?.mode || 'test');
        if (r.data?.store_name) setStoreName(r.data.store_name);
      })
      .catch(() => { /* default to test mode if endpoint unreachable */ });
    return () => { alive = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await login(identifier, password);
    setLoading(false);
    if (result.success) {
      toast({ title: 'تم تسجيل الدخول بنجاح', description: 'مرحباً بك في نظام الميني ماركت' });
      const role = JSON.parse(localStorage.getItem('mm_user') || '{}').role;
      navigate(role === 'cashier' ? '/dashboard/pos' : '/dashboard');
    } else {
      toast({ title: 'فشل تسجيل الدخول', description: result.message, variant: 'destructive' });
    }
  };

  const quickLogin = (id, pw) => { setIdentifier(id); setPassword(pw); };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      dir="rtl"
      style={{ background: 'radial-gradient(circle at 20% 0%, #1e293b 0%, #0f172a 60%, #020617 100%)' }}
    >
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl"
               style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            <Store className="w-10 h-10 text-white" />
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-1" data-testid="login-store-name">{storeName}</h1>
            <p className="text-slate-500 text-sm">نظام إدارة شامل للمبيعات والمخزون والمحاسبة</p>
            <p className="text-amber-600 text-xs mt-2 flex items-center justify-center gap-1" dir="ltr">
              <Phone className="w-3 h-3" /> {STORE.phone}
            </p>
            {mode === 'production' && (
              <span
                data-testid="production-mode-badge"
                className="inline-flex items-center gap-1 mt-3 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-700"
              >
                <ShieldCheck className="w-3 h-3" /> وضع التشغيل الحقيقي
              </span>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
            data-testid="login-form"
            autoComplete="off"
          >
            {/* Hidden honeypot to deter browser autofill */}
            <input type="text" name="prevent_autofill" autoComplete="off" style={{ display: 'none' }} aria-hidden />
            <input type="password" name="prevent_autofill_pw" autoComplete="off" style={{ display: 'none' }} aria-hidden />

            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-slate-700 font-medium">اسم المستخدم</Label>
              <Input
                id="identifier"
                name="login_identifier"
                type="text"
                placeholder="أدخل اسم المستخدم"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="off"
                spellCheck={false}
                className="h-12 text-right"
                dir="rtl"
                data-testid="login-identifier-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-medium">كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="login_password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="h-12 text-right pl-12"
                  dir="rtl"
                  data-testid="login-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  data-testid="toggle-password-visibility"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold text-white shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </Button>

            {mode === 'test' && (
              <div className="pt-4 border-t border-slate-200" data-testid="demo-accounts-section">
                <p className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  حسابات تجريبية (تُخفى في وضع التشغيل الحقيقي):
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: 'مدير', id: 'admin@market.com', pw: 'Admin@2026' },
                    { l: 'مشرف', id: 'manager@market.com', pw: 'Manager@2026' },
                    { l: 'كاشير', id: 'cashier@market.com', pw: 'Cashier@2026' },
                  ].map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => quickLogin(a.id, a.pw)}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-200 hover:border-amber-500 hover:bg-amber-50 text-slate-700 transition-all"
                      data-testid={`quick-login-${a.l}`}
                    >
                      {a.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          © 2026 {storeName} — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
};

export default Login;
