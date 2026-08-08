import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import AdminStats from '@/components/admin/AdminStats';
import AdminOrders from '@/components/admin/AdminOrders';
import AdminManualOrder from '@/components/admin/AdminManualOrder';
import AdminProducts from '@/components/admin/AdminProducts';
import AdminCustomers from '@/components/admin/AdminCustomers';
import AdminExpenses from '@/components/admin/AdminExpenses';
import AdminReviews from '@/components/admin/AdminReviews';
import AdminInvoices from '@/components/admin/AdminInvoices';
import AdminSettings from '@/components/admin/AdminSettings';

const tabs = [
  { key: 'stats', label: 'Overview', component: AdminStats },
  { key: 'orders', label: 'Orders', component: AdminOrders },
  { key: 'manual_order', label: 'Manual Order', component: AdminManualOrder },
  { key: 'products', label: 'Products', component: AdminProducts },
  { key: 'customers', label: 'Customers', component: AdminCustomers },
  { key: 'expenses', label: 'Expenses', component: AdminExpenses },
  { key: 'reviews', label: 'Reviews', component: AdminReviews },
  { key: 'invoices', label: 'Invoices', component: AdminInvoices },
  { key: 'settings', label: 'Settings', component: AdminSettings },
];

export default function Admin() {
  const [activeTab, setActiveTab] = useState('stats');
  const { logout } = useAuth();

  const ActiveComponent = tabs.find(t => t.key === activeTab)?.component || AdminStats;

  return (
    <div className="min-h-screen bg-mist pt-6">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-light tracking-wide">Admin Dashboard</h1>
          <button
            onClick={logout}
            className="text-[11px] tracking-[0.15em] uppercase border border-obsidian/20 px-4 py-2 hover:bg-white transition-colors"
          >
            Log Out
          </button>
        </div>

        <div className="flex gap-1 mb-8 overflow-x-auto border-b border-sand/30">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap text-[11px] tracking-[0.15em] uppercase px-5 py-3 border-b-2 transition-colors ${
                activeTab === t.key ? 'border-wine text-wine font-medium' : 'border-transparent text-obsidian/50 hover:text-obsidian'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pb-16">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
