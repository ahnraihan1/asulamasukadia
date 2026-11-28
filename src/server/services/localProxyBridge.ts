import crypto from 'node:crypto';
import net from 'node:net';

export interface ProxyBridgeOptions {
  dataSaver?: boolean;
  blockHeavyMedia?: boolean;
}

export interface BridgeUpstreamConfig extends ProxyBridgeOptions {
  server: string;
  username?: string;
  password?: string;
}

export interface ProxyBridgeStats {
  bytesTransferred: number;
  proxiedRequests: number;
  blockedRequests: number;
}

export const DATA_SAVER_BLOCKED_EXACT = new Set<string>([
  // Google Safe Browsing & background browser services (sering memakan 15-20 MB/sesi)
  'safebrowsing.googleapis.com',
  'safebrowsing-cache.google.com',
  'update.googleapis.com',
  'optimizationguide-pa.googleapis.com',
  'clientservices.googleapis.com',
  'content-autofill.googleapis.com',
  // Mozilla telemetry, New Tab Merino/Pocket, remote settings, OHTTP, push, captive portal
  'incoming.telemetry.mozilla.org',
  'telemetry.mozilla.org',
  'firefox-portal-detection.com',
  'detectportal.firefox.com',
  'merino.services.mozilla.com',
  'mozilla-ohttp.fastly-edge.com',
  'ads.mozilla.org',
  'ads-img.mozilla.org',
  'push.services.mozilla.com',
  'mozilla.cloudflare-dns.com',
  'ciscobinary.openh264.org',
  'redirector.gvt1.com',
  'edgedl.me.gvt1.com',
  'dl.google.com',
  'firefox.settings.services.mozilla.com',
  'firefox-settings-attachments.cdn.mozilla.net',
  'content-signature-2.cdn.mozilla.net',
  'snippets.cdn.mozilla.net',
  'aus4.mozilla.org',
  'aus5.mozilla.org',
  'archive.mozilla.org',
  'download.mozilla.org',
  'ftp.mozilla.org',
  'normandy.cdn.mozilla.net',
  'versioncheck.addons.mozilla.org',
  'addons.mozilla.org',
  'services.addons.mozilla.org',
  'codepush.appcenter.ms',
  'self.events.data.microsoft.com',
  'shavar.services.mozilla.com',
  'tracking-protection.cdn.mozilla.net',
  'spocs.getpocket.com',
  'getpocket.cdn.mozilla.net',
  'tiles.services.mozilla.com',
  'contile.services.mozilla.com',
  'top-sites.mozilla.com',
  'classify-client.services.mozilla.com',
  'location.services.mozilla.com',
  // Analytics & crash reporting pihak ketiga (tidak diperlukan untuk signup Roblox / CAPTCHA)
  'www.googletagmanager.com',
  'googletagmanager.com',
  'ssl.google-analytics.com',
  'www.google-analytics.com',
  'analytics.google.com',
  'static.cloudflareinsights.com',
  'clients2.google.com',
  'clients2.googleusercontent.com',
  'passwordsleakcheck-pa.googleapis.com',
  'chromewebstore.googleapis.com',
  // Roblox telemetry, metrics, locale dictionary & feed /home (tidak diperlukan untuk CreateAccount / CAPTCHA)
  'metrics.roblox.com',
  'ecsv2.roblox.com',
  'ecs.roblox.com',
  'locale.roblox.com',
  'lms.roblox.com',
  'tracing.roblox.com',
  'thumbnails.roblox.com',
  'games.roblox.com',
  'friends.roblox.com',
  'presence.roblox.com',
  'chat.roblox.com',
  'avatar.roblox.com',
  'badges.roblox.com',
  'economy.roblox.com',
  'inventory.roblox.com',
  'notifications.roblox.com',
  'realtime.roblox.com',
  'realtime-signalr.roblox.com',
  'voice.roblox.com',
  'assetdelivery.roblox.com',
  'catalog.roblox.com',
  'groups.roblox.com',
  'develop.roblox.com',
  'publish.roblox.com',
  'billing.roblox.com',
  'contacts.roblox.com',
  'followings.roblox.com',
  'trades.roblox.com',
  'privatemessages.roblox.com',
  'usermoderation.roblox.com',
  'contentdelivery.roblox.com',
  'gold.roblox.com',
  'silver.roblox.com',
  'sentry-relay.rbxinfra.com',
  'fts.rbxcdn.com',
  'cs.ns1p.net',
  'sc0.rbxcdn.com',
  'sc0ak.rbxcdn.com',
  'sc0aws.rbxcdn.com',
  'sc0gcp.rbxcdn.com',
  'premiumfeatures.roblox.com',
  'client-telemetry.roblox.com',
  'telemetry.roblox.com',
  'accountinformation.roblox.com',
  'accountsettings.roblox.com',
  'ads.roblox.com',
  'adconfiguration.roblox.com',
  'chatmoderation.roblox.com',
  'engagementpayouts.roblox.com',
  'gameinternationalization.roblox.com',
  'gamejoin.roblox.com',
  'gamepersistence.roblox.com',
  'itemconfiguration.roblox.com',
  'localizationtables.roblox.com',
  'points.roblox.com',
  'sharelinks.roblox.com',
  'textfilter.roblox.com',
  'themes.roblox.com',
  'thumbnailsresizer.roblox.com',
  'translationroles.roblox.com',
  'translations.roblox.com',
  // Kebocoran background situs pihak ketiga dari profil Firefox utama (Discord, YouTube media)
  'cdn.discordapp.com',
  'discord.com',
  'discordapp.com',
  'media.discordapp.net',
  'images-ext-1.discordapp.net',
  'images-ext-2.discordapp.net',
  'gateway.discord.gg',
  'status.discord.com',
  'latency.discord.media',
  'googlevideo.com',
  'i.ytimg.com',
  'yt3.ggpht.com',
]);

