// Mock Data for Mini Market Management System

export const mockUser = {
  id: '1',
  name: 'محمد خالد صالح الشاطري',
  email: 'mohammed711@example.com',
  role: 'Manager',
  avatar: null
};

export const mockSalesStats = {
  todaySales: 117837.8,
  todayQuantity: 609,
  todayProfit: 19230.95,
  todayCash: 99357.8,
  firstDrawer: 18480,
  totalInvoices: 1600
};

export const mockMonthlyStats = [
  { date: '2026-06-01', sales: 450000, purchases: 280000, expenses: 45000 },
  { date: '2026-06-02', sales: 520000, purchases: 310000, expenses: 38000 },
  { date: '2026-06-03', sales: 380000, purchases: 250000, expenses: 42000 },
  { date: '2026-06-04', sales: 490000, purchases: 295000, expenses: 51000 },
  { date: '2026-06-05', sales: 560000, purchases: 330000, expenses: 47000 },
  { date: '2026-06-06', sales: 420000, purchases: 270000, expenses: 44000 },
  { date: '2026-06-07', sales: 510000, purchases: 305000, expenses: 49000 }
];

export const mockProducts = [
  {
    id: '1',
    name: 'حليب المراعي كامل الدسم 1 لتر',
    barcode: '6281000000001',
    serialNumber: 'SN-2024-001',
    category: 'مشروبات',
    type: 'مواد غذائية',
    purchasePrice: 8.5,
    salePrice: 12,
    stock: 150,
    minStock: 20,
    expiryDate: '2026-12-31',
    supplier: 'المراعي',
    image: null
  },
  {
    id: '2',
    name: 'أرز أبو كاس 10 كيلو',
    barcode: '6281000000002',
    serialNumber: 'SN-2024-002',
    category: 'حبوب',
    type: 'مواد غذائية',
    purchasePrice: 65,
    salePrice: 85,
    stock: 80,
    minStock: 15,
    expiryDate: '2027-06-30',
    supplier: 'أبو كاس',
    image: null
  },
  {
    id: '3',
    name: 'صابون لوكس 6 قطع',
    barcode: '6281000000003',
    serialNumber: 'SN-2024-003',
    category: 'صابون',
    type: 'منظفات',
    purchasePrice: 15,
    salePrice: 22,
    stock: 45,
    minStock: 10,
    expiryDate: '2028-01-15',
    supplier: 'يونيليفر',
    image: null
  },
  {
    id: '4',
    name: 'زيت العافية 1.8 لتر',
    barcode: '6281000000004',
    serialNumber: 'SN-2024-004',
    category: 'زيوت',
    type: 'مواد غذائية',
    purchasePrice: 42,
    salePrice: 58,
    stock: 60,
    minStock: 12,
    expiryDate: '2027-03-20',
    supplier: 'العافية',
    image: null
  },
  {
    id: '5',
    name: 'مياه نوفا 1.5 لتر',
    barcode: '6281000000005',
    serialNumber: 'SN-2024-005',
    category: 'مشروبات',
    type: 'مشروبات',
    purchasePrice: 1.5,
    salePrice: 2.5,
    stock: 500,
    minStock: 100,
    expiryDate: '2027-12-31',
    supplier: 'نوفا',
    image: null
  }
];

export const mockCustomers = [
  {
    id: '1',
    name: 'أحمد محمد علي',
    phone: '777123456',
    email: 'ahmed@example.com',
    address: 'صنعاء - شارع الزبيري',
    totalPurchases: 2450000,
    totalPayments: 2200000,
    balance: 250000,
    lastPurchase: '2026-06-15'
  },
  {
    id: '2',
    name: 'فاطمة حسن عبدالله',
    phone: '777234567',
    email: 'fatima@example.com',
    address: 'صنعاء - شارع الستين',
    totalPurchases: 1850000,
    totalPayments: 1850000,
    balance: 0,
    lastPurchase: '2026-06-14'
  },
  {
    id: '3',
    name: 'خالد عبدالله صالح',
    phone: '777345678',
    email: 'khaled@example.com',
    address: 'صنعاء - شارع حدة',
    totalPurchases: 3200000,
    totalPayments: 2800000,
    balance: 400000,
    lastPurchase: '2026-06-17'
  }
];

