/** In-app browser classification: we must recognise the webviews that block getUserMedia, and only those. */
import { describe, expect, it } from "vitest";
import { classifyUa, isInAppBrowser, osVersion } from "@/lib/client/inapp";

const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

describe("classifyUa", () => {
  it("recognises the LinkedIn webview", () => {
    expect(classifyUa(`${SAFARI_IOS} LinkedInApp`)).toBe("linkedin");
  });

  it("prefers Messenger over Facebook when both tokens are present", () => {
    expect(classifyUa("Mozilla/5.0 [FB_IAB/MESSENGER;FBAV/450.0.0;]")).toBe("messenger");
  });

  it.each([
    ["Mozilla/5.0 [FBAN/FBIOS;FBAV/430.0.0.32.109;]", "facebook"],
    ["Mozilla/5.0 Instagram 300.0.0.0 (iPhone)", "instagram"],
    ["Mozilla/5.0 musical_ly_2022 BytedanceWebview/d8a21c6", "tiktok"],
    ["Mozilla/5.0 Snapchat/12.0.0.0", "snapchat"],
    ["Mozilla/5.0 MicroMessenger/8.0.30", "wechat"],
    ["Mozilla/5.0 (iPhone) Outlook-iOS/709.2226530.prod", "outlook"],
    ["Mozilla/5.0 (Linux; Android 14) GSA/15.0", "gmail"],
  ] as const)("classifies %s", (ua, expected) => {
    expect(classifyUa(ua)).toBe(expected);
  });

  it("leaves real browsers alone", () => {
    expect(classifyUa(SAFARI_IOS)).toBe("browser");
    expect(classifyUa("Mozilla/5.0 (Macintosh) Chrome/140.0.0.0 Safari/537.36")).toBe("browser");
    expect(classifyUa(undefined)).toBe("browser");
    expect(classifyUa("")).toBe("browser");
  });

  it("detects generic webviews", () => {
    expect(classifyUa("Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36")).toBe(
      "android_webview",
    );
    expect(classifyUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe(
      "ios_webview",
    );
  });

  it("marks everything but a real browser as in-app", () => {
    expect(isInAppBrowser("browser")).toBe(false);
    expect(isInAppBrowser("linkedin")).toBe(true);
  });
});

describe("osVersion", () => {
  it("buckets the platforms we report", () => {
    expect(osVersion(SAFARI_IOS)).toBe("ios 18.1");
    expect(osVersion("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android 14.0");
    expect(osVersion("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macos 10.15");
    expect(osVersion("Mozilla/5.0 (unknown)")).toBeUndefined();
  });
});