export const DATA_SAVER_BLOCKED_SUFFIXES = [
  '.merino.prod.webservices.mozgcp.net',
  '.ohttp-gateway.prod.webservices.mozgcp.net',
  '.ingest.sentry.io',
  '.ingest.us.sentry.io',
  '.googlevideo.com',
  '.discord.media',
];

// Catatan keamanan CAPTCHA: JANGAN memblokir fonts.gstatic.com, fonts.googleapis.com, atau images.rbxcdn.com
// karena perubahan metrik font/Canvas dan gagal muat UI CreateAccount dapat memicu "Please try again" di Arkose.
// Ketiganya tetap hemat karena otomatis tersimpan di disk cache Firefox (cache2/).
export const HEAVY_MEDIA_BLOCKED_EXACT = new Set<string>([
  'tr.rbxcdn.com',
]);

/**
 * Memeriksa apakah hostname aman diblokir lokal sebelum membuka koneksi proxy upstream
 * guna menghemat kuota (tanpa menyentuh endpoint auth Roblox, PerimeterX, Arkose/FunCaptcha).
 */
export function isBlockedByDataSaver(hostname: string, options: ProxyBridgeOptions): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h || h === 'localhost' || h === '127.0.0.1' || h === '::1') {
    return false;
  }

  if (options.dataSaver !== false) {
    if (DATA_SAVER_BLOCKED_EXACT.has(h)) return true;
    for (const suffix of DATA_SAVER_BLOCKED_SUFFIXES) {
      if (h.endsWith(suffix)) return true;
    }
  }

  if (options.blockHeavyMedia) {
    if (HEAVY_MEDIA_BLOCKED_EXACT.has(h)) return true;
    if (/^t\d+\.rbxcdn\.com$/i.test(h)) return true;
  }

  return false;
}

const usedStickyTokens = new Set<string>();

/**
 * Menghasilkan token sesi sticky yang dijamin belum pernah dipakai oleh akun/percobaan sebelumnya.
 */
export function allocateFreshStickyToken(prefix: string): string {
  for (let i = 0; i < 16; i++) {
    const candidate = `${prefix}${crypto.randomBytes(2).toString('hex')}`;
    if (!usedStickyTokens.has(candidate)) {
      if (usedStickyTokens.size > 50000) {
        usedStickyTokens.clear();
      }
      usedStickyTokens.add(candidate);
      return candidate;
    }
  }
  const fallback = `${prefix}${crypto.randomBytes(4).toString('hex')}`;
  usedStickyTokens.add(fallback);
  return fallback;
}

