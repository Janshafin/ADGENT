import { describe, expect, it } from "vitest";
import { splitSale } from "@/lib/money/split";

describe("splitSale", () => {
  it("keeps gross = merchant + publisher + platform for every case", () => {
    for (const unit of [1899, 2199, 14900, 1]) {
      for (const disc of [0, 5, 190]) {
        if (disc > unit) continue;
        for (const fee of [0, 0.06, 0.1, 0.12, 0.3]) {
          for (const rev of [0, 0.3, 0.5, 1]) {
            const s = splitSale({ unitCents: unit, discountCents: disc, feeRate: fee, revShare: rev });
            expect(s.merchantNet + s.publisherShare + s.platformNet + s.discount).toBe(unit);
          }
        }
      }
    }
  });

  it("charges the fee on the discounted price, not list price", () => {
    const s = splitSale({ unitCents: 1000, discountCents: 100, feeRate: 0.1, revShare: 0.5 });
    expect(s.adFee).toBe(90);
    expect(s.publisherShare).toBe(45);
    expect(s.merchantNet).toBe(810);
  });

  it("rejects invalid inputs", () => {
    expect(() => splitSale({ unitCents: 0, discountCents: 0, feeRate: 0.1, revShare: 0.5 })).toThrow(RangeError);
    expect(() => splitSale({ unitCents: 100, discountCents: 200, feeRate: 0.1, revShare: 0.5 })).toThrow(RangeError);
    expect(() => splitSale({ unitCents: 100, discountCents: 0, feeRate: 0.9, revShare: 0.5 })).toThrow(RangeError);
  });
});
