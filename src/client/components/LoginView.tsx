import React, { useState } from 'react';
import { ShieldCheck, Lock, User, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import { INPUT_CLS } from './types.js';

interface LoginViewProps {
  loginUsername: string;
  setLoginUsername: (val: string) => void;
  loginPassword: string;
  setLoginPassword: (val: string) => void;
  loginError: string | null;
  isLocalAccess: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * Playful Neo-Brutalist Arcade authentication screen (inspired by aaxyou.store)
 * with preserved E2E headings/buttons.
 */
export function LoginView({
  loginUsername,
  setLoginUsername,
  loginPassword,
  setLoginPassword,
  loginError,
  isLocalAccess,
  onSubmit,
}: LoginViewProps) {
  const [showPassword, setShowPassword] = useState(false);

  const applyPreset = (u: string, p: string) => {
    setLoginUsername(u);
    setLoginPassword(p);
  };

  return (
    <div className="aax-theme relative min-h-screen flex flex-col justify-between overflow-hidden">
      {/* Top Sky Banner */}
      <div className="aax-sky px-4 pt-8 pb-16 text-center">
        <div className="aax-pixel-cloud top-8 left-[12%] hidden sm:block" aria-hidden="true" />
        <div className="aax-pixel-cloud top-12 right-[15%] hidden sm:block" aria-hidden="true" />

        <div className="relative z-10 mx-auto max-w-xl space-y-3">
          <div className="inline-flex flex-wrap items-center justify-center gap-2">
            <span className="aax-pixel-tag">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>RAGE ENGINE // V1.0</span>
            </span>
            <span className="aax-sticker">24/7 AUTOFILL</span>
          </div>
          <h1 className="aax-hero-title text-2xl sm:text-4xl">
            Roblox Account Generator Engine
          </h1>
          <p className="text-xs sm:text-sm font-bold text-[#e6f0ff]">
            Human-Supervised Account Preparation &amp; AES-256-GCM Credential Vault
          </p>
        </div>
      </div>

      {/* Centered Neo-Brutalist Login Card */}
      <div className="relative z-20 -mt-10 mb-auto flex items-center justify-center px-4 pb-10">
        <div className="aax-card w-full max-w-md p-6 sm:p-7 shadow-[0_8px_0_#0a1f3d]">
          <div className="mb-5 flex items-center justify-between border-b-2 dashed border-[#b6c9e2] pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0a1f3d] bg-[#ffc533] font-black text-base text-[#0a1f3d] shadow-[2px_2px_0_#0a1f3d]">
                R
              </span>
              <div>
                <div className="text-sm font-black text-[#0a1f3d]">
                  OPERATOR <span className="text-[#0e72e6]">LOGIN</span>
                </div>
                <div className="font-mono text-[11px] font-bold text-[#52657f]">
                  Masuk ke Command Center RAGE
                </div>
              </div>
            </div>
            <span className="rounded-lg border-2 border-[#0a1f3d] bg-[#dcebff] px-2 py-0.5 font-mono text-[10px] font-black text-[#0a56b4]">
              AES-256
            </span>
          </div>

          {loginError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border-2 border-[#0a1f3d] bg-[#ffe0e5] px-3.5 py-3 text-xs font-bold text-[#a8102a] shadow-[0_3px_0_#0a1f3d]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f0364f]" />
              <span className="font-mono leading-relaxed">{loginError}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="mb-1.5 block text-[11px] font-mono font-extrabold uppercase tracking-wider text-[#2a3f60]"
              >
                Operator Username
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52657f]" />
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
                className="mb-1.5 block text-[11px] font-mono font-extrabold uppercase tracking-wider text-[#2a3f60]"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52657f]" />
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg border-2 border-[#0a1f3d] bg-white p-1 text-[#0a1f3d] hover:bg-[#ffc533] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="aax-btn-gold mt-1 flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-black cursor-pointer"
            >
              <span>Sign In to Engine</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {isLocalAccess ? (
            <div className="mt-6 rounded-2xl border-2 border-[#0a1f3d] bg-[#f3f8fe] p-3.5 text-[11px] font-mono">
              <div className="mb-2 flex items-center justify-between font-extrabold text-[#2a3f60]">
                <span>SEEDED CREDENTIALS (LOCALHOST)</span>
                <span className="text-[10px] text-[#0e72e6]">Klik untuk isi cepat</span>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => applyPreset('admin', 'Admin@RobloxEngine2026!')}
                  className="flex w-full items-center justify-between rounded-xl border-2 border-[#0a1f3d] bg-white px-3 py-2 text-left font-bold text-[#0a1f3d] shadow-[0_2px_0_#0a1f3d] transition hover:bg-[#fff0c7] cursor-pointer"
                >
                  <span>admin / Admin@RobloxEngine2026!</span>
                  <span className="rounded-md border-[1.5px] border-[#0a1f3d] bg-[#ffc533] px-1.5 py-0.5 text-[10px] font-black text-[#0a1f3d]">
                    ADMIN
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('operator', 'Operator@RobloxEngine2026!')}
                  className="flex w-full items-center justify-between rounded-xl border-2 border-[#0a1f3d] bg-white px-3 py-2 text-left font-bold text-[#0a1f3d] shadow-[0_2px_0_#0a1f3d] transition hover:bg-[#dcebff] cursor-pointer"
                >
                  <span>operator / Operator@RobloxEngine2026!</span>
                  <span className="rounded-md border-[1.5px] border-[#0a1f3d] bg-[#7fd0ff] px-1.5 py-0.5 text-[10px] font-black text-[#0a1f3d]">
                    OPERATOR
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border-2 border-[#0a1f3d] bg-[#dcebff] p-3 text-[11px] font-mono font-bold text-[#0a56b4] leading-relaxed">
              Akses jarak jauh aktif. Masukkan username &amp; password operator Anda secara manual untuk melindungi akses publik.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
