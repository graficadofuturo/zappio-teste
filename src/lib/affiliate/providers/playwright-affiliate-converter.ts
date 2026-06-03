import { chromium, BrowserContext, Page } from "playwright";
import { AffiliateLinkJob } from "../job-service.js";
import path from "path";

export class PlaywrightAffiliateConverter {
  private static contexts: Record<string, BrowserContext> = {};

  private static getSessionDir(provider: string) {
    const baseDir = process.env.PLAYWRIGHT_USER_DATA_DIR || "./storage/playwright";
    return path.resolve(baseDir, provider);
  }

  static async getContext(provider: string): Promise<BrowserContext> {
    if (this.contexts[provider]) {
      return this.contexts[provider];
    }

    const sessionDir = this.getSessionDir(provider);
    const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";

    const context = await chromium.launchPersistentContext(sessionDir, {
      headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    this.contexts[provider] = context;
    return context;
  }

  static async convert(job: AffiliateLinkJob): Promise<{ affiliateUrl?: string; error_code?: string; error_message?: string }> {
    try {
      if (job.provider === "mercadolivre" && (!process.env.MERCADOLIVRE_LINK_BUILDER_URL || process.env.MERCADOLIVRE_LINK_BUILDER_URL === "not_configured")) {
        return { error_code: "MISSING_LINK_BUILDER_URL", error_message: "Marketplace configuration missing (Mercado Livre link builder URL is not configured)." };
      }
      if (job.provider === "amazon" && (!process.env.AMAZON_LINK_BUILDER_URL || process.env.AMAZON_LINK_BUILDER_URL === "not_configured")) {
        return { error_code: "MISSING_LINK_BUILDER_URL", error_message: "Marketplace configuration missing (Amazon link builder URL is not configured)." };
      }
      if (job.provider === "shopee" && (!process.env.SHOPEE_LINK_BUILDER_URL || process.env.SHOPEE_LINK_BUILDER_URL === "not_configured")) {
        return { error_code: "MISSING_LINK_BUILDER_URL", error_message: "Marketplace configuration missing (Shopee link builder URL is not configured)." };
      }

      const context = await this.getContext(job.provider);
      const page = await context.newPage();

      try {
        if (job.provider === "mercadolivre") {
          return await this.convertMercadoLivre(page, job);
        } else if (job.provider === "amazon") {
          return await this.convertAmazon(page, job);
        } else if (job.provider === "shopee") {
          return await this.convertShopee(page, job);
        } else {
          return { error_code: "UNKNOWN_PROVIDER", error_message: "Provider not supported by automated Playwright." };
        }
      } finally {
        await page.close();
      }
    } catch (e: any) {
      console.error("[Playwright] Core failure:", e);
      return {
        error_code: "PLAYWRIGHT_LAUNCH_FAILED",
        error_message: e?.message || "Unknown error during browser automation execution."
      };
    }
  }

  static async convertMercadoLivre(page: Page, job: AffiliateLinkJob) {
    const linkBuilderUrl = process.env.MERCADOLIVRE_LINK_BUILDER_URL;

    await page.goto(linkBuilderUrl!, { waitUntil: "domcontentloaded", timeout: 30000 });

    const loginRequired = await this.detectLoginRequired(page, "mercadolivre");
    if (loginRequired) return { error_code: "LOGIN_REQUIRED", error_message: "Mercado Livre needs manual login in admin dashboard." };

    const captcha = await this.detectCaptchaOr2FA(page);
    if (captcha) return { error_code: "CAPTCHA_DETECTED", error_message: "Captcha intervention required." };

    try {
      // Mocked realistic selectors: you would adapt these to the real marketplace page
      const input = page.getByRole('textbox', { name: /colar|inserir/i }).first();
      await input.waitFor({ state: "visible", timeout: 10000 });
      await input.fill(job.originalUrl);

      const generateBtn = page.getByRole('button', { name: /gerar|criar/i }).first();
      await generateBtn.click();

      // Wait for output link
      const outputInput = page.locator('input[readonly], .affiliate-link-output').first();
      await outputInput.waitFor({ state: "visible", timeout: 15000 });

      const affiliateUrl = await outputInput.inputValue() || await outputInput.innerText();
      if (!affiliateUrl) throw new Error("Link build failed, no output generated.");

      return { affiliateUrl: affiliateUrl.trim() };
    } catch (err: any) {
      return { error_code: "SELECTOR_NOT_FOUND", error_message: err.message };
    }
  }

  static async convertAmazon(page: Page, job: AffiliateLinkJob) {
    // Simulated behavior
    return { error_code: "LOGIN_REQUIRED", error_message: "Amazon needs manual login in admin dashboard." };
  }

  static async convertShopee(page: Page, job: AffiliateLinkJob) {
    // Simulated behavior
    return { error_code: "LOGIN_REQUIRED", error_message: "Shopee needs manual login in admin dashboard." };
  }

  static async detectLoginRequired(page: Page, provider: string) {
    const url = page.url();
    if (url.includes("login") || url.includes("signin")) return true;
    try {
      // Look for standard login elements
      const loginBtn = await page.getByRole('button', { name: /entrar|iniciar sesi|login/i }).count();
      return loginBtn > 0;
    } catch {
      return false;
    }
  }

  static async detectCaptchaOr2FA(page: Page) {
    const url = page.url();
    if (url.includes("challenge") || url.includes("captcha")) return true;
    try {
      const gcaptcha = await page.locator('.g-recaptcha, iframe[src*="recaptcha"]').count();
      return gcaptcha > 0;
    } catch {
      return false;
    }
  }
}
