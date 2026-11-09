/**
 * All money in integer cents. A sale splits into merchant net, ad fee and
 * publisher share; the invariant gross = merchant + publisher + platform always holds.
 */
export type Split = { gross: number; discount: number; merchantNet: number; adFee: number; publisherShare: number; platformNet: number };

export function splitSale(args: { unitCents: number; discountCents: number; feeRate: number; revShare: number }): Split {
  if (args.unitCents <= 0) throw new RangeError("unitCents must be positive");
  if (args.discountCents < 0 || args.discountCents > args.unitCents) throw new RangeError("discount out of range");
  if (args.feeRate < 0 || args.feeRate > 0.3) throw new RangeError("feeRate out of range");
  if (args.revShare < 0 || args.revShare > 1) throw new RangeError("revShare out of range");
  const net = args.unitCents - args.discountCents;
  const adFee = Math.round(net * args.feeRate);
  const publisherShare = Math.round(adFee * args.revShare);
  const platformNet = adFee - publisherShare;
  // merchant receives what's left of the sale after the ad fee
  const merchantNet = net - adFee;
  return { gross: args.unitCents, discount: args.discountCents, merchantNet, adFee, publisherShare, platformNet };
}
