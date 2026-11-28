import React, { useEffect, useRef, useState } from 'react';
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
  CheckSquare,
  X,
  Tag,
  CalendarClock,
} from 'lucide-react';
import { AccountItem, PaginatedMeta, UserInfo } from '../api.js';
import { getStatusBadgeClasses } from './types.js';

function formatAccountCreatedAt(iso: string | null | undefined): {
  datePart: string;
  timePart: string;
  ageLabel: string;
  ageDays: number;
  fullText: string;
} {
  if (!iso) {
    return { datePart: '—', timePart: '', ageLabel: '—', ageDays: 0, fullText: '—' };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { datePart: iso, timePart: '', ageLabel: '—', ageDays: 0, fullText: iso };
  }
  const now = new Date();
  const startOfCreatedDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.max(0, Math.round((startOfToday - startOfCreatedDay) / 86_400_000));
  const ageLabel = `${diffDays} Days`;

  const datePart = d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return {
    datePart,
    timePart,
    ageLabel,
    ageDays: diffDays,
    fullText: `${datePart} ${timePart} (${ageLabel})`,
  };
}

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
  selectedAccountIds: string[];
  onToggleAccountSelection: (accountId: string, shiftKey?: boolean) => void;
  onToggleSelectPage: () => void;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onBulkCopySelected: () => void;
  onBulkExportSelected: () => void;
  onBulkUpdateCategory: (category: string) => void;
  onBulkDeleteSelected: () => void;
  onDeleteAllAccounts: () => void;
}

