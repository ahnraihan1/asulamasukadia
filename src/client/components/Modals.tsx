import React, { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Play,
  ShieldCheck,
  AlertTriangle,
  Database,
  Download,
} from 'lucide-react';
import {
  AccountItem,
  AssistedSessionStatus,
  SupervisedChecklistPackage,
} from '../api.js';
import {
  COMPACT_INPUT_CLS,
  ExportFormatPreset,
  downloadExportFile,
  formatCredentialLines,
} from './types.js';

interface ModalsProps {
  supervisedPkg: SupervisedChecklistPackage | null;
  onCloseSupervised: () => void;
  assistedSession: AssistedSessionStatus | null;
  showVaultPassword: boolean;
  onToggleVaultPassword: () => void;
  onStartAssistedBrowser: (candidateId: string) => void;
  confirmRobloxUserId: string;
  setConfirmRobloxUserId: (v: string) => void;
  confirmRobloxUsername: string;
  setConfirmRobloxUsername: (v: string) => void;
  confirmCookie: string;
  setConfirmCookie: (v: string) => void;
  confirmCategory: string;
  setConfirmCategory: (v: string) => void;
  confirmNotes: string;
  setConfirmNotes: (v: string) => void;
  onConfirmRegistration: (e: React.FormEvent) => void;
  onMarkVerificationRequired: () => void;

  showCreateAccountModal: boolean;
  onCloseCreateAccount: () => void;
  newAccUsername: string;
  setNewAccUsername: (v: string) => void;
  newAccUserId: string;
  setNewAccUserId: (v: string) => void;
  newAccPassword: string;
  setNewAccPassword: (v: string) => void;
  newAccCategory: string;
  setNewAccCategory: (v: string) => void;
  newAccNotes: string;
  setNewAccNotes: (v: string) => void;
  newAccTags: string;
  setNewAccTags: (v: string) => void;
  onCreateManualAccount: (e: React.FormEvent) => void;

  selectedAccount: AccountItem | null;
  setSelectedAccount: (acc: AccountItem | null) => void;
  onUpdateAccount: (e: React.FormEvent) => void;

  exportModalText: string | null;
  onCloseExportModal: () => void;

  onNotify: (type: 'success' | 'error', text: string) => void;
}

/**
 * All workspace modal dialogs (Supervised Workflow, Add Account, Edit Account, Credentials Export).
 */
