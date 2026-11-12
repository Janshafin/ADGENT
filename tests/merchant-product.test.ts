
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: async () => {},
}));

import { freshDb } from "./helpers/db";
import { POST as merchantPOST, GET as merchantGET } from "@/app/api/merchants/route";
import { POST as productPOST, GET as productGET } from "@/app/api/products/route";

const post = (data: unknown) =>
  new Request("http://test.local/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });

describe("merchant and product APIs", () => {
  let merchantId = "";

  beforeAll(async () => {
    await freshDb();
  });

  describe("merchant API", () => {
    it("creates a merchant successfully without exposing PayPal email", async () => {
      const email = "private-merchant@test.example";

      const res = await merchantPOST(post({
        name: "API Test Roasters",
        category: "coffee",
        paypalEmail: email,
        emoji: "☕",
      }));

      expect(res.status).toBe(201);

      const data = await res.json();
      merchantId = data.id;

      expect(merchantId).toMatch(/^m_/);
      expect(data.name).toBe("API Test Roasters");
      expect(data.category).toBe("coffee");
      expect(JSON.stringify(data)).not.toContain(email);
    });

    it("rejects invalid merchant details", async () => {
      const res = await merchantPOST(post({
        name: "A",
        category: "coffee",
        paypalEmail: "not-an-email",
      }));

      expect(res.status).toBe(400);
    });

    it("never exposes PayPal emails in the public merchant list", async () => {
      const res = await merchantGET();
      const text = JSON.stringify(await res.json());

      expect(res.status).toBe(200);
      expect(text).toContain("API Test Roasters");
      expect(text).not.toContain("private-merchant@test.example");
    });
  });

  describe("product API", () => {
    it("creates a product successfully", async () => {
      expect(merchantId).toBeTruthy();

      const res = await productPOST(post({
        merchantId,
        title: "API Test Coffee",
        description: "Freshly roasted coffee beans.",
        category: "coffee",
        priceCents: 1500,
        image: "/coffee.jpg",
        tags: ["coffee", "fresh"],
      }));

      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.id).toMatch(/^p_/);
      expect(data.merchantId).toBe(merchantId);
      expect(data.title).toBe("API Test Coffee");
      expect(data.priceCents).toBe(1500);
    });

    it("rejects invalid product details", async () => {
      const res = await productPOST(post({
        merchantId,
        title: "A",
        description: "Bad",
        category: "coffee",
        priceCents: 10,
        image: "invalid-image",
      }));

      expect(res.status).toBe(400);
    });

    it("returns 404 when the merchant does not exist", async () => {
      const res = await productPOST(post({
        merchantId: "m_doesnotexist",
        title: "Test Product",
        description: "A valid product description.",
        category: "coffee",
        priceCents: 1500,
        image: "/coffee.jpg",
      }));

      expect(res.status).toBe(404);
    });

    it("filters products by merchant ID", async () => {
      const res = await productGET(
        new Request(`http://test.local/api/products?merchantId=${merchantId}`)
      );

      expect(res.status).toBe(200);

      const products = await res.json();

      expect(products.length).toBeGreaterThan(0);
      expect(products.every((p: { merchantId: string }) =>
        p.merchantId === merchantId
      )).toBe(true);
      expect(products.some((p: { title: string }) =>
        p.title === "API Test Coffee"
      )).toBe(true);
    });
  });
});