const DATAIMPULSE_FAILOVER_COUNTRIES = [
  'id',
  'my',
  'sg',
  'ph',
  'vn',
  'th',
  'sa',
  'jp',
  'kr',
  'in',
] as const;

const EMBEDDED_STICKY_SESSION_REGEX = /([_-](?:session|sessid|sess|sid)[_-])([A-Za-z0-9]+)/i;

/**
 * Mendeteksi parameter sesi sticky tertanam pada username proxy
 * (mis. Legion Proxy `_session-zflnht74p0`, `-session-abc123`, `-sid-xyz`).
 */
export function hasEmbeddedStickySession(username?: string): boolean {
  return Boolean(username && EMBEDDED_STICKY_SESSION_REGEX.test(username));
}

/**
 * Mengganti token sesi sticky tertanam dengan token baru sambil mempertahankan parameter negara/TTL lain.
 */
export function replaceEmbeddedStickySession(username: string, nextToken: string): string {
  return username.replace(EMBEDDED_STICKY_SESSION_REGEX, `$1${nextToken}`);
}

export function extractEmbeddedStickyToken(username?: string): string | null {
  if (!username) return null;
  const m = username.match(EMBEDDED_STICKY_SESSION_REGEX);
  return m?.[2] ?? null;
}

/**
 * Mendeteksi apakah host/username proxy merupakan gateway residensial DataImpulse
 * (`*.dataimpulse.com`, IP gateway `74.81.81.81`, parameter negara `__cr.*`, atau `;sessid.*`).
 */
export function isDataImpulseProxy(hostname: string, username?: string): boolean {
  const hostLower = hostname.trim().toLowerCase();
  const baseUser = username || '';
  return (
    hostLower.endsWith('.dataimpulse.com') ||
    hostLower === '74.81.81.81' ||
    /__(?:cr|st|co|ci|sn|asn|isp)\.[a-z0-9-]+|;sessid\./i.test(baseUser)
  );
}

/**
 * Jembatan proxy lokal: browser memakai 127.0.0.1:<port> tanpa login,
 * jembatan meneruskan ke proxy upstream sambil menyisipkan Proxy-Authorization.
 *
 * Fitur keandalan & hemat kuota:
 * - Retry otomatis jika upstream mengembalikan 407/502/503/504 sementara.
 * - Auto-Heal `503 NO_RAY` / node sticky mati: otomatis merotasi `;sessid.<token>` ke sesi sticky baru yang hidup
 *   saat gateway DataImpulse membalas `503 NO_RAY` / `502` / `504` / timeout, sehingga Firefox tidak pernah putus koneksi.
 * - Tidak pernah meneruskan HTTP 407 / Proxy-Authenticate ke Firefox sehingga dialog Sign In proxy tidak muncul.
 * - Memaksa `Connection: close` untuk HTTP polos agar Firefox tidak mengirim request ke-2 lewat keep-alive tanpa header auth.
 * - Memblokir domain telemetry, SafeBrowsing, Mozilla NewTab/Ads, dan opsional gambar/font non-CAPTCHA secara lokal (0 byte upstream).
 */
export class LocalProxyBridge {
  private server: net.Server;
  private sockets = new Set<net.Socket>();
  public port = 0;
  private upstreamHost: string;
  private upstreamPort: number;
  private username?: string;
  private password?: string;
  private authHeader: string | null = null;
  private sessionPinned = false;
  private initialPinPromise: Promise<void> | null = null;
  private dataSaver: boolean;
  private blockHeavyMedia: boolean;
  private bytesTransferred = 0;
  private proxiedRequests = 0;
  private blockedRequests = 0;

  private constructor(upstream: BridgeUpstreamConfig) {
    const u = new URL(
      /^\w+:\/\//.test(upstream.server) ? upstream.server : `http://${upstream.server}`
    );
    this.upstreamHost =
      u.hostname.toLowerCase().endsWith('.dataimpulse.com') &&
      /;sessid\./i.test(upstream.username || '')
        ? '74.81.81.81'
        : u.hostname;
    this.upstreamPort = Number(u.port || 80);
    this.dataSaver = upstream.dataSaver ?? true;
    this.blockHeavyMedia = upstream.blockHeavyMedia ?? false;
    this.setAuth(upstream.username, upstream.password);
    this.server = net.createServer((c) => this.handle(c));
  }