/**
 * Searchable, filterable, multi-select Vault repository of registered Roblox accounts.
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
  selectedAccountIds,
  onToggleAccountSelection,
  onToggleSelectPage,
  onSelectAllFiltered,
  onClearSelection,
  onBulkCopySelected,
  onBulkExportSelected,
  onBulkUpdateCategory,
  onBulkDeleteSelected,
  onDeleteAllAccounts,
}: AccountsViewProps) {
  const shiftPressedRef = useRef(false);
  const [bulkCategory, setBulkCategory] = useState('STANDARD');
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);

  const selectedSet = new Set(selectedAccountIds);
  const allPageSelected = accounts.length > 0 && accounts.every((a) => selectedSet.has(a.id));
  const somePageSelected = accounts.some((a) => selectedSet.has(a.id)) && !allPageSelected;

  useEffect(() => {
    setConfirmingBulkDelete(false);
  }, [selectedAccountIds.length]);

  useEffect(() => {
    setConfirmingDeleteAll(false);
  }, [accountsMeta.total]);

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
              Repositori terindeks &amp; terpaginasi. Centang akun (tahan Shift untuk rentang) untuk aksi massal.
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
          {user.role === 'ADMIN' &&
            accountsMeta.total > 0 &&
            (!confirmingDeleteAll ? (
              <button
                type="button"
                onClick={() => setConfirmingDeleteAll(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/35 px-3 py-2 font-mono text-xs text-rose-200 hover:bg-rose-900/50 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                DELETE ALL
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-950/60 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingDeleteAll(false);
                    onDeleteAllAccounts();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 font-mono text-xs font-bold text-white hover:bg-rose-500 cursor-pointer"
                >
                  YAKIN HAPUS SEMUA ({accountsMeta.total})?
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteAll(false)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                >
                  Batal
                </button>
              </div>
            ))}
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

      {/* Contextual Bulk Selection Toolbar */}
      {selectedAccountIds.length > 0 && (
        <div
          role="region"
          aria-label="Bulk actions for selected accounts"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/30 bg-emerald-950/25 px-4 py-2.5 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 font-mono font-semibold text-emerald-300 tabular-nums">
              <CheckSquare className="h-3.5 w-3.5" />
              {selectedAccountIds.length} akun dipilih
            </span>

            {!allPageSelected && accounts.length > 0 && (
              <button
                type="button"
                onClick={onToggleSelectPage}
                className="rounded-lg border border-zinc-700 bg-zinc-900/90 px-2.5 py-1 font-mono text-[11px] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                Pilih Halaman ({accounts.length})
              </button>
            )}

            {accountsMeta.total > accounts.length && selectedAccountIds.length < accountsMeta.total && (
              <button
                type="button"
                onClick={onSelectAllFiltered}
                className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 font-mono text-[11px] text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
              >
                Pilih Semua Hasil Filter ({accountsMeta.total})
              </button>
            )}

            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700/80 px-2 py-1 font-mono text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
            >
              <X className="h-3 w-3" />
              Batal Pilih
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBulkCopySelected}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 font-mono text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
            >
              <Copy className="h-3 w-3" />
              COPY SELECTED
            </button>

            <button
              type="button"
              onClick={onBulkExportSelected}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-[11px] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            >
              <Download className="h-3 w-3 text-cyan-400" />
              EXPORT SELECTED
            </button>

            <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/90 p-0.5">
              <Tag className="ml-1.5 h-3 w-3 text-zinc-500" />
              <select
                aria-label="Bulk category"
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="bg-transparent px-1.5 py-1 font-mono text-[11px] text-zinc-200 focus:outline-none"
              >
                <option value="STANDARD" className="bg-zinc-950">STANDARD</option>
                <option value="TRADING" className="bg-zinc-950">TRADING</option>
                <option value="STORAGE" className="bg-zinc-950">STORAGE</option>
                <option value="TESTING" className="bg-zinc-950">TESTING</option>
                <option value="VIP" className="bg-zinc-950">VIP</option>
              </select>
              <button
                type="button"
                onClick={() => onBulkUpdateCategory(bulkCategory)}
                className="rounded-md bg-zinc-800 px-2 py-1 font-mono text-[10px] font-semibold text-zinc-200 hover:bg-zinc-700 cursor-pointer"
              >
                SET KATEGORI
              </button>
            </div>

            {user.role === 'ADMIN' &&
              (!confirmingBulkDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingBulkDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 font-mono text-[11px] text-rose-200 hover:bg-rose-900/50 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  DELETE ({selectedAccountIds.length})
                </button>
              ) : (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingBulkDelete(false);
                      onBulkDeleteSelected();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 font-mono text-[11px] font-bold text-white hover:bg-rose-500 cursor-pointer"
                  >
                    YAKIN HAPUS {selectedAccountIds.length}?
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingBulkDelete(false)}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/60 font-mono text-[11px] uppercase text-zinc-400">
              <th className="w-11 p-0 text-center">
                <label className="flex items-center justify-center p-3.5 cursor-pointer">
                  <input
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    type="checkbox"
                    aria-label="Pilih semua akun di halaman ini"
                    checked={allPageSelected}
                    onChange={onToggleSelectPage}
                    className="h-4 w-4 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>
              </th>
              <th className="p-3.5">Roblox Username</th>
              <th className="p-3.5">User ID</th>
              <th className="p-3.5">Category</th>
              <th className="p-3.5">Registration</th>
              <th className="p-3.5">Verification</th>
              <th className="p-3.5">Vault Status</th>
              <th className="p-3.5">Tags</th>
              <th className="p-3.5">
                <button
                  type="button"
                  onClick={() => {
                    if (accSortBy === 'created_at') {
                      onToggleSortOrder();
                    } else {
                      setAccSortBy('created_at');
                    }
                  }}
                  title="Urutkan berdasarkan tanggal akun dibuat & umur akun"
                  className="inline-flex items-center gap-1 uppercase hover:text-zinc-200 cursor-pointer"
                >
                  <span>Tanggal Dibuat / Umur</span>
                  <ArrowUpDown className="h-3 w-3 text-cyan-400" />
                </button>
              </th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-xs">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center font-mono text-zinc-500">
                  No registered accounts match current filters.
                </td>
              </tr>
            ) : (
              accounts.map((acc) => {
                const isSelected = selectedSet.has(acc.id);
                const createdInfo = formatAccountCreatedAt(acc.createdAt);
                return (
                  <tr
                    key={acc.id}
                    className={`transition ${
                      isSelected
                        ? 'bg-emerald-500/[0.08] hover:bg-emerald-500/[0.12]'
                        : 'hover:bg-zinc-800/30'
                    }`}
                  >
                    <td className="w-11 p-0 text-center">
                      <label
                        onMouseDown={(e) => {
                          shiftPressedRef.current = e.shiftKey;
                        }}
                        className="flex items-center justify-center p-3.5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select account ${acc.robloxUsername}`}
                          checked={isSelected}
                          onKeyDown={(e) => {
                            shiftPressedRef.current = e.shiftKey;
                          }}
                          onChange={() => {
                            const shift = shiftPressedRef.current;
                            shiftPressedRef.current = false;
                            onToggleAccountSelection(acc.id, shift);
                          }}
                          className="h-4 w-4 accent-emerald-500 rounded cursor-pointer"
                        />
                      </label>
                    </td>
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
                    <td
                      className="p-3.5 font-mono tabular-nums whitespace-nowrap"
                      title={createdInfo.fullText}
                    >
                      <div className="flex items-center gap-1.5 text-zinc-200">
                        <CalendarClock className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                        <span className="font-bold">{createdInfo.datePart}</span>
                        <span
                          className={`rounded-md border-[1.5px] border-[var(--border-ink)] px-1.5 py-0.5 text-[10px] font-black shadow-[1.5px_1.5px_0_var(--outline)] ${
                            createdInfo.ageDays >= 7
                              ? 'bg-[var(--green-tint)] text-[var(--green-ink)]'
                              : createdInfo.ageDays >= 1
                                ? 'bg-[var(--sky-tint)] text-[var(--sky-2)]'
                                : 'bg-[var(--gold-tint)] text-[var(--gold-ink)]'
                          }`}
                        >
                          {createdInfo.ageLabel}
                        </span>
                      </div>
                      {createdInfo.timePart && (
                        <div className="pl-5 text-[10px] text-zinc-500">{createdInfo.timePart}</div>
                      )}
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
                );
              })
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
