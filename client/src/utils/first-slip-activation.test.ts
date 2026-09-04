import { describe, expect, it } from "vitest";
import { getFirstSlipSuccessId, isFirstSlipEligible } from "./first-slip-activation";

const eligible = {
  authenticated: true, queryLoaded: true, queryError: false,
  isOnline: true, pendingUploads: 0, receiptCount: 0, sessionDismissed: false,
};

describe("first slip activation eligibility", () => {
  it("requires a successfully loaded, empty, online account", () => {
    expect(isFirstSlipEligible(eligible)).toBe(true);
    expect(isFirstSlipEligible({ ...eligible, queryLoaded: false })).toBe(false);
    expect(isFirstSlipEligible({ ...eligible, queryError: true })).toBe(false);
    expect(isFirstSlipEligible({ ...eligible, isOnline: false })).toBe(false);
  });

  it("never activates with pending uploads, receipts, or dismissal", () => {
    expect(isFirstSlipEligible({ ...eligible, pendingUploads: 1 })).toBe(false);
    expect(isFirstSlipEligible({ ...eligible, receiptCount: 1 })).toBe(false);
    expect(isFirstSlipEligible({ ...eligible, sessionDismissed: true })).toBe(false);
  });

  it("uses only a real online saved receipt id for the zero-to-one success", () => {
    expect(getFirstSlipSuccessId({ wasEligible: true, isOnline: true, savedReceiptId: 42 })).toBe(42);
    expect(getFirstSlipSuccessId({ wasEligible: false, isOnline: true, savedReceiptId: 42 })).toBeNull();
    expect(getFirstSlipSuccessId({ wasEligible: true, isOnline: false, savedReceiptId: 42 })).toBeNull();
    expect(getFirstSlipSuccessId({ wasEligible: true, isOnline: true, savedReceiptId: undefined })).toBeNull();
  });
});