  private setAuth(username?: string, password?: string): void {
    this.username = username;
    this.password = password;
    this.authHeader = username
      ? 'Basic ' + Buffer.from(`${username}:${password ?? ''}`).toString('base64')
      : null;
  }

  /**
   * Jika sesi sticky saat ini mengenai node residensial yang tiba-tiba mati atau slot sticky
   * negara tersebut penuh (`503 NO_RAY`, `502`, `504`, timeout):
   * - Single-flight guard: jika koneksi paralel lain sudah merotasi `authHeader`, cukup gunakan token baru tersebut
   *   agar `www.roblox.com`, PerimeterX (`_px3`), Arkose, dan `auth.roblox.com` tidak terpecah ke IP berbeda.
   * - Pin guard: jika sesi sticky untuk akun ini sudah terbukti hidup (`sessionPinned`), pertahankan IP tersebut
   *   pada retry awal agar IP tidak berubah di tengah halaman.
   */
  private rotateDeadStickySession(
    attempt: number,
    failedAuthHeader: string | null
  ): boolean {
    if (this.authHeader !== failedAuthHeader) {
      return false;
    }
    // Jika halaman pada akun ini sudah berhasil terhubung dengan 1 IP sticky (sessionPinned),
    // JANGAN PERNAH mengganti IP/sessid/negara di tengah sesi agar IP saat buka CAPTCHA/PerimeterX
    // sama persis 100% dengan IP saat submit hasil CAPTCHA ke auth.roblox.com/v2/signup.
    if (this.sessionPinned) {
      return false;
    }
    const user = this.username || '';
    const hostLower = this.upstreamHost.trim().toLowerCase();
    const isDi = isDataImpulseProxy(this.upstreamHost, user);
    const hasEmbedded = !isDi && hasEmbeddedStickySession(user);
    const isDecodoPortSticky =
      !isDi &&
      !hasEmbedded &&
      (hostLower.endsWith('.decodo.com') || hostLower.endsWith('.smartproxy.com')) &&
      this.upstreamPort >= 10001 &&
      this.upstreamPort < 60000;

    if (!isDi && !hasEmbedded && !isDecodoPortSticky) {
      return false;
    }

    if (isDecodoPortSticky) {
      const blockBase = Math.floor(this.upstreamPort / 10000) * 10000;
      const offset = Math.max(0, this.upstreamPort - (blockBase + 1));
      this.upstreamPort = blockBase + 1 + ((offset + 1 + attempt) % 9999);
      return true;
    }

    if (hasEmbedded) {
      const oldToken = extractEmbeddedStickyToken(user) || 'st';
      const basePrefix = oldToken.replace(/r\d+[0-9a-f]{4,}$/i, '').slice(0, 10) || 'st';
      const freshToken = allocateFreshStickyToken(`${basePrefix}r${attempt + 1}`);
      const nextUser = replaceEmbeddedStickySession(user, freshToken);
      this.setAuth(nextUser, this.password);
      return true;
    }

    const isRealDataImpulseHost =
      hostLower.endsWith('.dataimpulse.com') || hostLower === '74.81.81.81';

    if (hostLower.endsWith('.dataimpulse.com')) {
      this.upstreamHost = '74.81.81.81';
    }
    if (isRealDataImpulseHost && this.upstreamPort >= 10000 && this.upstreamPort <= 30000) {
      this.upstreamPort = 823;
    }

    const oldMatch = user.match(/;sessid\.([a-z0-9_-]+)/i);
    const basePrefix = oldMatch ? oldMatch[1].replace(/r\d+[0-9a-f]{4,}$/i, '').slice(0, 10) : 'di';
    const freshToken = allocateFreshStickyToken(`${basePrefix}r${attempt + 1}`);
    let cleanUser = user.replace(/;sessid\.[^;]*/gi, '');

    if (attempt >= 2 && /__cr\.([a-z]{2})/i.test(cleanUser)) {
      const currentCc = (cleanUser.match(/__cr\.([a-z]{2})/i)?.[1] || '').toLowerCase();
      const candidates = DATAIMPULSE_FAILOVER_COUNTRIES.filter((c) => c !== currentCc);
      const nextCc = candidates[(attempt - 2) % candidates.length] || 'id';
      cleanUser = cleanUser.replace(/__cr\.[a-z]{2}/i, `__cr.${nextCc}`);
    }

    // WAJIB selalu pertahankan ;sessid.<freshToken> pada semua percobaan failover (termasuk attempt >= 4).
    // Menghapus ;sessid pada port 823 akan menjatuhkan koneksi ke mode rotating per-request dan membuat Arkose selalu "Please try again".
    const nextUser = cleanUser ? `${cleanUser};sessid.${freshToken}` : `sessid.${freshToken}`;
    this.setAuth(nextUser, this.password);
    return true;
  }

