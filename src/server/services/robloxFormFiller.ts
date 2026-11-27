import type { Page } from 'playwright';
import type { FirefoxMarionetteSession } from './firefoxMarionetteDriver.js';

export interface RobloxSignupFormPayload {
  birthMonth: string; // 'Jan'..'Dec'
  birthDay: string; // '01'..'28'
  birthYear: string; // '1990'..'2010'
  username: string;
  gender: 'MALE' | 'FEMALE';
  password: string;
}

export interface RobloxAutofillResult {
  ok: boolean;
  step1Filled: boolean;
  continueClicked: boolean;
  passwordFilled: boolean;
  submitClicked: boolean;
}

/**
 * Skrip JS murni (ES2020) hasil inspeksi langsung DOM https://www.roblox.com/CreateAccount.
 * Mendukung dua variasi UI Roblox:
 *  - V2 (Radix Combobox + Continue -> #signup-v2-password + button[aria-label="Add password"])
 *  - V1 (select#MonthDropdown/#DayDropdown/#YearDropdown + #signup-username + #MaleButton/#FemaleButton + #signup-password + #signup-button)
 *
 * Mengisi formulir dan mengklik tombol Sign Up (`Add password` / `#signup-button`) secara otomatis
 * agar pengguna hanya mengerjakan tantangan CAPTCHA. Tidak menyentuh/mengakali CAPTCHA.
 */
