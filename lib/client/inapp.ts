/**
 * Classifies the user agent of embedded in-app browsers (LinkedIn, Facebook, Instagram, TikTok, ...).
 * We classify, we never block: some of these webviews cannot reach getUserMedia, so knowing which one
 * we are in lets the console offer "open in Safari" instead of failing silently.
 */

export const UA_CLASSES = [
  "linkedin",
  "facebook",
  "instagram",
  "messenger",
  "tiktok",
  "snapchat",
  "wechat",
  "gmail",
  "outlook",
  "ios_webview",
  "android_webview",
  "browser",
] as const;

export type UaClass = (typeof UA_CLASSES)[number];

/** True for every class that is an embedded webview rather than a real browser. */
export function isInAppBrowser(ua: UaClass): boolean {
  return ua !== "browser";
}

const RULES: ReadonlyArray<readonly [UaClass, RegExp]> = [
  ["linkedin", /\bLinkedInApp\b/i],
  ["messenger", /\b(Messenger|MessengerLiteForiOS|FB_IAB\/MESSENGER)\b/i],
  ["facebook", /\b(FBAN|FBAV|FB_IAB|FBIOS|FB4A)\b/i],
  ["instagram", /\bInstagram\b/i],
  ["tiktok", /\b(BytedanceWebview|musical_ly|TikTok|Bytedance)\b/i],
  ["snapchat", /\bSnapchat\b/i],
  ["wechat", /\b(MicroMessenger|WeChat)\b/i],
  ["gmail", /\b(GSA|Gmail)\b/i],
  ["outlook", /\b(Outlook-(iOS|Android)|OutlookMobile|MSAuthHost)\b/i],
];

/**
 * Maps a raw user-agent string onto one of {@link UA_CLASSES}. Order matters: Messenger reports both a
 * Messenger token and the Facebook FB_IAB token, so it has to be tested before the Facebook rule.
 */
export function classifyUa(userAgent: string | undefined | null): UaClass {
  if (!userAgent) return "browser";
  for (const [cls, re] of RULES) {
    if (re.test(userAgent)) return cls;
  }
  // Generic webviews: iOS WKWebView omits "Safari"; Android reports the literal "; wv" token.
  if (/\bwv\b/.test(userAgent) && /Android/i.test(userAgent)) return "android_webview";
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent) && /AppleWebKit/i.test(userAgent) && !/Safari/i.test(userAgent)) {
    return "ios_webview";
  }
  return "browser";
}

/** Best-effort OS version, used only as a coarse bucket in the /api/voice/probe telemetry. */
export function osVersion(userAgent: string | undefined | null): string | undefined {
  if (!userAgent) return undefined;
  const ios = /(?:iPhone )?OS (\d+)[._](\d+)/.exec(userAgent);
  if (ios) return `ios ${ios[1]}.${ios[2]}`;
  const android = /Android (\d+)(?:\.(\d+))?/.exec(userAgent);
  if (android) return `android ${android[1]}.${android[2] ?? "0"}`;
  const mac = /Mac OS X (\d+)[._](\d+)/.exec(userAgent);
  if (mac) return `macos ${mac[1]}.${mac[2]}`;
  if (/Windows NT ([\d.]+)/.test(userAgent)) return `windows ${/Windows NT ([\d.]+)/.exec(userAgent)?.[1] ?? ""}`.trim();
  return undefined;
}

/** Whether this runtime can even attempt a microphone capture. */
export function hasMediaDevices(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}
