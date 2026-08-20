import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeApp, clearRateLimit } from "./setup";
import * as emailService from "../services/email";
import * as apolloService from "../services/apollo";

vi.mock("../services/email", () => ({
  sendConfirmation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/apollo", () => ({
  addToProductList: vi.fn().mockResolvedValue(undefined),
}));

// These values must match baseEnv in ./setup.ts — if setup changes, update here.
const SETUP_PRODUCT_NAME = "Horiva";
const SETUP_PRODUCT_DOMAIN = "horiva.app";
const SETUP_BRAND_COLOR = "#6B2D8B";
const SETUP_APOLLO_KEY = "test-apollo-key";

describe("POST /api/signup — side-effect verification", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    clearRateLimit();
    app = await makeApp();
  });

  async function post(body: unknown) {
    return app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("sendConfirmation is called with correct productName, recipientEmail, and brandColor", async () => {
    await post({ email: "alice@example.com", sourcePage: "/" });

    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledOnce();
    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: SETUP_PRODUCT_NAME,
        recipientEmail: "alice@example.com",
        brandColor: SETUP_BRAND_COLOR,
      }),
    );
  });

  it("sendConfirmation receives referralUrl built from PRODUCT_DOMAIN and referralCode", async () => {
    const res = await post({ email: "bob@example.com", sourcePage: "/" });
    const body = (await res.json()) as { referralCode: string };
    const referralCode = body.referralCode;

    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledWith(
      expect.objectContaining({
        referralUrl: `https://${SETUP_PRODUCT_DOMAIN}/?ref=${referralCode}`,
      }),
    );
  });

  it("sendConfirmation receives the surveyToken from the signup response", async () => {
    const res = await post({ email: "carol@example.com", sourcePage: "/" });
    const body = (await res.json()) as { surveyToken: string };
    const surveyToken = body.surveyToken;

    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledWith(
      expect.objectContaining({
        surveyToken,
      }),
    );
  });

  it("sendConfirmation receives correct signupPosition", async () => {
    await post({ email: "first@example.com", sourcePage: "/" });

    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledWith(
      expect.objectContaining({
        signupPosition: 1,
      }),
    );
  });

  it("addToProductList is called with correct email and productName", async () => {
    await post({ email: "test@example.com", sourcePage: "/" });

    expect(vi.mocked(apolloService.addToProductList)).toHaveBeenCalledOnce();
    expect(vi.mocked(apolloService.addToProductList)).toHaveBeenCalledWith(
      "test@example.com",
      SETUP_PRODUCT_NAME,
      SETUP_APOLLO_KEY,
      expect.objectContaining({
        e2eMode: true,
      }),
    );
  });

  it("duplicate signup (200) does NOT call sendConfirmation or addToProductList again", async () => {
    await post({ email: "dup@example.com", sourcePage: "/" });

    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledOnce();
    expect(vi.mocked(apolloService.addToProductList)).toHaveBeenCalledOnce();

    const dupRes = await post({ email: "dup@example.com", sourcePage: "/" });
    expect(dupRes.status).toBe(200);

    // Still called exactly once total — the duplicate did not trigger another call
    expect(vi.mocked(emailService.sendConfirmation)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apolloService.addToProductList)).toHaveBeenCalledTimes(1);
  });

  it("services are not called when signup fails validation (400)", async () => {
    const res = await post({ email: "not-an-email", sourcePage: "/" });
    expect(res.status).toBe(400);

    expect(vi.mocked(emailService.sendConfirmation)).not.toHaveBeenCalled();
    expect(vi.mocked(apolloService.addToProductList)).not.toHaveBeenCalled();
  });
});
