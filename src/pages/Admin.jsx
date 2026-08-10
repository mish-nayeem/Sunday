import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import {
  LayoutDashboard, ShoppingBag, ClipboardEdit, Shirt, UploadCloud,
  Users, Wallet, Star, FileText, Settings as SettingsIcon,
} from 'lucide-react';
import AdminStats from '@/components/admin/AdminStats';
import AdminOrders from '@/components/admin/AdminOrders';
import AdminManualOrder from '@/components/admin/AdminManualOrder';
import AdminProducts from '@/components/admin/AdminProducts';
import AdminBulkUpload from '@/components/admin/AdminBulkUpload';
import AdminCustomers from '@/components/admin/AdminCustomers';
import AdminExpenses from '@/components/admin/AdminExpenses';
import AdminReviews from '@/components/admin/AdminReviews';
import AdminInvoices from '@/components/admin/AdminInvoices';
import AdminSettings from '@/components/admin/AdminSettings';

// Explicit literal classes (not built dynamically) so Tailwind's JIT scanner picks them up.
const tabColors = {
  blue:    { active: 'border-blue-500 text-blue-600',    icon: 'text-blue-500' },
  amber:   { active: 'border-amber-500 text-amber-600',  icon: 'text-amber-500' },
  cyan:    { active: 'border-cyan-500 text-cyan-600',    icon: 'text-cyan-500' },
  violet:  { active: 'border-violet-500 text-violet-600', icon: 'text-violet-500' },
  pink:    { active: 'border-pink-500 text-pink-600',    icon: 'text-pink-500' },
  emerald: { active: 'border-emerald-500 text-emerald-600', icon: 'text-emerald-500' },
  rose:    { active: 'border-rose-500 text-rose-600',    icon: 'text-rose-500' },
  yellow:  { active: 'border-yellow-500 text-yellow-600', icon: 'text-yellow-500' },
  indigo:  { active: 'border-indigo-500 text-indigo-600', icon: 'text-indigo-500' },
  slate:   { active: 'border-slate-500 text-slate-600',  icon: 'text-slate-500' },
};

const tabs = [
  { key: 'stats', label: 'Overview', component: AdminStats, icon: LayoutDashboard, color: 'blue' },
  { key: 'orders', label: 'Orders', component: AdminOrders, icon: ShoppingBag, color: 'amber' },
  { key: 'manual_order', label: 'Manual Order', component: AdminManualOrder, icon: ClipboardEdit, color: 'cyan' },
  { key: 'products', label: 'Products', component: AdminProducts, icon: Shirt, color: 'violet' },
  { key: 'bulk_upload', label: 'Bulk Upload', component: AdminBulkUpload, icon: UploadCloud, color: 'pink' },
  { key: 'customers', label: 'Customers', component: AdminCustomers, icon: Users, color: 'emerald' },
  { key: 'expenses', label: 'Expenses', component: AdminExpenses, icon: Wallet, color: 'rose' },
  { key: 'reviews', label: 'Reviews', component: AdminReviews, icon: Star, color: 'yellow' },
  { key: 'invoices', label: 'Invoices', component: AdminInvoices, icon: FileText, color: 'indigo' },
  { key: 'settings', label: 'Settings', component: AdminSettings, icon: SettingsIcon, color: 'slate' },
];

export default function Admin() {
  const [activeTab, setActiveTab] = useState('stats');
  const { logout } = useAuth();

  const active = tabs.find(t => t.key === activeTab) || tabs[0];
  const ActiveComponent = active.component;

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
          {tabs.map(t => {
            const c = tabColors[t.color];
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`whitespace-nowrap flex items-center gap-1.5 text-[11px] tracking-[0.15em] uppercase px-5 py-3 border-b-2 transition-colors ${
                  isActive ? `${c.active} font-medium` : 'border-transparent text-obsidian/50 hover:text-obsidian'
                }`}
              >
                <t.icon size={14} className={isActive ? c.icon : 'text-obsidian/30'} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="pb-16">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