export function Modals({
  supervisedPkg,
  onCloseSupervised,
  assistedSession,
  showVaultPassword,
  onToggleVaultPassword,
  onStartAssistedBrowser,
  confirmRobloxUserId,
  setConfirmRobloxUserId,
  confirmRobloxUsername,
  setConfirmRobloxUsername,
  confirmCookie,
  setConfirmCookie,
  confirmCategory,
  setConfirmCategory,
  confirmNotes,
  setConfirmNotes,
  onConfirmRegistration,
  onMarkVerificationRequired,
  showCreateAccountModal,
  onCloseCreateAccount,
  newAccUsername,
  setNewAccUsername,
  newAccUserId,
  setNewAccUserId,
  newAccPassword,
  setNewAccPassword,
  newAccCategory,
  setNewAccCategory,
  newAccNotes,
  setNewAccNotes,
  newAccTags,
  setNewAccTags,
  onCreateManualAccount,
  selectedAccount,
  setSelectedAccount,
  onUpdateAccount,
  exportModalText,
  onCloseExportModal,
  onNotify,
}: ModalsProps) {
  const [exportPreset, setExportPreset] = useState<ExportFormatPreset>('USER_PASS_COOKIE');
  const [customExportTemplate, setCustomExportTemplate] = useState('{user}|{pass}|{cookie}');
  const formattedExport =
    exportModalText !== null
      ? formatCredentialLines(exportModalText, exportPreset, customExportTemplate)
      : { formattedText: '', parsedRows: [] };

  useEffect(() => {
    const anyOpen =
      Boolean(supervisedPkg) ||
      showCreateAccountModal ||
      Boolean(selectedAccount) ||
      exportModalText !== null;
    if (!anyOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (exportModalText !== null) onCloseExportModal();
      else if (selectedAccount) setSelectedAccount(null);
      else if (showCreateAccountModal) onCloseCreateAccount();
      else if (supervisedPkg) onCloseSupervised();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    supervisedPkg,
    showCreateAccountModal,
    selectedAccount,
    exportModalText,
    onCloseExportModal,
    setSelectedAccount,
    onCloseCreateAccount,
    onCloseSupervised,
  ]);

  return (
    <>
      {/* 1. HUMAN-SUPERVISED REGISTRATION WORKFLOW MODAL */}
      {supervisedPkg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onCloseSupervised}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700/90 bg-zinc-900 p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5">
              <div>
                <div className="font-mono text-[10px] text-emerald-400">
                  REFERENCE: {supervisedPkg.referenceCode}
                </div>
                <h3 className="text-base font-semibold text-zinc-100 mt-0.5">
                  Human-Supervised Registration Workflow
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={onCloseSupervised}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 font-mono text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                CLOSE
              </button>
            </div>

            {/* Candidate Credentials Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-400">CANDIDATE USERNAME:</span>
                <div className="flex items-center gap-2">
                  <strong className="text-sm text-zinc-100">{supervisedPkg.candidateUsername}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(supervisedPkg.candidateUsername);
                      onNotify('success', 'Username copied to clipboard');
                    }}
                    className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                  >
                    <Copy className="h-2.5 w-2.5" />
                    COPY
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-400">VAULT PASSWORD:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-200">
                    {showVaultPassword
                      ? supervisedPkg.generatedPasswordForHumanCopy || 'N/A'
                      : '••••••••••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={onToggleVaultPassword}
                    className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                  >
                    {showVaultPassword ? (
                      <>
                        <EyeOff className="h-2.5 w-2.5" /> HIDE
                      </>
                    ) : (
                      <>
                        <Eye className="h-2.5 w-2.5" /> REVEAL
                      </>
                    )}
                  </button>
                  {supervisedPkg.generatedPasswordForHumanCopy && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          supervisedPkg.generatedPasswordForHumanCopy!
                        );
                        onNotify('success', 'Password copied to clipboard');
                      }}
                      className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                    >
                      <Copy className="h-2.5 w-2.5" />
                      COPY
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-900 pt-3">
                <span className="text-zinc-500">ASSISTED BROWSER AUTOFILL:</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onStartAssistedBrowser(supervisedPkg.candidateId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    AUTO-OPEN BROWSER &amp; AUTOFILL FORM
                  </button>
                  <a
                    href={supervisedPkg.officialRegistrationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-zinc-300 underline hover:text-white"
                  >
                    Manual Link <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            {assistedSession && assistedSession.candidateId === supervisedPkg.candidateId && (
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/30 p-3.5 font-mono text-xs space-y-2">
                <div className="font-semibold text-emerald-300">
                  STATUS AUTOFILL: {assistedSession.status}
                </div>
                <div className="text-zinc-200">{assistedSession.message}</div>
                {assistedSession.formattedOutput && (
                  <div className="space-y-1.5 border-t border-emerald-900/60 pt-2">
                    <div className="text-[11px] text-emerald-400">
                      FORMAT TERSIMPAN (username:password:cookie):
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[11px] break-all text-zinc-200">
                      {assistedSession.formattedOutput}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(assistedSession.formattedOutput!);
                        onNotify('success', 'Copied username:password:cookie!');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-zinc-200 cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      COPY USERNAME:PASSWORD:COOKIE
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Supervised Checklist */}
            <div className="space-y-2">
              <div className="font-mono text-xs uppercase text-zinc-400">Supervised Checklist</div>
              {supervisedPkg.checklist.map((item) => (
                <div
                  key={item.step}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs"
                >
                  <div className="font-mono font-semibold text-zinc-200">
                    STEP {item.step}: {item.title}
                  </div>
                  <div className="mt-0.5 text-zinc-400 leading-relaxed">{item.description}</div>
                </div>
              ))}
            </div>

            {/* Confirmation Form */}
            <form onSubmit={onConfirmRegistration} className="space-y-3 border-t border-zinc-800 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                    RESULTING ROBLOX USER ID *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 7182930412"
                    value={confirmRobloxUserId}
                    onChange={(e) => setConfirmRobloxUserId(e.target.value)}
                    className={COMPACT_INPUT_CLS + ' font-mono'}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                    FINAL ROBLOX USERNAME *
                  </label>
                  <input
                    type="text"
                    value={confirmRobloxUsername}
                    onChange={(e) => setConfirmRobloxUsername(e.target.value)}
                    className={COMPACT_INPUT_CLS + ' font-mono'}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                    ACCOUNT CATEGORY
                  </label>
                  <select
                    value={confirmCategory}
                    onChange={(e) => setConfirmCategory(e.target.value)}
                    className={COMPACT_INPUT_CLS}
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="TRADING">TRADING</option>
                    <option value="STORAGE">STORAGE</option>
                    <option value="TESTING">TESTING</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                    OPERATOR NOTES
                  </label>
                  <input
                    type="text"
                    value={confirmNotes}
                    onChange={(e) => setConfirmNotes(e.target.value)}
                    placeholder="Optional verification notes"
                    className={COMPACT_INPUT_CLS}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                  .ROBLOSECURITY COOKIE (OPTIONAL IF USING MANUAL CONFIRM)
                </label>
                <input
                  type="text"
                  value={confirmCookie}
                  onChange={(e) => setConfirmCookie(e.target.value)}
                  placeholder="_|WARNING:-DO-NOT-SHARE-THIS... (Otomatis terisi jika memakai Auto-Open Browser)"
                  className={COMPACT_INPUT_CLS + ' font-mono'}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={onMarkVerificationRequired}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-200 hover:bg-amber-500/20 cursor-pointer"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  FLAG VERIFICATION REQUIRED
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 font-mono text-xs font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4" />
                  CONFIRM &amp; RECORD REGISTERED ACCOUNT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. CREATE REGISTERED ACCOUNT MODAL */}
      {showCreateAccountModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onCloseCreateAccount}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-zinc-700/90 bg-zinc-900 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-semibold text-zinc-100">Add Registered Roblox Account</h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={onCloseCreateAccount}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 font-mono text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                CLOSE
              </button>
            </div>

            <form onSubmit={onCreateManualAccount} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-mono text-zinc-400">ROBLOX USERNAME *</label>
                <input
                  type="text"
                  value={newAccUsername}
                  onChange={(e) => setNewAccUsername(e.target.value)}
                  className={COMPACT_INPUT_CLS + ' font-mono'}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-zinc-400">ROBLOX USER ID</label>
                <input
                  type="text"
                  value={newAccUserId}
                  onChange={(e) => setNewAccUserId(e.target.value)}
                  placeholder="Numeric ID"
                  className={COMPACT_INPUT_CLS + ' font-mono'}
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-zinc-400">
                  PASSWORD (ENCRYPTED IN VAULT)
                </label>
                <input
                  type="password"
                  value={newAccPassword}
                  onChange={(e) => setNewAccPassword(e.target.value)}
                  placeholder="Optional — sealed with AES-256-GCM"
                  className={COMPACT_INPUT_CLS}
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-zinc-400">CATEGORY</label>
                <select
                  value={newAccCategory}
                  onChange={(e) => setNewAccCategory(e.target.value)}
                  className={COMPACT_INPUT_CLS}
                >
                  <option value="STANDARD">STANDARD</option>
                  <option value="TRADING">TRADING</option>
                  <option value="STORAGE">STORAGE</option>
                  <option value="TESTING">TESTING</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block font-mono text-zinc-400">TAGS (COMMA SEPARATED)</label>
                <input
                  type="text"
                  value={newAccTags}
                  onChange={(e) => setNewAccTags(e.target.value)}
                  className={COMPACT_INPUT_CLS + ' font-mono'}
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-zinc-400">NOTES</label>
                <textarea
                  rows={2}
                  value={newAccNotes}
                  onChange={(e) => setNewAccNotes(e.target.value)}
                  className={COMPACT_INPUT_CLS}
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-500 py-2.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
              >
                SAVE ACCOUNT RECORD
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. ACCOUNT DETAILS & EDIT MODAL */}
      {selectedAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedAccount(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-2xl border border-zinc-700/90 bg-zinc-900 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="font-mono text-[10px] text-zinc-500">UUID: {selectedAccount.id}</div>
                <h3 className="text-sm font-semibold text-zinc-100 mt-0.5">
                  Account Record: {selectedAccount.robloxUsername}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setSelectedAccount(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 font-mono text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                CLOSE
              </button>
            </div>

            {selectedAccount.credentialMetadata && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 font-mono text-[11px] space-y-1">
                <div className="font-semibold text-emerald-300">
                  CREDENTIAL VAULT METADATA (SECRET REDACTED)
                </div>
                <div className="text-zinc-400">
                  Vault ID: {selectedAccount.credentialMetadata.id}
                </div>
                <div className="text-zinc-400">
                  Cipher: {selectedAccount.credentialMetadata.algorithm} (Key v
                  {selectedAccount.credentialMetadata.keyVersion})
                </div>
                <div className="break-all text-zinc-500">
                  HMAC-SHA256: {selectedAccount.credentialMetadata.fingerprintSha256}
                </div>
              </div>
            )}

            <form onSubmit={onUpdateAccount} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-zinc-400">CATEGORY</label>
                  <select
                    value={selectedAccount.category}
                    onChange={(e) =>
                      setSelectedAccount({ ...selectedAccount, category: e.target.value })
                    }
                    className={COMPACT_INPUT_CLS}
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="TRADING">TRADING</option>
                    <option value="STORAGE">STORAGE</option>
                    <option value="TESTING">TESTING</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-mono text-zinc-400">REGISTRATION</label>
                  <select
                    value={selectedAccount.registrationStatus}
                    onChange={(e) =>
                      setSelectedAccount({
                        ...selectedAccount,
                        registrationStatus: e.target.value as any,
                      })
                    }
                    className={COMPACT_INPUT_CLS}
                  >
                    <option value="REGISTERED">REGISTERED</option>
                    <option value="PENDING_CONFIRMATION">PENDING_CONFIRMATION</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-mono text-zinc-400">VERIFICATION</label>
                  <select
                    value={selectedAccount.verificationStatus}
                    onChange={(e) =>
                      setSelectedAccount({
                        ...selectedAccount,
                        verificationStatus: e.target.value as any,
                      })
                    }
                    className={COMPACT_INPUT_CLS}
                  >
                    <option value="VERIFIED">VERIFIED</option>
                    <option value="VERIFICATION_REQUIRED">VERIFICATION_REQUIRED</option>
                    <option value="UNVERIFIED">UNVERIFIED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-mono text-zinc-400">NOTES</label>
                <textarea
                  rows={3}
                  value={selectedAccount.notes ?? ''}
                  onChange={(e) =>
                    setSelectedAccount({ ...selectedAccount, notes: e.target.value })
                  }
                  className={COMPACT_INPUT_CLS}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-500 py-2.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
              >
                UPDATE ACCOUNT RECORD
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. EXPORT USERNAME:PASSWORD:COOKIE MODAL */}
      {exportModalText !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onCloseExportModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl rounded-2xl border border-zinc-700/90 bg-zinc-900 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-mono text-[10px] text-emerald-400">
                    EXPORT CREDENTIALS &bull; {formattedExport.parsedRows.length} AKUN
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Registered Account Credentials Export
                  </h3>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={onCloseExportModal}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 font-mono text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                CLOSE
              </button>
            </div>

            {/* Format Preset Selector */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-zinc-400">PILIH FORMAT OUTPUT:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'USER_PASS_COOKIE', label: 'user:pass:cookie' },
                      { id: 'USER_PASS', label: 'user:pass' },
                      { id: 'COOKIE_ONLY', label: 'cookie saja' },
                      { id: 'USER_ONLY', label: 'username saja' },
                      { id: 'CUSTOM', label: 'Custom Template' },
                    ] as Array<{ id: ExportFormatPreset; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setExportPreset(opt.id)}
                      className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition cursor-pointer ${
                        exportPreset === opt.id
                          ? 'border-emerald-500/50 bg-emerald-500/15 font-semibold text-emerald-300'
                          : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {exportPreset === 'CUSTOM' && (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                  <span className="font-mono text-[11px] text-zinc-400 shrink-0">
                    Template (gunakan {'{user}'}, {'{pass}'}, {'{cookie}'}):
                  </span>
                  <input
                    type="text"
                    value={customExportTemplate}
                    onChange={(e) => setCustomExportTemplate(e.target.value)}
                    placeholder="{user}|{pass}|{cookie}"
                    className={COMPACT_INPUT_CLS + ' font-mono'}
                  />
                </div>
              )}
            </div>

            <textarea
              readOnly
              rows={9}
              value={formattedExport.formattedText}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 font-mono text-xs text-emerald-300 focus:outline-none"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-zinc-500">
                Juga otomatis tersimpan di: ./data/registered_accounts.txt
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['txt', 'csv', 'json'] as const).map((ext) => (
                  <button
                    key={ext}
                    type="button"
                    disabled={formattedExport.parsedRows.length === 0}
                    onClick={() => {
                      const count = downloadExportFile(
                        exportModalText,
                        ext,
                        exportPreset,
                        customExportTemplate
                      );
                      onNotify('success', `Berhasil mengunduh ${count} akun ke file .${ext.toUpperCase()}!`);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs font-medium text-zinc-200 hover:border-cyan-500/40 hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5 text-cyan-400" />
                    .{ext.toUpperCase()}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(formattedExport.formattedText);
                    onNotify('success', 'Copied formatted credentials to clipboard!');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 font-mono text-xs font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  COPY ALL TO CLIPBOARD
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
