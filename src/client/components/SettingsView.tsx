import React, { useState } from 'react';
import { Settings, ShieldCheck, HardDrive, Save, KeyRound } from 'lucide-react';
import { INPUT_CLS } from './types.js';

interface SettingsViewProps {
  settingsData: Record<string, any> | null;
  setSettingsData: (next: Record<string, any>) => void;
  healthData: Record<string, any> | null;
  onSaveSettings: (e: React.FormEvent) => void;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

/**
 * Engine defaults, password rotation, platform compliance controls, and vault telemetry.
 */
export function SettingsView({
  settingsData,
  setSettingsData,
  healthData,
  onSaveSettings,
  onChangePassword,
}: SettingsViewProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    if (newPassword.length < 8) {
      setPassError('Password baru minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPassError('Konfirmasi password baru tidak sama.');
      return;
    }
    setChangingPass(true);
    try {
      const ok = await onChangePassword(currentPassword, newPassword);
      if (ok) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } finally {
      setChangingPass(false);
    }
  };
  if (!settingsData) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center font-mono text-xs text-zinc-400">
        Loading system settings &amp; telemetry...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 p-6">
        <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Settings className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Generator Default Configuration
            </h2>
            <p className="text-xs text-zinc-400">
              Persisted system defaults for candidate username and password generation.
            </p>
          </div>
        </div>

        <form onSubmit={onSaveSettings} className="space-y-4">
          <div>
            <label
              htmlFor="settings-default-prefix"
              className="mb-1.5 block font-mono text-[11px] uppercase text-zinc-400"
            >
              Default Prefix
            </label>
            <input
              id="settings-default-prefix"
              type="text"
              value={settingsData.generator.defaultPrefix}
              onChange={(e) =>
                setSettingsData({
                  ...settingsData,
                  generator: { ...settingsData.generator, defaultPrefix: e.target.value },
                })
              }
              className={INPUT_CLS}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="settings-default-length"
                className="mb-1.5 block font-mono text-[11px] uppercase text-zinc-400"
              >
                Default Username Length (3 - 20)
              </label>
              <input
                id="settings-default-length"
                type="number"
                min={3}
                max={20}
                value={settingsData.generator.defaultLength}
                onChange={(e) =>
                  setSettingsData({
                    ...settingsData,
                    generator: {
                      ...settingsData.generator,
                      defaultLength: Number(e.target.value),
                    },
                  })
                }
                className={`${INPUT_CLS} font-mono tabular-nums`}
              />
            </div>

            <div>
              <label
                htmlFor="settings-default-password-length"
                className="mb-1.5 block font-mono text-[11px] uppercase text-zinc-400"
              >
                Default Password Length (12 - 64)
              </label>
              <input
                id="settings-default-password-length"
                type="number"
                min={12}
                max={64}
                value={settingsData.generator.defaultPasswordLength}
                onChange={(e) =>
                  setSettingsData({
                    ...settingsData,
                    generator: {
                      ...settingsData.generator,
                      defaultPasswordLength: Number(e.target.value),
                    },
                  })
                }
                className={`${INPUT_CLS} font-mono tabular-nums`}
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            SAVE GENERATOR DEFAULTS
          </button>
        </form>
      </section>

        <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 p-6">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4 mb-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <KeyRound className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Ubah Password Akun Dashboard
              </h2>
              <p className="text-xs text-zinc-400">
                Disarankan ubah password bawaan sebelum membuka akses internet ke HP.
              </p>
            </div>
          </div>

          {passError && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 font-mono text-xs text-rose-200">
              {passError}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="current-password"
                className="mb-1 block font-mono text-[11px] uppercase text-zinc-400"
              >
                Password Saat Ini
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={INPUT_CLS}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-1 block font-mono text-[11px] uppercase text-zinc-400"
                >
                  Password Baru (Min 8)
                </label>
                <input
                  id="new-password"
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={INPUT_CLS}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="mb-1 block font-mono text-[11px] uppercase text-zinc-400"
                >
                  Konfirmasi Password
                </label>
                <input
                  id="confirm-new-password"
                  type="password"
                  minLength={8}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className={INPUT_CLS}
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={changingPass}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 font-mono text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50 cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {changingPass ? 'MENYIMPAN...' : 'SIMPAN PASSWORD BARU'}
            </button>
          </form>
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 p-6">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Security &amp; Platform Compliance Controls
              </h2>
              <p className="text-xs text-zinc-400">
                Enforced safeguards and cryptographic configuration.
              </p>
            </div>
          </div>

          <dl className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/60 px-3 py-2">
              <dt className="text-zinc-500">PASSWORD HASHING</dt>
              <dd className="text-zinc-200">{settingsData.security.passwordHashing}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/60 px-3 py-2">
              <dt className="text-zinc-500">SESSION POLICY</dt>
              <dd className="text-zinc-200">{settingsData.security.sessionPolicy}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/60 px-3 py-2">
              <dt className="text-zinc-500">CAPTCHA BYPASS PROHIBITED</dt>
              <dd className="text-emerald-400">ENFORCED (TRUE)</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/60 px-3 py-2">
              <dt className="text-zinc-500">HUMAN SUPERVISION REQUIRED</dt>
              <dd className="text-emerald-400">ENFORCED (TRUE)</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 p-6">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <HardDrive className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Credential Vault &amp; Storage Health
              </h2>
              <p className="text-xs text-zinc-400">Live telemetry from /api/v1/system/health</p>
            </div>
          </div>

          <dl className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/60 px-3 py-2">
              <dt className="text-zinc-500">VAULT CIPHER</dt>
              <dd className="text-zinc-200">{settingsData.storage.vaultAlgorithm}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/60 px-3 py-2">
              <dt className="text-zinc-500">MASTER KEY SOURCE</dt>
              <dd className="text-zinc-200">{settingsData.storage.keyLocation}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/60 px-3 py-2">
              <dt className="text-zinc-500">SEALED VAULT CREDENTIALS</dt>
              <dd className="tabular-nums text-emerald-300">
                {healthData?.vault?.encryptedRecords ?? 0} records
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/60 px-3 py-2">
              <dt className="text-zinc-500">REGISTERED ACCOUNTS</dt>
              <dd className="tabular-nums text-cyan-300">
                {healthData?.metrics?.registeredAccounts ?? 0} records
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
