import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toast } from '../../hooks/use-toast';

const AddProductDialog = ({ onProductAdded }) => {
  const [open, setOpen] = useState(false);
  const [expiryDate, setExpiryDate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    serialNumber: '',
    category: '',
    type: '',
    purchasePrice: '',
    salePrice: '',
    stock: '',
    minStock: '',
    supplier: '',
    description: ''
  });

  const productTypes = [
    'مواد غذائية',
    'مشروبات',
    'منظفات',
    'أدوات منزلية',
    'إلكترونيات',
    'أخرى'
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name || !formData.barcode || !formData.salePrice) {
      toast({
        title: 'خطأ',
        description: 'يرجى ملء جميع الحقول المطلوبة',
        variant: 'destructive'
      });
      return;
    }

    const newProduct = {
      ...formData,
      expiryDate: expiryDate ? format(expiryDate, 'yyyy-MM-dd') : null,
      id: Date.now().toString()
    };

    // Note: When stock becomes 0, expiry date will be automatically removed
    if (parseInt(formData.stock) === 0) {
      newProduct.expiryDate = null;
    }

    if (onProductAdded) {
      onProductAdded(newProduct);
    }

    toast({
      title: 'تم بنجاح',
      description: 'تمت إضافة المنتج بنجاح'
    });

    // Reset form
    setFormData({
      name: '',
      barcode: '',
      serialNumber: '',
      category: '',
      type: '',
      purchasePrice: '',
      salePrice: '',
      stock: '',
      minStock: '',
      supplier: '',
      description: ''
    });
    setExpiryDate(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg">
          <Plus className="ml-2 h-4 w-4" />
          إضافة منتج جديد
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">إضافة منتج جديد</DialogTitle>
          <DialogDescription>
            أضف منتج جديد إلى المخزن مع جميع التفاصيل
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">المعلومات الأساسية</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-right">اسم المنتج *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="أدخل اسم المنتج"
                  required
                  className="text-right"
                  dir="rtl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="barcode" className="text-right">الباركود *</Label>
                <Input
                  id="barcode"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleInputChange}
                  placeholder="6281000000000"
                  required
                  className="text-right"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serialNumber" className="text-right">الرقم التسلسلي</Label>
                <Input
                  id="serialNumber"
                  name="serialNumber"
                  value={formData.serialNumber}
                  onChange={handleInputChange}
                  placeholder="SN-2024-001"
                  className="text-right"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type" className="text-right">نوع المنتج *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger className="text-right">
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    {productTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-right">الفئة</Label>
                <Input
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  placeholder="أدخل الفئة"
                  className="text-right"
                  dir="rtl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier" className="text-right">المورد</Label>
                <Input
                  id="supplier"
                  name="supplier"
                  value={formData.supplier}
                  onChange={handleInputChange}
                  placeholder="أدخل اسم المورد"
                  className="text-right"
                  dir="rtl"
                />
              </div>
            </div>
          </div>

          {/* Pricing & Stock */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">الأسعار والمخزون</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchasePrice" className="text-right">سعر الشراء (ريال)</Label>
                <Input
                  id="purchasePrice"
                  name="purchasePrice"
                  type="number"
                  step="0.01"
                  value={formData.purchasePrice}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="text-right"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="salePrice" className="text-right">سعر البيع (ريال) *</Label>
                <Input
                  id="salePrice"
                  name="salePrice"
                  type="number"
                  step="0.01"
                  value={formData.salePrice}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  required
                  className="text-right"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock" className="text-right">الكمية المتوفرة</Label>
                <Input
                  id="stock"
                  name="stock"
                  type="number"
                  value={formData.stock}
                  onChange={handleInputChange}
                  placeholder="0"
                  className="text-right"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minStock" className="text-right">الحد الأدنى للمخزون</Label>
                <Input
                  id="minStock"
                  name="minStock"
                  type="number"
                  value={formData.minStock}
                  onChange={handleInputChange}
                  placeholder="0"
                  className="text-right"
                />
              </div>
            </div>
          </div>

          {/* Expiry Date */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">تاريخ الصلاحية</h3>
            <div className="space-y-2">
              <Label className="text-right">تاريخ انتهاء الصلاحية</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-right font-normal"
                  >
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {expiryDate ? format(expiryDate, 'PPP', { locale: ar }) : 'اختر تاريخ الصلاحية'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={expiryDate}
                    onSelect={setExpiryDate}
                    initialFocus
                    locale={ar}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-sm text-gray-500">
                ملاحظة: عند نفاذ كمية المنتج (المخزون = 0)، سيتم حذف تاريخ الصلاحية تلقائياً
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-right">وصف المنتج</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="أدخل وصف المنتج (اختياري)"
              rows={3}
              className="text-right"
              dir="rtl"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              إضافة المنتج
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddProductDialog;