export const ROBLOX_SIGNUP_AUTOFILL_BROWSER_FN = `function(data) {
  return new Promise(function(resolve) {
    try {
      var setSelect = function(sel, val) {
        if (!sel) return false;
        var desc = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
        if (desc && desc.set) desc.set.call(sel, val);
        else sel.value = val;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return sel.value === val;
      };
      var setInput = function(el, val) {
        if (!el) return false;
        el.focus();
        var tracker = el._valueTracker;
        if (tracker && typeof tracker.setValue === 'function') {
          tracker.setValue(el.value === val ? '' : el.value);
        }
        var desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (desc && desc.set) desc.set.call(el, val);
        else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        try {
          el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
        } catch (_e) {}
        return el.value === val;
      };

      var applyBirthday = function() {
        var selects = Array.from(document.querySelectorAll('select'));
        var findByOpt = function(val) {
          return selects.find(function(s) {
            return Array.from(s.options).some(function(o) { return o.value === val; });
          });
        };
        var findSelFallback = function(found, selCss) {
          return found || document.querySelector(selCss);
        };
        var mSel = findByOpt('Jan') || document.querySelector('select#MonthDropdown, #MonthDropdown select');
        var dSel = findSelFallback(findByOpt('01'), 'select#DayDropdown, #DayDropdown select');
        var ySel = findSelFallback(findByOpt('2000') || findByOpt('2001'), 'select#YearDropdown, #YearDropdown select');
        var mOk = setSelect(mSel, data.birthMonth);
        var dOk = setSelect(dSel, data.birthDay);
        var yOk = setSelect(ySel, data.birthYear);
        return Boolean(mOk && dOk && yOk);
      };

      var clickGender = function() {
        var targetGenderRe = data.gender === 'MALE' ? /^Male$/i : /^Female$/i;
        var genderBtns = Array.from(document.querySelectorAll('button')).filter(function(b) {
          return /^(Male|Female)$/i.test((b.textContent || '').trim());
        });
        var matchedGenderBtn = genderBtns.find(function(b) {
          return targetGenderRe.test((b.textContent || '').trim());
        });
        if (matchedGenderBtn) {
          matchedGenderBtn.click();
          return true;
        }
        var legacyGenderBtn = document.querySelector(data.gender === 'MALE' ? '#MaleButton' : '#FemaleButton');
        if (legacyGenderBtn) {
          legacyGenderBtn.click();
          return true;
        }
        return false;
      };

      var findContinueBtn = function() {
        var direct = document.querySelector('button[aria-label="Continue"], form[data-testid="signup-form-v2"] button[type="submit"]');
        if (direct) return direct;
        return Array.from(document.querySelectorAll('button')).find(function(b) {
          return /^(Continue|Next|Lanjutkan)$/i.test((b.textContent || '').trim());
        }) || null;
      };

      var isStep2Active = function() {
        var panel2 = document.querySelector('[data-testid="signup-v2-add-auth-method-panel"]');
        if (panel2) {
          return !panel2.classList.contains('invisible') && panel2.getAttribute('aria-hidden') !== 'true';
        }
        var passEl = document.querySelector('#signup-v2-password, #signup-password, input[name="signupPassword"]');
        if (!passEl) return false;
        if (findContinueBtn()) return false;
        var cs = window.getComputedStyle(passEl);
        return cs.visibility !== 'hidden' && cs.display !== 'none';
      };

      var findAddPasswordBtn = function() {
        var direct = document.querySelector('button[aria-label="Add password"], form[data-testid="add-auth-method-page"] button[type="submit"], [data-testid="password-auth-method"] button[type="submit"]');
        if (direct) return direct;
        var panel2 = document.querySelector('[data-testid="signup-v2-add-auth-method-panel"]') || document;
        return Array.from(panel2.querySelectorAll('button')).find(function(b) {
          return /^(Add password|Sign Up|Create Account|Tambahkan kata sandi)$/i.test((b.textContent || '').trim());
        }) || null;
      };

      var findV1SignupBtn = function() {
        var direct = document.querySelector('#signup-button');
        if (direct) return direct;
        var textMatch = Array.from(document.querySelectorAll('button')).find(function(b) {
          return /^(Sign Up|Daftar)$/i.test((b.textContent || '').trim());
        });
        if (textMatch) return textMatch;
        return document.querySelector('button[type="submit"]');
      };

      var hasBirthdayPromptError = function() {
        var wrap = (document.querySelector('#signup-username, input[name="signupUsername"]') || {}).parentElement;
        var text = (document.querySelector('[data-testid="signup-v2-form-panel"], form') || document.body).innerText || '';
        return /Birthday must be set first/i.test((wrap ? wrap.innerText : '') + '\\n' + text);
      };

      var hasUsernameError = function() {
        var userEl = document.querySelector('#signup-username, input[name="signupUsername"]');
        if (!userEl) return false;
        if (userEl.getAttribute('aria-invalid') === 'true') return true;
        var v1Err = document.querySelector('#signup-usernameInputValidation');
        if (v1Err && (v1Err.textContent || '').trim().length > 0) return true;
        var scope = document.querySelector('[data-testid="signup-v2-form-panel"]') || userEl.closest('form') || document.body;
        var scopeText = (scope && scope.innerText) || '';
        return /(?:^|\\n)\\s*(?:This username is already in use|Username is already in use|Username not appropriate for Roblox|Username is not appropriate|Usernames can only|Username must be|Birthday must be set first)/i.test(scopeText);
      };

      var mutateSafeUsername = function(curr) {
        var cons = 'bcdfghjklmnprstvwyz';
        var vows = 'aeiou';
        var c1 = cons[Math.floor(Math.random() * cons.length)].toUpperCase();
        var v1 = vows[Math.floor(Math.random() * vows.length)];
        var d1 = Math.floor(Math.random() * 9) + 1;
        var d2 = Math.floor(Math.random() * 10);
        var tail = c1 + v1 + String(d1) + String(d2);
        var base = String(curr || 'rbxuser').replace(/_+$/g, '');
        if (base.length <= 6) {
          return (base + tail).slice(0, 20);
        }
        var keepLen = Math.min(Math.max(3, base.length - 4), 16);
        return (base.slice(0, keepLen) + tail).slice(0, 20);
      };

      var randDelay = function(minMs, maxMs) {
        return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
      };
      var hasRealPx3Cookie = function() {
        return /(?:^|;\\s*)_px3=/.test(document.cookie || '');
      };

      var triggerButtonClick = function(btn) {
        if (!btn || btn.disabled) return false;
        try {
          if (typeof btn.scrollIntoView === 'function') {
            btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        } catch (_e) {}
        try { btn.focus(); } catch (_e) {}
        btn.click();
        // Watchdog: simulasikan urutan Pointer+Mouse event lengkap agar React 18 handler pasti terpanggil
        try {
          var rect = btn.getBoundingClientRect();
          var cx = rect.left + rect.width / 2;
          var cy = rect.top + rect.height / 2;
          var evOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, pointerId: 1, pointerType: 'mouse' };
          btn.dispatchEvent(new PointerEvent('pointerdown', evOpts));
          btn.dispatchEvent(new MouseEvent('mousedown', evOpts));
          btn.dispatchEvent(new PointerEvent('pointerup', evOpts));
          btn.dispatchEvent(new MouseEvent('mouseup', evOpts));
          btn.dispatchEvent(new MouseEvent('click', evOpts));
        } catch (_e) {}
        return true;
      };

      var bdayOk = applyBirthday();
      var activeUsername = data.username;
      var userMutations = 0;

      // Tunggu sesaat agar React mem-flush state Birthday sebelum Username diisi (hindari "Birthday must be set first")
      setTimeout(function() {
        if (!bdayOk) bdayOk = applyBirthday();
        var userEl = document.querySelector('#signup-username, input[name="signupUsername"]');
        var uOk = setInput(userEl, activeUsername);
        var gOk = clickGender();
        var step1Filled = Boolean(bdayOk && uOk && gOk);

        // Tunggu layout V2 (Continue) atau V1 (signup-password + signup-button) siap sebelum memilih alur
        var layoutWaitTries = 0;
        var waitLayoutTimer = setInterval(function() {
          layoutWaitTries++;
          var hasV2Cont = Boolean(findContinueBtn());
          var v1PassEl = document.querySelector('#signup-password, input[name="signupPassword"]');
          var hasV1Ready = Boolean(v1PassEl && findV1SignupBtn());
          if (!hasV2Cont && !hasV1Ready && layoutWaitTries < 20) {
            return;
          }
          clearInterval(waitLayoutTimer);

          if (!hasV2Cont) {
            // Alur V1 (Sign Up langsung)
            var v1PassOk = setInput(v1PassEl, data.password);
            if (!v1PassOk) {
              resolve({
                ok: false,
                step1Filled: step1Filled,
                continueClicked: false,
                passwordFilled: false,
                submitClicked: false
              });
              return;
            }
            var v1Tries = 0;
            var v1Clicking = false;
            var v1Nudged = false;
            var v1Timer = setInterval(function() {
              v1Tries++;
              if (v1Clicking) return;

              if (hasBirthdayPromptError()) {
                applyBirthday();
              }
              if (hasUsernameError() && userMutations < 5) {
                userMutations++;
                activeUsername = mutateSafeUsername(activeUsername);
                var ue = document.querySelector('#signup-username, input[name="signupUsername"]');
                setInput(ue, activeUsername);
                return;
              }

              var sBtn = findV1SignupBtn();
              var pxReady = hasRealPx3Cookie() || v1Tries >= 16;
              if (sBtn && !sBtn.disabled && pxReady) {
                v1Clicking = true;
                setTimeout(function() {
                  var latestBtn = findV1SignupBtn();
                  if (latestBtn && !latestBtn.disabled) {
                    triggerButtonClick(latestBtn);
                    // Watchdog: verifikasi klik Sign Up berhasil (tombol disabled/hilang atau captcha muncul), retry jika belum
                    var wdV1Count = 0;
                    var wdV1Timer = setInterval(function() {
                      wdV1Count++;
                      var curBtn = findV1SignupBtn();
                      var captcha = document.querySelector('iframe[src*="arkose"], iframe[src*="funcaptcha"]');
                      if (!curBtn || curBtn.disabled || captcha) {
                        clearInterval(wdV1Timer);
                        clearInterval(v1Timer);
                        resolve({
                          ok: step1Filled && v1PassOk,
                          step1Filled: step1Filled,
                          continueClicked: false,
                          passwordFilled: v1PassOk,
                          submitClicked: true
                        });
                        return;
                      }
                      if (wdV1Count >= 6) {
                        clearInterval(wdV1Timer);
                        v1Clicking = false;
                        return;
                      }
                      triggerButtonClick(curBtn);
                      if (wdV1Count === 3 && curBtn.form && typeof curBtn.form.requestSubmit === 'function') {
                        try { curBtn.form.requestSubmit(curBtn); } catch (_e) {}
                      }
                    }, 800);
                    return;
                  }
                  v1Clicking = false;
                }, randDelay(260, 580));
                return;
              }

              if (!v1Nudged && (v1Tries === 18 || v1Tries === 42) && sBtn && sBtn.disabled) {
                v1Nudged = v1Tries === 42;
                var ue2 = document.querySelector('#signup-username, input[name="signupUsername"]');
                if (ue2) {
                  setInput(ue2, activeUsername + '1');
                  setTimeout(function() {
                    setInput(ue2, activeUsername);
                    var pe2 = document.querySelector('#signup-password, input[name="signupPassword"]');
                    if (pe2) setInput(pe2, data.password);
                  }, 150);
                }
              }

              if (v1Tries >= 120) {
                clearInterval(v1Timer);
                resolve({
                  ok: false,
                  step1Filled: step1Filled,
                  continueClicked: false,
                  passwordFilled: v1PassOk,
                  submitClicked: false
                });
              }
            }, 250);
            return;
          }

          // Alur V2 (Step 1 Continue -> Step 2 Add password / Sign Up)
          var runStep2 = function() {
            var passEl = document.querySelector('#signup-v2-password, #signup-password, input[name="signupPassword"]');
            var pOk = setInput(passEl, data.password);
            setTimeout(function() {
              if (passEl && passEl.value !== data.password) {
                pOk = setInput(passEl, data.password);
              }
              if (!pOk) {
                resolve({
                  ok: false,
                  step1Filled: step1Filled,
                  continueClicked: true,
                  passwordFilled: false,
                  submitClicked: false
                });
                return;
              }
              var subTry = 0;
              var subClicking = false;
              var subTimer = setInterval(function() {
                subTry++;
                if (subClicking) return;

                var btn = findAddPasswordBtn();
                var pxReady = hasRealPx3Cookie() || subTry >= 16;
                if (btn && !btn.disabled && pxReady) {
                  subClicking = true;
                  setTimeout(function() {
                    var latestBtn = findAddPasswordBtn();
                    if (latestBtn && !latestBtn.disabled) {
                      triggerButtonClick(latestBtn);
                      // Watchdog: verifikasi klik Add Password berhasil, retry jika belum
                      var wdApCount = 0;
                      var wdApTimer = setInterval(function() {
                        wdApCount++;
                        var curBtn = findAddPasswordBtn();
                        var captcha = document.querySelector('iframe[src*="arkose"], iframe[src*="funcaptcha"]');
                        if (!curBtn || curBtn.disabled || captcha) {
                          clearInterval(wdApTimer);
                          clearInterval(subTimer);
                          resolve({
                            ok: step1Filled && pOk,
                            step1Filled: step1Filled,
                            continueClicked: true,
                            passwordFilled: true,
                            submitClicked: true
                          });
                          return;
                        }
                        if (wdApCount >= 6) {
                          clearInterval(wdApTimer);
                          subClicking = false;
                          return;
                        }
                        triggerButtonClick(curBtn);
                        if (wdApCount === 3 && curBtn.form && typeof curBtn.form.requestSubmit === 'function') {
                          try { curBtn.form.requestSubmit(curBtn); } catch (_e) {}
                        }
                      }, 800);
                      return;
                    }
                    subClicking = false;
                  }, randDelay(280, 620));
                  return;
                }

                // Jika XHR /v2/passwords/validate macet di proxy (> 4.5s atau 10s), picu ulang validasi
                if ((subTry === 18 || subTry === 40) && btn && btn.disabled) {
                  var pResetEl = document.querySelector('#signup-v2-password, #signup-password, input[name="signupPassword"]');
                  if (pResetEl) {
                    setInput(pResetEl, data.password + 'x');
                    setTimeout(function() {
                      setInput(pResetEl, data.password);
                    }, 150);
                  }
                }

                if (subTry >= 120) {
                  clearInterval(subTimer);
                  resolve({
                    ok: false,
                    step1Filled: step1Filled,
                    continueClicked: true,
                    passwordFilled: true,
                    submitClicked: false
                  });
                }
              }, 250);
            }, randDelay(450, 920));
          };

          var attempts = 0;
          var clickingContinue = false;
          var step2DoneStarted = false;
          var timer = setInterval(function() {
            attempts++;
            if (step2DoneStarted) return;

            if (isStep2Active()) {
              step2DoneStarted = true;
              clearInterval(timer);
              runStep2();
              return;
            }
            if (clickingContinue) return;

            if (hasBirthdayPromptError()) {
              applyBirthday();
            }
            if (hasUsernameError() && userMutations < 5) {
              userMutations++;
              activeUsername = mutateSafeUsername(activeUsername);
              var ue = document.querySelector('#signup-username, input[name="signupUsername"]');
              setInput(ue, activeUsername);
              return;
            }

            var contBtn = findContinueBtn();
            if (contBtn && !contBtn.disabled) {
              clickingContinue = true;
              setTimeout(function() {
                if (isStep2Active()) {
                  if (!step2DoneStarted) {
                    step2DoneStarted = true;
                    clearInterval(timer);
                    runStep2();
                  }
                  return;
                }
                var latestCont = findContinueBtn();
                if (!latestCont || latestCont.disabled) {
                  clickingContinue = false;
                  return;
                }
                triggerButtonClick(latestCont);
                var verifyCount = 0;
                var verifyStep2 = setInterval(function() {
                  verifyCount++;
                  if (isStep2Active()) {
                    clearInterval(verifyStep2);
                    if (!step2DoneStarted) {
                      step2DoneStarted = true;
                      clearInterval(timer);
                      runStep2();
                    }
                    return;
                  }
                  if (verifyCount === 6 && latestCont && !latestCont.disabled && latestCont.form && typeof latestCont.form.requestSubmit === 'function') {
                    try { latestCont.form.requestSubmit(latestCont); } catch (_e) {}
                  }
                  if (verifyCount >= 12) {
                    clearInterval(verifyStep2);
                    clickingContinue = false;
                  }
                }, 150);
              }, randDelay(320, 680));
              return;
            }

            if ((attempts === 18 || attempts === 42) && contBtn && contBtn.disabled && !hasUsernameError()) {
              var ueStuck = document.querySelector('#signup-username, input[name="signupUsername"]');
              if (ueStuck) {
                setInput(ueStuck, activeUsername + '1');
                setTimeout(function() {
                  setInput(ueStuck, activeUsername);
                }, 150);
              }
            }

            if (attempts >= 120) {
              clearInterval(timer);
              resolve({
                ok: false,
                step1Filled: step1Filled,
                continueClicked: false,
                passwordFilled: false,
                submitClicked: false
              });
            }
          }, 250);
        }, 250);
      }, 90);
    } catch (_e) {
      resolve({
        ok: false,
        step1Filled: false,
        continueClicked: false,
        passwordFilled: false,
        submitClicked: false
      });
    }
  });
}`;