export const mockSuppliers = [
  {
    id: '1',
    name: 'شركة المراعي للألبان',
    phone: '777111222',
    email: 'almarai@example.com',
    address: 'صنعاء - شارع تعز',
    totalPurchases: 5600000,
    totalPayments: 5200000,
    balance: 400000,
    lastSupply: '2026-06-16'
  },
  {
    id: '2',
    name: 'مؤسسة العافية التجارية',
    phone: '777222333',
    email: 'alafia@example.com',
    address: 'صنعاء - شارع الحصبة',
    totalPurchases: 3800000,
    totalPayments: 3800000,
    balance: 0,
    lastSupply: '2026-06-10'
  },
  {
    id: '3',
    name: 'تجارة المنتجات الغذائية',
    phone: '777333444',
    email: 'foodtrade@example.com',
    address: 'صنعاء - شارع الرينة',
    totalPurchases: 4200000,
    totalPayments: 3900000,
    balance: 300000,
    lastSupply: '2026-06-12'
  }
];

export const mockInvoices = [
  {
    id: 'INV-001',
    date: '2026-06-17',
    time: '10:30',
    customer: 'أحمد محمد علي',
    items: 5,
    total: 125000,
    discount: 5000,
    net: 120000,
    paymentMethod: 'نقداً',
    status: 'مكتمل'
  },
  {
    id: 'INV-002',
    date: '2026-06-17',
    time: '11:15',
    customer: 'فاطمة حسن عبدالله',
    items: 3,
    total: 85000,
    discount: 0,
    net: 85000,
    paymentMethod: 'آجل',
    status: 'مكتمل'
  },
  {
    id: 'INV-003',
    date: '2026-06-17',
    time: '12:45',
    customer: 'خالد عبدالله صالح',
    items: 8,
    total: 250000,
    discount: 10000,
    net: 240000,
    paymentMethod: 'تحويل بنكي',
    status: 'مكتمل'
  }
];

export const mockExpenses = [
  {
    id: '1',
    date: '2026-06-17',
    category: 'إيجار',
    description: 'إيجار المحل شهر يونيو',
    amount: 500000,
    paidBy: 'محمد خالد',
    paymentMethod: 'نقداً'
  },
  {
    id: '2',
    date: '2026-06-16',
    category: 'رواتب',
    description: 'راتب الموظفين',
    amount: 800000,
    paidBy: 'محمد خالد',
    paymentMethod: 'تحويل بنكي'
  },
  {
    id: '3',
    date: '2026-06-15',
    category: 'كهرباء',
    description: 'فاتورة الكهرباء',
    amount: 120000,
    paidBy: 'أحمد الموظف',
    paymentMethod: 'نقداً'
  }
];

export const mockEmployees = [
  {
    id: '1',
    name: 'محمد خالد صالح',
    phone: '777123456',
    email: 'mohammed711@example.com',
    role: 'مالك',
    salary: 0,
    joinDate: '2020-01-01',
    status: 'نشط'
  },
  {
    id: '2',
    name: 'أحمد عبدالله حسن',
    phone: '777234567',
    email: 'ahmed.emp@example.com',
    role: 'مشرف',
    salary: 300000,
    joinDate: '2021-03-15',
    status: 'نشط'
  },
  {
    id: '3',
    name: 'سارة محمد علي',
    phone: '777345678',
    email: 'sara.emp@example.com',
    role: 'عامل',
    salary: 200000,
    joinDate: '2022-06-01',
    status: 'نشط'
  }
];

export const mockNotifications = [
  {
    id: '1',
    type: 'warning',
    title: 'منتج قارب على النفاد',
    message: 'مياه نوفا 1.5 لتر - الكمية المتبقية: 15',
    date: '2026-06-17',
    read: false
  },
  {
    id: '2',
    type: 'danger',
    title: 'صلاحية قاربت على الانتهاء',
    message: 'حليب المراعي - تنتهي الصلاحية خلال 30 يوم',
    date: '2026-06-16',
    read: false
  },
  {
    id: '3',
    type: 'info',
    title: 'مديونية مستحقة',
    message: 'العميل أحمد محمد علي - المبلغ المستحق: 250,000 ريال',
    date: '2026-06-15',
    read: true
  }
];
