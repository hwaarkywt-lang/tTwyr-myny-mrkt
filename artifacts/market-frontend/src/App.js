import React, { useEffect } from 'react';
import './App.css';
import './print.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/toaster';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SalesDaily from './pages/SalesDaily';
import Sales from './pages/Sales';
import Products from './pages/Products';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Expenses from './pages/Expenses';
import POS from './pages/POS';
import Employees from './pages/Employees';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Purchases from './pages/Purchases';
import SupplierDetail from './pages/SupplierDetail';
import Approvals from './pages/Approvals';
import Returns from './pages/Returns';
import ManagerDashboard from './pages/ManagerDashboard';
import AuditLogs from './pages/AuditLogs';
import DayClose from './pages/DayClose';
import Backups from './pages/Backups';
import StockAlerts from './pages/StockAlerts';

// Layout
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-600">جاري التحميل...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const CashierGuardOrDashboard = () => {
  const { user } = useAuth();
  if (user?.role === 'cashier') return <Navigate to="/dashboard/pos" replace />;
  if (user?.role === 'admin')   return <ManagerDashboard />;  // Advanced financial dashboard for admin
  return <Dashboard />;  // Manager (مشرف): basic dashboard (no profits)
};

const DashboardLayout = ({ children }) => {
  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CashierGuardOrDashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/pos"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <POS />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/sales/daily"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SalesDaily />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/sales"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Sales />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/products"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Products />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/stock-alerts"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <StockAlerts />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/customers"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Customers />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/customers/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CustomerDetail />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/expenses"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Expenses />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/purchases"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Purchases />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/suppliers/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SupplierDetail />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/employees"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Employees />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/reports"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Reports />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/settings"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Settings />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/approvals"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Approvals />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard/returns"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Returns />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route path="/dashboard/audit-logs"
            element={<ProtectedRoute><DashboardLayout><AuditLogs /></DashboardLayout></ProtectedRoute>} />
          <Route path="/dashboard/day-close"
            element={<ProtectedRoute><DashboardLayout><DayClose /></DashboardLayout></ProtectedRoute>} />
          <Route path="/dashboard/backups"
            element={<ProtectedRoute><DashboardLayout><Backups /></DashboardLayout></ProtectedRoute>} />
          
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
