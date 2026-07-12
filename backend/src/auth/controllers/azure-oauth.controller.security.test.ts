import { Request, Response } from "express";

jest.mock("@/utils/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("@/config/database", () => ({
  db: {
    getClient: jest.fn(),
  },
}));

jest.mock("@/services/crypto.service", () => ({
  cryptoService: {
    encryptToken: jest.fn(),
  },
}));

describe("AzureOAuthController error rendering", () => {
  it("serializes exception text without creating executable inline script", async () => {
    const { azureOAuthController } = await import("./azure-oauth.controller");
    const maliciousMessage =
      "');window.__oauthXss=true;//</script><script>window.__tagXss=true</script>";
    const send = jest.fn();
    const status = jest.fn().mockReturnValue({ send });
    const req = {
      query: {
        code: "invalid-code",
        state: encodeURIComponent(JSON.stringify({ userId: "1" })),
      },
    } as unknown as Request;
    const res = { status } as unknown as Response;

    (azureOAuthController as any).msalClient = {
      acquireTokenByCode: jest
        .fn()
        .mockRejectedValue(new Error(maliciousMessage)),
    };

    await azureOAuthController.callback(req, res);

    expect(status).toHaveBeenCalledWith(500);
    const body = send.mock.calls[0][0] as string;
    expect(body).not.toContain("error: '');window.__oauthXss=true");
    expect(body).not.toContain("</script><script>window.__tagXss");
    expect(body).toContain("\\u003c/script\\u003e");
    expect(body).toContain("&#39;);window.__oauthXss=true");
  });
});