/**
 * Mengisi formulir Roblox CreateAccount lewat Marionette menggunakan logika DOM terverifikasi.
 * Sebagai cadangan, jika input teks React perlu ketikan native Marionette, melengkapi lewat ElementSendKeys.
 */
export async function runRobloxAutofillInMarionette(
  session: FirefoxMarionetteSession,
  payload: RobloxSignupFormPayload
): Promise<RobloxAutofillResult> {
  // Tunggu halaman signup selesai me-render input username, select lahir, dan tombol V2/V1
  const waitDeadline = Date.now() + 30000;
  while (Date.now() < waitDeadline) {
    const ready = await session
      .executeScript<boolean>(
        `return Boolean(
          document.querySelector('#signup-username, input[name="signupUsername"]') &&
          (Array.from(document.querySelectorAll('select')).some(function(s){return s.options.length>=12;}) ||
           document.querySelector('select#MonthDropdown, #MonthDropdown select')) &&
          (document.querySelector('button[aria-label="Continue"], form[data-testid="signup-form-v2"] button[type="submit"]') ||
           (document.querySelector('#signup-password, input[name="signupPassword"]') &&
            document.querySelector('#signup-button, button[type="submit"]')))
        );`
      )
      .catch(() => false);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 400));
  }

  const randJitter = (minMs: number, maxMs: number) =>
    minMs + Math.floor(Math.random() * (maxMs - minMs + 1));

  // Tunggu token anti-bot _px3 asli (bukan sekadar _pxvid) hingga ~4.5 detik + human jitter acak per worker
  const pxWaitStart = Date.now();
  const minPxJitterMs = randJitter(1450, 2350);
  const maxPxFallbackMs = randJitter(4400, 5100);
  while (Date.now() - pxWaitStart < maxPxFallbackMs) {
    const hasPx3 = await session
      .executeScript<boolean>(`return /(?:^|;\\s*)_px3=/.test(document.cookie || '');`)
      .catch(() => false);
    const elapsed = Date.now() - pxWaitStart;
    if (hasPx3 && elapsed >= minPxJitterMs) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  const applyMarionetteBirthday = async () => {
    await session
      .executeScript(
        `
        var d = arguments[0];
        var setSelect = function(sel, val) {
          if (!sel) return false;
          var desc = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
          if (desc && desc.set) desc.set.call(sel, val);
          else sel.value = val;
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return sel.value === val;
        };
        var selects = Array.from(document.querySelectorAll('select'));
        var findByOpt = function(val) {
          return selects.find(function(s) { return Array.from(s.options).some(function(o) { return o.value === val; }); });
        };
        setSelect(findByOpt('Jan') || document.querySelector('select#MonthDropdown, #MonthDropdown select'), d.birthMonth);
        setSelect(findByOpt('01') || document.querySelector('select#DayDropdown, #DayDropdown select'), d.birthDay);
        setSelect(findByOpt('2000') || findByOpt('2001') || document.querySelector('select#YearDropdown, #YearDropdown select'), d.birthYear);
        `,
        [payload]
      )
      .catch(() => {});
  };

  await applyMarionetteBirthday();
  // Beri jeda 100ms agar React mem-flush Birthday sebelum Username diisi
  await new Promise((r) => setTimeout(r, 100));

  let activeUsername = payload.username;
  const setMarionetteUsername = async (uname: string) => {
    const userEl = await session.findElement('#signup-username, input[name="signupUsername"]');
    if (userEl) {
      await session.clickElement(userEl).catch(() => {});
      await session.clearElement(userEl).catch(() => {});
      await session.sendKeysToElement(userEl, uname).catch(() => {});
    } else {
      await session
        .executeScript(
          `var el=document.querySelector('#signup-username, input[name="signupUsername"]');
           if(el){el.focus();if(el._valueTracker)el._valueTracker.setValue('');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,arguments[0]);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}`,
          [uname]
        )
        .catch(() => {});
    }
  };
  await setMarionetteUsername(activeUsername);

  const mutateMarionetteUsername = (curr: string): string => {
    const cons = 'bcdfghjklmnprstvwyz';
    const vows = 'aeiou';
    const c1 = cons[Math.floor(Math.random() * cons.length)].toUpperCase();
    const v1 = vows[Math.floor(Math.random() * vows.length)];
    const d1 = Math.floor(Math.random() * 9) + 1;
    const d2 = Math.floor(Math.random() * 10);
    const tail = `${c1}${v1}${d1}${d2}`;
    const base = curr.replace(/_+$/g, '');
    if (base.length <= 6) return (base + tail).slice(0, 20);
    const keepLen = Math.min(Math.max(3, base.length - 4), 16);
    return (base.slice(0, keepLen) + tail).slice(0, 20);
  };

  // Gender button
  await session
    .executeScript(
      `var target = arguments[0];
       var gRe = target === 'MALE' ? /^Male$/i : /^Female$/i;
       var btns = Array.from(document.querySelectorAll('button')).filter(function(b){return /^(Male|Female)$/i.test((b.textContent||'').trim());});
       var m = btns.find(function(b){return gRe.test((b.textContent||'').trim());});
       if(m){ m.click(); } else {
         var leg = document.querySelector(target === 'MALE' ? '#MaleButton' : '#FemaleButton');
         if(leg) leg.click();
       }`,
      [payload.gender]
    )
    .catch(() => {});

  const hasContinue = await session
    .executeScript<boolean>(
      `return Boolean(document.querySelector('button[aria-label="Continue"], form[data-testid="signup-form-v2"] button[type="submit"]'));`
    )
    .catch(() => false);

  const checkMarionetteUsernameError = async () =>
    session
      .executeScript<{ hasErr: boolean; bdayErr: boolean }>(
        `var u=document.querySelector('#signup-username, input[name="signupUsername"]');
         var inv=u && u.getAttribute('aria-invalid')==='true';
         var v1=document.querySelector('#signup-usernameInputValidation');
         var v1t=(v1&&v1.textContent||'').trim();
         var sc=(document.querySelector('[data-testid="signup-v2-form-panel"]')|| (u&&u.closest('form')) || document.body);
         var tx=(sc&&sc.innerText)||'';
         var bdayErr=/Birthday must be set first/i.test(tx);
         var msgErr=/(?:^|\\n)\\s*(?:This username is already in use|Username is already in use|Username not appropriate for Roblox|Username is not appropriate|Usernames can only|Username must be|Birthday must be set first)/i.test(tx);
         return { hasErr: Boolean(inv || v1t.length>0 || msgErr), bdayErr: bdayErr };`
      )
      .catch(() => ({ hasErr: false, bdayErr: false }));

  if (!hasContinue) {
    const passEl = await session.findElement('#signup-password, input[name="signupPassword"]');
    if (passEl) {
      await session.clickElement(passEl).catch(() => {});
      await session.clearElement(passEl).catch(() => {});
      await session.sendKeysToElement(passEl, payload.password).catch(() => {});
    }
    let submitClicked = false;
    let userMut = 0;
    const subStart = Date.now();
    const subDeadline = subStart + 30000;
    let nudged = false;
    while (Date.now() < subDeadline) {
      const errState = await checkMarionetteUsernameError();
      if (errState.bdayErr) {
        await applyMarionetteBirthday();
      }
      if (errState.hasErr && userMut < 5) {
        userMut++;
        activeUsername = mutateMarionetteUsername(activeUsername);
        await setMarionetteUsername(activeUsername);
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      const ready = await session
        .executeScript<boolean>(
          `var b=document.querySelector('#signup-button'); if(!b){b=Array.from(document.querySelectorAll('button')).find(function(x){return /^(Sign Up|Daftar)$/i.test((x.textContent||'').trim());})||document.querySelector('button[type="submit"]');} return Boolean(b && !b.disabled);`
        )
        .catch(() => false);
      if (ready) {
        await new Promise((r) => setTimeout(r, randJitter(280, 620)));
        // Watchdog: multi-strategy click + verifikasi
        await session
          .executeScript(
            `var b=document.querySelector('#signup-button'); if(!b){b=Array.from(document.querySelectorAll('button')).find(function(x){return /^(Sign Up|Daftar)$/i.test((x.textContent||'').trim());})||document.querySelector('button[type="submit"]');}
             if(b && !b.disabled){
               b.click();
               try{var r=b.getBoundingClientRect();var o={bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0,pointerId:1,pointerType:'mouse'};b.dispatchEvent(new PointerEvent('pointerdown',o));b.dispatchEvent(new MouseEvent('mousedown',o));b.dispatchEvent(new PointerEvent('pointerup',o));b.dispatchEvent(new MouseEvent('mouseup',o));b.dispatchEvent(new MouseEvent('click',o));}catch(_){}
               if(b.form && typeof b.form.requestSubmit==='function') try{b.form.requestSubmit(b);}catch(_){}
             }`
          )
          .catch(() => {});
        // Watchdog: verifikasi tombol Sign Up bereaksi (disabled/hilang atau captcha muncul)
        for (let wd = 0; wd < 6; wd++) {
          await new Promise((r) => setTimeout(r, 700));
          const btnGone = await session
            .executeScript<boolean>(
              `var b=document.querySelector('#signup-button'); if(!b){b=Array.from(document.querySelectorAll('button')).find(function(x){return /^(Sign Up|Daftar)$/i.test((x.textContent||'').trim());})||document.querySelector('button[type="submit"]');}
               var cap=document.querySelector('iframe[src*="arkose"], iframe[src*="funcaptcha"]');
               return (!b || b.disabled) || Boolean(cap);`
            )
            .catch(() => false);
          if (btnGone) {
            submitClicked = true;
            break;
          }
          await session
            .executeScript(
              `var b=document.querySelector('#signup-button'); if(!b){b=Array.from(document.querySelectorAll('button')).find(function(x){return /^(Sign Up|Daftar)$/i.test((x.textContent||'').trim());})||document.querySelector('button[type="submit"]');}
               if(b && !b.disabled){b.click();try{var r=b.getBoundingClientRect();var o={bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0,pointerId:1,pointerType:'mouse'};b.dispatchEvent(new PointerEvent('pointerdown',o));b.dispatchEvent(new MouseEvent('mousedown',o));b.dispatchEvent(new PointerEvent('pointerup',o));b.dispatchEvent(new MouseEvent('mouseup',o));b.dispatchEvent(new MouseEvent('click',o));}catch(_){}if(b.form && typeof b.form.requestSubmit==='function') try{b.form.requestSubmit(b);}catch(_){}}`
            )
            .catch(() => {});
        }
        if (submitClicked) break;
      }
      if (!nudged && Date.now() - subStart > 5000) {
        nudged = true;
        await setMarionetteUsername(activeUsername + '1');
        await new Promise((r) => setTimeout(r, 150));
        await setMarionetteUsername(activeUsername);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return {
      ok: Boolean(passEl) && submitClicked,
      step1Filled: true,
      continueClicked: false,
      passwordFilled: Boolean(passEl),
      submitClicked,
    };
  }

  let continueClicked = false;
  let userMut = 0;
  let step1Nudged = false;
  const contStart = Date.now();
  const contDeadline = contStart + 30000;
  while (Date.now() < contDeadline) {
    const alreadyStep2 = await session
      .executeScript<boolean>(
        `var p2=document.querySelector('[data-testid="signup-v2-add-auth-method-panel"]'); return Boolean(p2 && !p2.classList.contains('invisible') && p2.getAttribute('aria-hidden')!=='true');`
      )
      .catch(() => false);
    if (alreadyStep2) {
      continueClicked = true;
      break;
    }

    const errState = await checkMarionetteUsernameError();
    if (errState.bdayErr) {
      await applyMarionetteBirthday();
    }
    if (errState.hasErr && userMut < 5) {
      userMut++;
      activeUsername = mutateMarionetteUsername(activeUsername);
      await setMarionetteUsername(activeUsername);
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }

    const ready = await session
      .executeScript<boolean>(
        `var btn=document.querySelector('button[aria-label="Continue"]:not([disabled]), form[data-testid="signup-form-v2"] button[type="submit"]:not([disabled])'); return Boolean(btn);`
      )
      .catch(() => false);
    if (ready) {
      await new Promise((r) => setTimeout(r, randJitter(320, 680)));
      const stillReady = await session
        .executeScript<boolean>(
          `var btn=document.querySelector('button[aria-label="Continue"]:not([disabled]), form[data-testid="signup-form-v2"] button[type="submit"]:not([disabled])'); return Boolean(btn);`
        )
        .catch(() => false);
      if (stillReady) {
        const btnId = await session.findElement(
          'button[aria-label="Continue"], form[data-testid="signup-form-v2"] button[type="submit"]'
        );
        if (btnId) {
          await session.clickElement(btnId).catch(() => {});
        } else {
          await session
            .executeScript(
              `document.querySelector('button[aria-label="Continue"], form[data-testid="signup-form-v2"] button[type="submit"]')?.click();`
            )
            .catch(() => {});
        }
        // Watchdog: multi-strategy click (PointerEvent + requestSubmit) agar React handler pasti terpanggil
        await session
          .executeScript(
            `var b=document.querySelector('button[aria-label="Continue"], form[data-testid="signup-form-v2"] button[type="submit"]');
             if(b && !b.disabled){
               try{var r=b.getBoundingClientRect();var o={bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0,pointerId:1,pointerType:'mouse'};b.dispatchEvent(new PointerEvent('pointerdown',o));b.dispatchEvent(new MouseEvent('mousedown',o));b.dispatchEvent(new PointerEvent('pointerup',o));b.dispatchEvent(new MouseEvent('mouseup',o));b.dispatchEvent(new MouseEvent('click',o));}catch(_){}
               if(b.form && typeof b.form.requestSubmit==='function') try{b.form.requestSubmit(b);}catch(_){}
             }`
          )
          .catch(() => {});
        // Verifikasi panel Step 2 benar-benar aktif dalam ~1.5 detik
        for (let v = 0; v < 8; v++) {
          await new Promise((r) => setTimeout(r, 200));
          const step2Open = await session
            .executeScript<boolean>(
              `var p2=document.querySelector('[data-testid="signup-v2-add-auth-method-panel"]'); return Boolean(p2 && !p2.classList.contains('invisible') && p2.getAttribute('aria-hidden')!=='true');`
            )
            .catch(() => false);
          if (step2Open) {
            continueClicked = true;
            break;
          }
        }
        if (continueClicked) break;
      }
    }

    if (!step1Nudged && Date.now() - contStart > 5000) {
      step1Nudged = true;
      await setMarionetteUsername(activeUsername + '1');
      await new Promise((r) => setTimeout(r, 150));
      await setMarionetteUsername(activeUsername);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  let passwordFilled = false;
  let submitClicked = false;
  if (continueClicked) {
    // Tunggu sampai panel Step 2 (#signup-v2-add-auth-method-panel) benar-benar terbuka dan tidak invisible
    const step2WaitDeadline = Date.now() + 7000;
    while (Date.now() < step2WaitDeadline) {
      const visible = await session
        .executeScript<boolean>(
          `var p2=document.querySelector('[data-testid="signup-v2-add-auth-method-panel"]'); if(p2){ return !p2.classList.contains('invisible') && p2.getAttribute('aria-hidden')!=='true'; } var p=document.querySelector('#signup-v2-password'); if(!p)return false; var cs=getComputedStyle(p); return cs.visibility!=='hidden' && cs.display!=='none';`
        )
        .catch(() => false);
      if (visible) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    await new Promise((r) => setTimeout(r, 300));

    const v2PassEl = await session.findElement('#signup-v2-password, #signup-password, input[name="signupPassword"]');
    if (v2PassEl) {
      await session.clickElement(v2PassEl).catch(() => {});
      await session.clearElement(v2PassEl).catch(() => {});
      await session.sendKeysToElement(v2PassEl, payload.password).catch(() => {});
    }

    passwordFilled = await session
      .executeScript<boolean>(
        `var p=document.querySelector('#signup-v2-password, #signup-password, input[name="signupPassword"]');
         if(!p)return false;
         if(p.value!==arguments[0]){
           p.focus();
           if(p._valueTracker)p._valueTracker.setValue('');
           Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(p,arguments[0]);
           p.dispatchEvent(new Event('input',{bubbles:true}));
           p.dispatchEvent(new Event('change',{bubbles:true}));
         }
         return p.value===arguments[0];`,
        [payload.password]
      )
      .catch(() => false);

    if (passwordFilled) {
      const addStart = Date.now();
      const addDeadline = addStart + 30000;
      let passNudged = false;
      while (Date.now() < addDeadline) {
        const readyAdd = await session
          .executeScript<boolean>(
            `var btn=document.querySelector('button[aria-label="Add password"]:not([disabled]), form[data-testid="add-auth-method-page"] button[type="submit"]:not([disabled]), [data-testid="password-auth-method"] button[type="submit"]:not([disabled])'); return Boolean(btn);`
          )
          .catch(() => false);
        if (readyAdd) {
          await new Promise((r) => setTimeout(r, randJitter(320, 720)));
          const stillReadyAdd = await session
            .executeScript<boolean>(
              `var btn=document.querySelector('button[aria-label="Add password"]:not([disabled]), form[data-testid="add-auth-method-page"] button[type="submit"]:not([disabled]), [data-testid="password-auth-method"] button[type="submit"]:not([disabled])'); return Boolean(btn);`
            )
            .catch(() => false);
          if (stillReadyAdd) {
            const addBtnId = await session.findElement(
              'button[aria-label="Add password"], form[data-testid="add-auth-method-page"] button[type="submit"], [data-testid="password-auth-method"] button[type="submit"]'
            );
            if (addBtnId) {
              await session.clickElement(addBtnId).catch(() => {});
            }
            // Watchdog: klik JS + PointerEvent + requestSubmit, lalu verifikasi tombol bereaksi
            await session
              .executeScript(
                `var b=document.querySelector('button[aria-label="Add password"], form[data-testid="add-auth-method-page"] button[type="submit"], [data-testid="password-auth-method"] button[type="submit"]');
                 if(b && !b.disabled){
                   b.click();
                   try{var r=b.getBoundingClientRect();var o={bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0,pointerId:1,pointerType:'mouse'};b.dispatchEvent(new PointerEvent('pointerdown',o));b.dispatchEvent(new MouseEvent('mousedown',o));b.dispatchEvent(new PointerEvent('pointerup',o));b.dispatchEvent(new MouseEvent('mouseup',o));b.dispatchEvent(new MouseEvent('click',o));}catch(_){}
                   if(b.form && typeof b.form.requestSubmit==='function') try{b.form.requestSubmit(b);}catch(_){}
                 }`
              )
              .catch(() => {});
            // Verifikasi watchdog: tombol harus disabled/hilang atau captcha muncul
            for (let wd = 0; wd < 6; wd++) {
              await new Promise((r) => setTimeout(r, 700));
              const btnGone = await session
                .executeScript<boolean>(
                  `var b=document.querySelector('button[aria-label="Add password"]:not([disabled]), form[data-testid="add-auth-method-page"] button[type="submit"]:not([disabled]), [data-testid="password-auth-method"] button[type="submit"]:not([disabled])');
                   var cap=document.querySelector('iframe[src*="arkose"], iframe[src*="funcaptcha"]');
                   return !b || Boolean(cap);`
                )
                .catch(() => false);
              if (btnGone) {
                submitClicked = true;
                break;
              }
              // Re-klik watchdog
              await session
                .executeScript(
                  `var b=document.querySelector('button[aria-label="Add password"], form[data-testid="add-auth-method-page"] button[type="submit"], [data-testid="password-auth-method"] button[type="submit"]');
                   if(b && !b.disabled){b.click();try{var r=b.getBoundingClientRect();var o={bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0,pointerId:1,pointerType:'mouse'};b.dispatchEvent(new PointerEvent('pointerdown',o));b.dispatchEvent(new MouseEvent('mousedown',o));b.dispatchEvent(new PointerEvent('pointerup',o));b.dispatchEvent(new MouseEvent('mouseup',o));b.dispatchEvent(new MouseEvent('click',o));}catch(_){}if(b.form && typeof b.form.requestSubmit==='function') try{b.form.requestSubmit(b);}catch(_){}}`
                )
                .catch(() => {});
            }
            if (submitClicked) break;
            // Jika watchdog gagal verifikasi, lanjut outer while loop untuk retry berikutnya
          }
        }
        if (!passNudged && Date.now() - addStart > 4800) {
          passNudged = true;
          await session
            .executeScript(
              `var p=document.querySelector('#signup-v2-password, #signup-password, input[name="signupPassword"]');
               if(p){
                 p.focus();
                 if(p._valueTracker)p._valueTracker.setValue('');
                 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(p, arguments[0] + 'x');
                 p.dispatchEvent(new Event('input',{bubbles:true}));
               }`,
              [payload.password]
            )
            .catch(() => {});
          await new Promise((r) => setTimeout(r, 150));
          await session
            .executeScript(
              `var p=document.querySelector('#signup-v2-password, #signup-password, input[name="signupPassword"]');
               if(p){
                 p.focus();
                 if(p._valueTracker)p._valueTracker.setValue('');
                 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(p, arguments[0]);
                 p.dispatchEvent(new Event('input',{bubbles:true}));
                 p.dispatchEvent(new Event('change',{bubbles:true}));
               }`,
              [payload.password]
            )
            .catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }

  return {
    ok: continueClicked && passwordFilled && submitClicked,
    step1Filled: true,
    continueClicked,
    passwordFilled,
    submitClicked,
  };
}

/**
 * Mengisi formulir Roblox CreateAccount lewat Playwright (Chrome/Edge/Chromium) memakai fungsi terpadu.
 */
export async function runRobloxAutofillInPlaywright(
  page: Page,
  payload: RobloxSignupFormPayload
): Promise<RobloxAutofillResult> {
  await page.waitForSelector('#signup-username, input[name="signupUsername"]', {
    timeout: 30000,
  });
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('select')).some((s) => s.options.length >= 12) ||
        Boolean(document.querySelector('select#MonthDropdown, #MonthDropdown select')),
      undefined,
      { timeout: 15000 }
    )
    .catch(() => {});
  // Tunggu cookie _px3 asli terbentuk (hingga ~4.5 detik) + human jitter acak per worker
  const minPlaywrightJitter = 1400 + Math.floor(Math.random() * 900);
  await page
    .waitForFunction(() => /(?:^|;\s*)_px3=/.test(document.cookie || ''), undefined, {
      timeout: 4500,
    })
    .catch(() => {});
  await page.waitForTimeout(minPlaywrightJitter);

  return page.evaluate(
    ({ scriptStr, data }) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return (${scriptStr})`)() as (
        d: RobloxSignupFormPayload
      ) => Promise<RobloxAutofillResult>;
      return fn(data);
    },
    { scriptStr: ROBLOX_SIGNUP_AUTOFILL_BROWSER_FN, data: payload }
  );
}

/**
 * Menghasilkan URL Bookmarklet 1-klik (`javascript:...`) untuk mode FIREFOX_MANUAL.
 * Tidak memakai protokol otomasi dan tidak memakai simulasi keyboard Windows.
 * Memanfaatkan header COOP `same-origin-allow-popups` Roblox + `postMessage` aman dari 127.0.0.1:4000.
 */
export function buildManualBookmarkletHref(bridgeBaseUrl = 'http://127.0.0.1:4000'): string {
  const cleanBase = bridgeBaseUrl.replace(/\/+$/, '');
  let baseOrigin = 'http://127.0.0.1:4000';
  try {
    baseOrigin = new URL(cleanBase).origin;
  } catch {
    // keep default
  }
  const allowedOrigins = Array.from(
    new Set([
      baseOrigin,
      'http://127.0.0.1:4000',
      'http://localhost:4000',
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ])
  );
  const code = `(function(){
if(!/(^|\\.)roblox\\.com$/i.test(location.hostname)){alert('Buka halaman CreateAccount Roblox terlebih dahulu.');return;}
var fill=${ROBLOX_SIGNUP_AUTOFILL_BROWSER_FN};
var wid=window.sessionStorage.getItem('rage_worker_id')||'';
var allowed=${JSON.stringify(allowedOrigins)};
var onMsg=function(ev){
if(allowed.indexOf(ev.origin)===-1)return;
if(!ev.data||ev.data.type!=='RAGE_AUTOFILL'||!ev.data.payload)return;
window.removeEventListener('message',onMsg);
if(ev.data.payload.workerId){try{window.sessionStorage.setItem('rage_worker_id',String(ev.data.payload.workerId));}catch(_e){}}
fill(ev.data.payload);
};
window.addEventListener('message',onMsg);
var u='${cleanBase}/api/v1/registration/manual-autofill-bridge?origin='+encodeURIComponent(location.origin)+(wid?'&workerId='+encodeURIComponent(wid):'');
var w=window.open(u,'rage_af_bridge','width=360,height=200');
if(!w){alert('Izinkan popup untuk roblox.com agar Bookmarklet dapat mengambil data formulir dari RAGE.');}
})();`;
  return 'javascript:' + encodeURIComponent(code.replace(/\s*\r?\n\s*/g, ' '));
}

/**
 * Menghasilkan Userscript (Tampermonkey / Violentmonkey) untuk pengisian otomatis 0-klik
 * di Firefox biasa (`FIREFOX_MANUAL`) tanpa otomasi WebDriver/Marionette.
 * Identifikasi multi-worker memakai cookie loopback `rage_worker_id` yang ditanam di profil
 * masing-masing worker (+ cache sessionStorage tab) tanpa mengubah URL roblox.com.
 */
export function buildManualUserscriptSource(bridgeBaseUrl = 'http://127.0.0.1:4000'): string {
  const cleanBase = bridgeBaseUrl.replace(/\/+$/, '');
  return `// ==UserScript==
// @name         RAGE - Roblox CreateAccount Autofill (0-Klik)
// @namespace    http://127.0.0.1:4000/
// @version      1.5.0
// @description  Isi otomatis form CreateAccount Roblox per-worker (cookie loopback bersih, warmup PX, auto-recovery username, watchdog klik Continue/Add password/Sign Up, & close /home)
// @match        https://www.roblox.com/CreateAccount*
// @match        https://www.roblox.com/createaccount*
// @match        https://web.roblox.com/CreateAccount*
// @match        https://www.roblox.com/home*
// @match        https://web.roblox.com/home*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-start
// ==/UserScript==

(function() {
  'use strict';

  function resolveWorkerId() {
    try {
      return window.sessionStorage.getItem('rage_worker_id') || '';
    } catch (_e) {
      return '';
    }
  }

  var initialWorkerId = resolveWorkerId();

  if (/\\/home/i.test(location.pathname)) {
    var homeWid = resolveWorkerId() || initialWorkerId;
    try {
      GM_xmlhttpRequest({
        method: 'POST',
        url: '${cleanBase}/api/v1/registration/manual-home-signal',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ workerId: homeWid ? Number(homeWid) : 0, url: location.href })
      });
    } catch (_e) {}
    // Hemat kuota: hentikan seluruh request apis.roblox.com & thumbnail di /home seketika (0ms) saat document-start
    try { window.stop(); } catch (_e) {}
    setTimeout(function() {
      try { window.stop(); } catch (_e) {}
    }, 120);
    return;
  }

  var fill = ${ROBLOX_SIGNUP_AUTOFILL_BROWSER_FN};
  var started = false;
  var fetchAttempt = 0;

  function fetchAndFill() {
    if (started || fetchAttempt >= 8) return;
    fetchAttempt++;
    var activeWid = resolveWorkerId() || initialWorkerId;
    var q = activeWid
      ? ('?workerId=' + encodeURIComponent(activeWid) + '&v=1.4.0')
      : '?v=1.4.0';
    GM_xmlhttpRequest({
      method: 'GET',
      url: '${cleanBase}/api/v1/registration/manual-autofill-json' + q,
      headers: { 'Cache-Control': 'no-store' },
      onload: function(resp) {
        try {
          var parsed = JSON.parse(resp.responseText || '{}');
          var t = parsed && parsed.data;
          if (!t || !t.username || !t.password) {
            if (!started && fetchAttempt < 8) setTimeout(fetchAndFill, 900);
            return;
          }
          if (activeWid && t.workerId && String(t.workerId) !== String(activeWid)) return;
          if (window.sessionStorage.getItem('rage_af_done') === t.candidateId) return;

          var uEl = document.querySelector('#signup-username, input[name="signupUsername"]');
          if (!uEl) {
            if (!started && fetchAttempt < 8) setTimeout(fetchAndFill, 600);
            return;
          }
          if (uEl.value.trim().length > 0) return;

          started = true;
          if (t.workerId) {
            try { window.sessionStorage.setItem('rage_worker_id', String(t.workerId)); } catch (_e) {}
          }
          window.sessionStorage.setItem('rage_af_done', t.candidateId);
          fill(t);
        } catch (_e) {
          if (!started && fetchAttempt < 8) setTimeout(fetchAndFill, 900);
        }
      },
      onerror: function() {
        if (!started && fetchAttempt < 8) setTimeout(fetchAndFill, 900);
      }
    });
  }

  var tries = 0;
  var domReadyAt = 0;
  var minPx3JitterMs = 1500 + Math.floor(Math.random() * 950);
  var maxPx3WaitMs = 4500 + Math.floor(Math.random() * 750);
  var waitTimer = setInterval(function() {
    tries++;
    var uReady = Boolean(document.querySelector('#signup-username, input[name="signupUsername"]'));
    var selReady = Array.from(document.querySelectorAll('select')).some(function(s) { return s.options.length >= 12; });
    var layoutBtnReady = Boolean(
      document.querySelector('button[aria-label="Continue"], form[data-testid="signup-form-v2"] button[type="submit"]') ||
      (document.querySelector('#signup-password, input[name="signupPassword"]') &&
       document.querySelector('#signup-button, button[type="submit"]'))
    );
    if (uReady && selReady) {
      if (!domReadyAt) domReadyAt = Date.now();
      var elapsed = Date.now() - domReadyAt;
      var hasPx3 = /(?:^|;\\s*)_px3=/.test(document.cookie || '');
      if (((hasPx3 && elapsed >= minPx3JitterMs) || elapsed >= maxPx3WaitMs) && (layoutBtnReady || elapsed >= 6500)) {
        clearInterval(waitTimer);
        fetchAndFill();
        return;
      }
    }
    if (tries >= 90) {
      clearInterval(waitTimer);
    }
  }, 300);
})();
`;
}

/**
 * Merender halaman HTML jembatan popup untuk mengirim payload kandidat aktif ke window.opener (Roblox)
 * secara lokal via postMessage lalu menutup diri.
 */
export function renderManualAutofillBridgeHtml(params: {
  targetOrigin: string;
  activeTargets: Array<RobloxSignupFormPayload & { workerId: number; candidateId: string }>;
}): string {
  const safeOrigin =
    params.targetOrigin === 'https://web.roblox.com'
      ? 'https://web.roblox.com'
      : 'https://www.roblox.com';

  if (params.activeTargets.length === 0) {
    return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>RAGE Autofill</title></head>
<body style="font-family:monospace;background:#09090b;color:#f4f4f5;padding:16px;">
  <div style="font-weight:bold;margin-bottom:8px;">RAGE // Tidak Ada Worker Aktif</div>
  <div style="font-size:12px;color:#a1a1aa;">Mulai sesi di dashboard RAGE terlebih dahulu, lalu klik bookmarklet ini di halaman CreateAccount Roblox.</div>
</body></html>`;
  }

  // Serialisasi aman (escape '<' agar tidak memicu penutupan tag script)
  const serializedTargets = JSON.stringify(params.activeTargets).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>RAGE Autofill Bridge</title></head>
<body style="font-family:monospace;background:#09090b;color:#f4f4f5;padding:16px;">
  <div id="status" style="font-size:12px;">Mengirim data ke formulir Roblox...</div>
  <div id="picker" style="margin-top:10px;"></div>
  <script>
    (function(){
      var targets = ${serializedTargets};
      var origin = ${JSON.stringify(safeOrigin)};
      function sendTarget(t) {
        if (!window.opener) {
          document.getElementById('status').textContent = 'Koneksi window pembuka terputus. Jalankan lewat tombol bookmark di tab CreateAccount Roblox.';
          return;
        }
        window.opener.postMessage({
          type: 'RAGE_AUTOFILL',
          payload: {
            birthMonth: t.birthMonth,
            birthDay: t.birthDay,
            birthYear: t.birthYear,
            username: t.username,
            gender: t.gender,
            password: t.password
          }
        }, origin);
        document.getElementById('status').textContent = 'Terkirim (' + t.username + '). Menutup...';
        setTimeout(function(){ window.close(); }, 150);
      }
      if (targets.length === 1) {
        sendTarget(targets[0]);
      } else {
        document.getElementById('status').textContent = 'Pilih worker target untuk diisi:';
        var box = document.getElementById('picker');
        targets.forEach(function(t) {
          var btn = document.createElement('button');
          btn.textContent = 'Worker #' + t.workerId + ' (' + t.username + ')';
          btn.style.cssText = 'display:block;width:100%;margin-bottom:6px;padding:8px;background:#10b981;color:#09090b;border:none;font-family:monospace;font-weight:bold;cursor:pointer;';
          btn.onclick = function(){ sendTarget(t); };
          box.appendChild(btn);
        });
      }
    })();
  </script>
</body></html>`;
}
