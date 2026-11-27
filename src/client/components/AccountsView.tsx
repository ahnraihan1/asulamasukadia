import React from 'react';
import {
  Users,
  Download,
  Plus,
  Search,
  Copy,
  Pencil,
  Trash2,
  ShieldCheck,
  ArrowUpDown,
} from 'lucide-react';
import { AccountItem, PaginatedMeta, UserInfo } from '../api.js';
import { getStatusBadgeClasses } from './types.js';

interface AccountsViewProps {
  user: UserInfo;
  accounts: AccountItem[];
  accountsMeta: PaginatedMeta;
  accSearch: string;
  setAccSearch: (v: string) => void;
  accCategoryFilter: string;
  setAccCategoryFilter: (v: string) => void;
  accRegStatusFilter: string;
  setAccRegStatusFilter: (v: string) => void;
  accVerifStatusFilter: string;
  setAccVerifStatusFilter: (v: string) => void;
  accSortBy: 'created_at' | 'updated_at' | 'roblox_username' | 'category';
  setAccSortBy: (v: 'created_at' | 'updated_at' | 'roblox_username' | 'category') => void;
  accSortOrder: 'asc' | 'desc';
  onToggleSortOrder: () => void;
  onLoadAccounts: (page: number) => void;
  onExportAllFormatted: () => void;
  onOpenCreateModal: () => void;
  onCopyAccountFormatted: (accountId: string) => void;
  onSelectAccount: (acc: AccountItem) => void;
  onDeleteAccount: (accountId: string) => void;
}

/**
 * Searchable, filterable, Vault-backed repository of registered Roblox accounts.
 */
