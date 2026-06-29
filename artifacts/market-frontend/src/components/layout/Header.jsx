import React from 'react';
import { Bell, Search } from 'lucide-react';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';

const Header = ({ title = 'ميني ماركت الفنية' }) => {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between" dir="rtl">
      <div className="flex items-center space-x-4 space-x-reverse flex-1">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      </div>

      <div className="flex items-center space-x-4 space-x-reverse">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="بحث..."
            className="w-64 pr-10 text-right"
            dir="rtl"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell className="h-6 w-6" />
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-600">
            3
          </Badge>
        </button>

        {/* Account */}
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">الحساب</p>
        </div>
      </div>
    </header>
  );
};

export default Header;