  public updateUpstream(upstream: BridgeUpstreamConfig): void {
    const u = new URL(
      /^\w+:\/\//.test(upstream.server) ? upstream.server : `http://${upstream.server}`
    );
    this.upstreamHost =
      u.hostname.toLowerCase().endsWith('.dataimpulse.com') &&
      /;sessid\./i.test(upstream.username || '')
        ? '74.81.81.81'
        : u.hostname;
    this.upstreamPort = Number(u.port || 80);
    if (upstream.dataSaver !== undefined) this.dataSaver = upstream.dataSaver;
    if (upstream.blockHeavyMedia !== undefined) this.blockHeavyMedia = upstream.blockHeavyMedia;
    this.sessionPinned = false;
    this.initialPinPromise = null;
    this.setAuth(upstream.username, upstream.password);
    // Pastikan tidak ada socket keep-alive tersisa dari akun/sesi sticky sebelumnya
    for (const s of this.sockets) {
      try {
        if (!s.destroyed) s.destroy();
      } catch {
        // ignore
      }
    }
    this.sockets.clear();
  }

  public updateOptions(options: ProxyBridgeOptions): void {
    if (options.dataSaver !== undefined) this.dataSaver = options.dataSaver;
    if (options.blockHeavyMedia !== undefined) this.blockHeavyMedia = options.blockHeavyMedia;
  }

  public getStats(): ProxyBridgeStats {
    return {
      bytesTransferred: this.bytesTransferred,
      proxiedRequests: this.proxiedRequests,
      blockedRequests: this.blockedRequests,
    };
  }

  public resetStats(): void {
    this.bytesTransferred = 0;
    this.proxiedRequests = 0;
    this.blockedRequests = 0;
  }

  public static async start(upstream: BridgeUpstreamConfig): Promise<LocalProxyBridge> {
    const bridge = new LocalProxyBridge(upstream);
    await new Promise<void>((resolve, reject) => {
      bridge.server.once('error', reject);
      bridge.server.listen(0, '127.0.0.1', () => resolve());
    });
    bridge.port = (bridge.server.address() as net.AddressInfo).port;
    return bridge;
  }

  public get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private track(s: net.Socket): void {
    this.sockets.add(s);
    s.on('close', () => this.sockets.delete(s));
    s.on('error', () => {
      if (!s.destroyed) s.destroy();
    });
  }

  private extractTargetHost(requestLine: string, rawHeaders: string[]): string {
    const target = (requestLine.split(/\s+/)[1] || '').trim();
    if (target) {
      if (/^https?:\/\//i.test(target)) {
        try {
          return new URL(target).hostname.toLowerCase();
        } catch {
          // fallback to Host header
        }
      }
      if (!target.startsWith('/')) {
        if (target.startsWith('[')) {
          return target.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1').toLowerCase();
        }
        return target.replace(/:\d+$/, '').toLowerCase();
      }
    }
    const hostHdr = rawHeaders.find((l) => /^host:/i.test(l));
    if (hostHdr) {
      const val = hostHdr.slice(5).trim();
      return val.startsWith('[')
        ? val.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1').toLowerCase()
        : val.replace(/:\d+$/, '').toLowerCase();
    }
    return '';
  }