export function AccountsView({
  user,
  accounts,
  accountsMeta,
  accSearch,
  setAccSearch,
  accCategoryFilter,
  setAccCategoryFilter,
  accRegStatusFilter,
  setAccRegStatusFilter,
  accVerifStatusFilter,
  setAccVerifStatusFilter,
  accSortBy,
  setAccSortBy,
  accSortOrder,
  onToggleSortOrder,
  onLoadAccounts,
  onExportAllFormatted,
  onOpenCreateModal,
  onCopyAccountFormatted,
  onSelectAccount,
  onDeleteAccount,
}: AccountsViewProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Users className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Registered Roblox Accounts ({accountsMeta.total})
            </h2>
            <p className="text-xs text-zinc-400">
              Repositori terindeks &amp; terpaginasi. Kredensial tetap terenkripsi di AES-256-GCM Vault.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onExportAllFormatted}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 hover:bg-zinc-800 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-emerald-400" />
            EXPORT ALL (USER:PASS:COOKIE)
          </button>
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 font-mono text-xs font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            ADD REGISTERED ACCOUNT
          </button>
        </div>
      </div>

      {/* Filter & Sort Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 border-b border-zinc-800/80 bg-zinc-950/50 p-4">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search username, userId, tags..."
            value={accSearch}
            onChange={(e) => setAccSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onLoadAccounts(1);
            }}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/70 focus:outline-none"
          />
        </div>

        <select
          value={accCategoryFilter}
          onChange={(e) => setAccCategoryFilter(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:border-emerald-500/70 focus:outline-none"
        >
          <option value="">All Categories</option>
          <option value="STANDARD">STANDARD</option>
          <option value="TRADING">TRADING</option>
          <option value="STORAGE">STORAGE</option>
          <option value="TESTING">TESTING</option>
          <option value="VIP">VIP</option>
        </select>

        <select
          value={accRegStatusFilter}
          onChange={(e) => setAccRegStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:border-emerald-500/70 focus:outline-none"
        >
          <option value="">All Reg Status</option>
          <option value="REGISTERED">REGISTERED</option>
          <option value="PENDING_CONFIRMATION">PENDING_CONFIRMATION</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>

        <select
          value={accVerifStatusFilter}
          onChange={(e) => setAccVerifStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:border-emerald-500/70 focus:outline-none"
        >
          <option value="">All Verification</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="VERIFICATION_REQUIRED">VERIFICATION_REQUIRED</option>
          <option value="UNVERIFIED">UNVERIFIED</option>
        </select>

        <div className="flex gap-1.5">
          <select
            value={accSortBy}
            onChange={(e) => setAccSortBy(e.target.value as any)}
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500/70 focus:outline-none"
          >
            <option value="created_at">Sort: Created</option>
            <option value="roblox_username">Sort: Username</option>
            <option value="category">Sort: Category</option>
          </select>
          <button
            type="button"
            title="Toggle sort direction"
            onClick={onToggleSortOrder}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 font-mono text-xs text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            <ArrowUpDown className="h-3 w-3 text-cyan-400" />
            {accSortOrder.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/60 font-mono text-[11px] uppercase text-zinc-400">
              <th className="p-3.5">Roblox Username</th>
              <th className="p-3.5">User ID</th>
              <th className="p-3.5">Category</th>
              <th className="p-3.5">Registration</th>
              <th className="p-3.5">Verification</th>
              <th className="p-3.5">Vault Status</th>
              <th className="p-3.5">Tags</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-xs">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center font-mono text-zinc-500">
                  No registered accounts match current filters.
                </td>
              </tr>
            ) : (
              accounts.map((acc) => (
                <tr key={acc.id} className="transition hover:bg-zinc-800/30">
                  <td className="p-3.5 font-mono font-medium text-zinc-100">
                    {acc.robloxUsername}
                  </td>
                  <td className="p-3.5 font-mono tabular-nums text-zinc-300">
                    {acc.robloxUserId || '—'}
                  </td>
                  <td className="p-3.5 font-mono text-zinc-300">{acc.category}</td>
                  <td className="p-3.5 font-mono">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] ${getStatusBadgeClasses(
                        acc.registrationStatus
                      )}`}
                    >
                      {acc.registrationStatus}
                    </span>
                  </td>
                  <td className="p-3.5 font-mono">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] ${getStatusBadgeClasses(
                        acc.verificationStatus
                      )}`}
                    >
                      {acc.verificationStatus}
                    </span>
                  </td>
                  <td className="p-3.5 font-mono text-[11px]">
                    {acc.hasVaultCredential ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        AES-256-GCM
                      </span>
                    ) : (
                      <span className="text-zinc-500">NO SECRET</span>
                    )}
                  </td>
                  <td className="p-3.5">
                    <div className="flex flex-wrap gap-1">
                      {acc.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="rounded-md bg-zinc-800/90 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onCopyAccountFormatted(acc.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                      >
                        <Copy className="h-3 w-3" />
                        COPY USER:PASS:COOKIE
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectAccount(acc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                      >
                        <Pencil className="h-3 w-3" />
                        EDIT
                      </button>
                      {user.role === 'ADMIN' && (
                        <button
                          type="button"
                          onClick={() => onDeleteAccount(acc.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-950/30 px-2 py-1 font-mono text-[11px] text-rose-300 hover:bg-rose-900/40 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          DELETE
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-zinc-800/80 px-4 py-3 font-mono text-xs text-zinc-400">
        <span className="tabular-nums">
          Page {accountsMeta.page} of {accountsMeta.totalPages} ({accountsMeta.total} total accounts)
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={accountsMeta.page <= 1}
            onClick={() => onLoadAccounts(accountsMeta.page - 1)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1 disabled:opacity-40 hover:bg-zinc-800 cursor-pointer"
          >
            PREV
          </button>
          <button
            type="button"
            disabled={accountsMeta.page >= accountsMeta.totalPages}
            onClick={() => onLoadAccounts(accountsMeta.page + 1)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1 disabled:opacity-40 hover:bg-zinc-800 cursor-pointer"
          >
            NEXT
          </button>
        </div>
      </div>
    </section>
  );
}
