import React, { useState } from 'react';
import { ShieldCheck, Lock, User, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import { INPUT_CLS } from './types.js';

interface LoginViewProps {
  loginUsername: string;
  setLoginUsername: (val: string) => void;
  loginPassword: string;
  setLoginPassword: (val: string) => void;
  loginError: string | null;
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * Modern SaaS dark authentication card with preserved E2E headings/buttons.
 */
export function LoginView({
  loginUsername,
  setLoginUsername,
  loginPassword,
  setLoginPassword,
  loginError,
  onSubmit,
}: LoginViewProps) {
  const [showPassword, setShowPassword] = useState(false);

  const applyPreset = (u: string, p: string) => {
    setLoginUsername(u);
    setLoginPassword(p);
  };

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 overflow-hidden rage-grid-bg">
      {/* Ambient emerald & cyan glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-tr from-emerald-500/15 via-cyan-500/10 to-transparent blur-3xl"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800/90 bg-zinc-900/75 backdrop-blur-xl p-7 shadow-2xl shadow-black/60">
        <div className="mb-6 border-b border-zinc-800/80 pb-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>RAGE ENGINE // V1.0</span>
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-zinc-50">
            Roblox Account Generator Engine
          </h1>
          <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
            Human-Supervised Account Preparation &amp; AES-256-GCM Credential Vault
          </p>
        </div>

        {loginError && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3.5 py-3 text-xs text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span className="font-mono leading-relaxed">{loginError}</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-username"
              className="mb-1.5 block text-[11px] font-mono uppercase tracking-wider text-zinc-400"
            >
              Operator Username
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className={`${INPUT_CLS} pl-9`}
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-[11px] font-mono uppercase tracking-wider text-zinc-400"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className={`${INPUT_CLS} pl-9 pr-10`}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
          >
            <span>Sign In to Engine</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3.5 text-[11px] font-mono text-zinc-400">
          <div className="mb-2 flex items-center justify-between text-zinc-500">
            <span>SEEDED CREDENTIALS</span>
            <span className="text-[10px] text-zinc-600">Klik untuk isi cepat</span>
          </div>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => applyPreset('admin', 'Admin@RobloxEngine2026!')}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-2.5 py-1.5 text-left transition hover:border-emerald-500/40 hover:text-zinc-200 cursor-pointer"
            >
              <span>admin / Admin@RobloxEngine2026!</span>
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                ADMIN
              </span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('operator', 'Operator@RobloxEngine2026!')}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-2.5 py-1.5 text-left transition hover:border-cyan-500/40 hover:text-zinc-200 cursor-pointer"
            >
              <span>operator / Operator@RobloxEngine2026!</span>
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300">
                OPERATOR
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