  private handle(client: net.Socket): void {
    this.track(client);
    let buf = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf('\r\n\r\n');
      if (end === -1) {
        if (buf.length > 65536) client.destroy();
        return;
      }
      client.off('data', onData);
      client.pause();

      const head = buf.subarray(0, end).toString('latin1');
      const rest = buf.subarray(end + 4);
      const lines = head.split('\r\n');
      const requestLine = lines[0] || '';
      const rawHeaders = lines.slice(1);
      const method = requestLine.split(/\s+/)[0]?.toUpperCase() || '';

      const targetHost = this.extractTargetHost(requestLine, rawHeaders);
      if (
        isBlockedByDataSaver(targetHost, {
          dataSaver: this.dataSaver,
          blockHeavyMedia: this.blockHeavyMedia,
        })
      ) {
        this.blockedRequests++;
        if (!client.destroyed) {
          client.end(
            'HTTP/1.1 403 Forbidden\r\nX-RAGE-Blocked: data-saver\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
          );
        }
        return;
      }

      if (method === 'CONNECT') {
        void this.forwardWithRetry(client, requestLine, rawHeaders, rest, true);
      } else {
        void this.forwardWithRetry(client, requestLine, rawHeaders, rest, false);
      }
    };

    client.on('data', onData);
  }

  private async forwardWithRetry(
    client: net.Socket,
    requestLine: string,
    rawHeaders: string[],
    rest: Buffer,
    isConnect: boolean
  ): Promise<void> {
    // Jika sesi sticky belum ter-pin di awal pembukaan tab, pastikan request paralel lainnya menunggu
    // koneksi pertama berhasil menentukan & mengunci token ;sessid yang hidup agar IP tidak terpecah.
    while (!this.sessionPinned && this.initialPinPromise) {
      await this.initialPinPromise;
    }

    let releasePinLock: (() => void) | null = null;
    if (!this.sessionPinned) {
      this.initialPinPromise = new Promise<void>((resolve) => {
        releasePinLock = resolve;
      });
    }

    const releaseInitialPin = () => {
      if (releasePinLock) {
        const cb = releasePinLock;
        releasePinLock = null;
        if (this.initialPinPromise) {
          this.initialPinPromise = null;
        }
        cb();
      }
    };

    const baseFilteredHeaders = rawHeaders.filter(
      (l) => !/^(proxy-authorization|proxy-connection|connection):/i.test(l)
    );
    const canRotateSticky =
      isDataImpulseProxy(this.upstreamHost, this.username) ||
      hasEmbeddedStickySession(this.username);
    const maxAttempts = canRotateSticky ? 6 : 3;

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (client.destroyed) return;

        const attemptAuthHeader = this.authHeader;
        const filteredHeaders = [...baseFilteredHeaders];
        if (attemptAuthHeader) {
          filteredHeaders.push(`Proxy-Authorization: ${attemptAuthHeader}`);
        }
        if (isConnect) {
          filteredHeaders.push('Proxy-Connection: Keep-Alive');
        } else {
          filteredHeaders.push('Connection: close');
          filteredHeaders.push('Proxy-Connection: close');
        }

        const reqHead = `${requestLine}\r\n${filteredHeaders.join('\r\n')}\r\n\r\n`;
        const result = await this.trySingleUpstream(reqHead, rest, isConnect);
        if (result.kind === 'CONNECTED') {
          const { upstream, respBuffer } = result;
          this.sessionPinned = true;
          releaseInitialPin();
          if (client.destroyed) {
            upstream.destroy();
            return;
          }
          this.proxiedRequests++;
          this.bytesTransferred +=
            Buffer.byteLength(reqHead, 'latin1') + rest.length + respBuffer.length;
          upstream.on('data', (c: Buffer) => {
            this.bytesTransferred += c.length;
          });
          client.on('data', (c: Buffer) => {
            this.bytesTransferred += c.length;
          });
          client.write(respBuffer);
          if (isConnect && rest.length) {
            upstream.write(rest);
          }
          upstream.pipe(client);
          client.pipe(upstream);
          client.resume();
          return;
        }

        if (attempt < maxAttempts - 1 && result.retryable) {
          if (!result.is407) {
            this.rotateDeadStickySession(attempt, attemptAuthHeader);
          }
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }

        // Jangan pernah mengirim status 407 + Proxy-Authenticate ke Firefox agar tidak memicu dialog Sign In
        if (!client.destroyed) {
          if (result.kind === 'HTTP_ERROR' && !result.is407 && result.rawResponse.length > 0) {
            client.end(result.rawResponse);
          } else {
            client.end(
              'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
            );
          }
        }
        return;
      }
    } finally {
      releaseInitialPin();
    }
  }

  private trySingleUpstream(
    reqHead: string,
    clientRest: Buffer,
    isConnect: boolean
  ): Promise<
    | { kind: 'CONNECTED'; upstream: net.Socket; respBuffer: Buffer }
    | { kind: 'HTTP_ERROR'; retryable: boolean; is407: boolean; rawResponse: Buffer }
  > {
    return new Promise((resolve) => {
      const upstream = net.connect(this.upstreamPort, this.upstreamHost);
      let settled = false;
      let respBuf = Buffer.alloc(0);

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          upstream.destroy();
          resolve({ kind: 'HTTP_ERROR', retryable: true, is407: false, rawResponse: Buffer.alloc(0) });
        }
      }, 20000);

      const cleanupBeforePipe = () => {
        clearTimeout(timer);
        upstream.off('data', onUpstreamData);
        upstream.off('error', onUpstreamErr);
        upstream.off('close', onUpstreamClose);
      };

      const onUpstreamErr = () => {
        if (!settled) {
          settled = true;
          cleanupBeforePipe();
          upstream.destroy();
          resolve({ kind: 'HTTP_ERROR', retryable: true, is407: false, rawResponse: Buffer.alloc(0) });
        }
      };

      const onUpstreamClose = () => {
        if (!settled) {
          settled = true;
          cleanupBeforePipe();
          resolve({
            kind: 'HTTP_ERROR',
            retryable: true,
            is407: false,
            rawResponse: respBuf,
          });
        }
      };

      const onUpstreamData = (chunk: Buffer) => {
        respBuf = Buffer.concat([respBuf, chunk]);
        const hdrEnd = respBuf.indexOf('\r\n\r\n');
        if (hdrEnd === -1) {
          if (respBuf.length > 65536) {
            settled = true;
            cleanupBeforePipe();
            upstream.destroy();
            resolve({ kind: 'HTTP_ERROR', retryable: false, is407: false, rawResponse: Buffer.alloc(0) });
          }
          return;
        }

        settled = true;
        cleanupBeforePipe();
        const statusLine = respBuf.subarray(0, respBuf.indexOf('\r\n')).toString('latin1');
        const codeMatch = statusLine.match(/^HTTP\/\d\.\d\s+(\d{3})/i);
        const statusCode = codeMatch ? Number(codeMatch[1]) : 0;

        if (statusCode === 407) {
          upstream.destroy();
          resolve({ kind: 'HTTP_ERROR', retryable: true, is407: true, rawResponse: respBuf });
          return;
        }

        if (isConnect && (statusCode === 502 || statusCode === 503 || statusCode === 504)) {
          upstream.destroy();
          resolve({ kind: 'HTTP_ERROR', retryable: true, is407: false, rawResponse: respBuf });
          return;
        }

        if (!isConnect && statusCode >= 502 && statusCode <= 504 && clientRest.length === 0) {
          upstream.destroy();
          resolve({ kind: 'HTTP_ERROR', retryable: true, is407: false, rawResponse: respBuf });
          return;
        }

        this.track(upstream);
        resolve({ kind: 'CONNECTED', upstream, respBuffer: respBuf });
      };

      upstream.once('error', onUpstreamErr);
      upstream.once('close', onUpstreamClose);
      upstream.on('data', onUpstreamData);

      upstream.once('connect', () => {
        upstream.write(reqHead);
        if (!isConnect && clientRest.length > 0) {
          upstream.write(clientRest);
        }
      });
    });
  }

  public close(): void {
    try {
      this.server.close();
    } catch {
      // ignore
    }
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
  }
}
