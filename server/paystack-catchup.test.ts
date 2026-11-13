import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createCatchupService, catchupReference, sameCatchupState, type CatchupIntent } from "./paystack-catchup";

const input = { userId: 385, subscriptionId: 354, invoiceCode: "INV_gzra1vypqqbmmz0" };
function fixture() {
  let clock = Date.parse("2026-09-17T17:00:00Z");
  let saved: CatchupIntent | null = null;
  let verification: any = { kind: "absent" };
  const local = { userId:385,subscriptionId:354,customerCode:"CUS_owner",subscriptionCode:"SUB_owner",planCode:"PLN_monthly",
    amount:4900,currency:"ZAR",status:"paused",periodStart:"2026-09-15T10:00:00.000Z",activeIdentityCount:1,blocked:false,entitlementExpiresAt:null as string|null };
  const subscription = { id:20,domain:"test",subscription_code:"SUB_owner",status:"attention",amount:4900,
    customer:{id:10,email:"owner@example.com",customer_code:"CUS_owner"},
    plan:{plan_code:"PLN_monthly",interval:"monthly",currency:"ZAR"},
    authorization:{authorization_code:"AUTH_new",reusable:true,channel:"card"},
    next_payment_date:"2026-10-15T10:00:00.000Z",
    most_recent_invoice:{domain:"test",customer:10,subscription:20,invoice_code:input.invoiceCode,amount:4900,paid:0,status:"failed",
      period_start:local.periodStart,period_end:"2026-10-15T10:00:00.000Z"} };
  const payment = { reference:catchupReference(input.invoiceCode),amount:4900,currency:"ZAR",domain:"test",status:"success",id:123,
    customer:{customer_code:"CUS_owner"},authorization:{authorization_code:"AUTH_new"},paid_at:"2026-09-17T17:00:00.000Z",
    metadata:{catchupInvoice:input.invoiceCode,catchupSubscription:"SUB_owner",catchupUser:385} };
  const repository = {
    load:vi.fn(async () => ({ ...local })), attempt:vi.fn(async () => saved),
    claim:vi.fn(async (intent:CatchupIntent) => { if(saved) return false; saved=intent; return true; }),
    settle:vi.fn(async () => true),
  };
  const provider = {
    mode:"test" as const, subscription:vi.fn(async () => subscription), verify:vi.fn(async () => verification),
    successfulPayments:vi.fn(async () => [] as any[]),
    charge:vi.fn(async (_body:Record<string,unknown>) => { verification={kind:"present",data:payment}; }),
  };
  const service = createCatchupService(repository,provider,"signing-key",() => clock);
  return {local,subscription,payment,repository,provider,service,
    advance:() => {clock+=6*60_000;}, setVerification:(value:any) => {verification=value;} };
}

describe("guarded Paystack renewal catch-up", () => {
  it("previews without charging, claiming, settling, or exposing the authorization/email", async () => {
    const f=fixture(); const preview=await f.service.preview(input);
    expect(preview.outcome).toBe("ready_for_confirmation");
    expect(preview.amount).toBe(4900);
    expect(JSON.stringify(preview)).not.toContain("AUTH_new");
    expect(JSON.stringify(preview)).not.toContain("owner@example.com");
    expect(f.provider.charge).not.toHaveBeenCalled();
    expect(f.repository.claim).not.toHaveBeenCalled();
    expect(f.repository.settle).not.toHaveBeenCalled();
  });
  it("charges exactly once without a plan, then independently verifies before applying access", async () => {
    const f=fixture(); const preview=await f.service.preview(input);
    const result=await f.service.execute(input,preview.confirmationToken,true,1);
    expect(result.outcome).toBe("payment_and_access_applied");
    expect(f.provider.charge).toHaveBeenCalledTimes(1);
    expect(f.provider.charge.mock.calls[0][0]).toMatchObject({amount:4900,currency:"ZAR",authorization_code:"AUTH_new"});
    expect(f.provider.charge.mock.calls[0][0]).not.toHaveProperty("plan");
    expect(f.repository.claim.mock.invocationCallOrder[0]).toBeLessThan(f.provider.charge.mock.invocationCallOrder[0]);
    expect(f.provider.verify).toHaveBeenCalledWith(preview.reference);
    await f.service.execute(input,preview.confirmationToken,true,1);
    expect(f.provider.charge).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["nonreusable card",(f:ReturnType<typeof fixture>)=>{f.subscription.authorization.reusable=false;}],
    ["wrong customer",(f:ReturnType<typeof fixture>)=>{f.subscription.customer.customer_code="CUS_other";}],
    ["wrong plan",(f:ReturnType<typeof fixture>)=>{f.subscription.plan.plan_code="PLN_other";}],
    ["paid invoice",(f:ReturnType<typeof fixture>)=>{f.subscription.most_recent_invoice.paid=1;}],
    ["different invoice",(f:ReturnType<typeof fixture>)=>{f.subscription.most_recent_invoice.invoice_code="INV_other";}],
    ["ambiguous identity",(f:ReturnType<typeof fixture>)=>{f.local.activeIdentityCount=2;}],
    ["cancellation or pending checkout",(f:ReturnType<typeof fixture>)=>{f.local.blocked=true;}],
    ["already active",(f:ReturnType<typeof fixture>)=>{f.local.status="active";}],
    ["mode mismatch",(f:ReturnType<typeof fixture>)=>{f.subscription.domain="live";}],
    ["unverified billing period",(f:ReturnType<typeof fixture>)=>{f.subscription.most_recent_invoice.period_end="invalid";}],
    ["wrong amount",(f:ReturnType<typeof fixture>)=>{f.local.amount=53000;}],
    ["longer complimentary access",(f:ReturnType<typeof fixture>)=>{f.local.entitlementExpiresAt="2026-11-01T00:00:00Z";}],
  ])("fails closed for %s", async (_label,change) => {
    const f=fixture(); change(f);
    await expect(f.service.preview(input)).rejects.toThrow();
    expect(f.provider.charge).not.toHaveBeenCalled();
  });
  it("blocks another successful R49 payment but ignores R1 tokenization",async()=>{
    const f=fixture(); f.provider.successfulPayments.mockResolvedValue([{amount:100,currency:"ZAR"}]);
    await expect(f.service.preview(input)).resolves.toMatchObject({outcome:"ready_for_confirmation"});
    f.provider.successfulPayments.mockResolvedValue([{amount:4900,currency:"ZAR"}]);
    await expect(f.service.preview(input)).rejects.toThrow("possible_existing_period_payment");
  });
  it("does not treat a failed provider lookup as an absent reference",async()=>{
    const f=fixture(); f.provider.verify.mockRejectedValue(new Error("timeout"));
    await expect(f.service.preview(input)).rejects.toThrow();
    expect(f.provider.charge).not.toHaveBeenCalled();
  });
  it("requires an explicit confirmation and rejects tampered, expired, or wrong-owner tokens",async()=>{
    const f=fixture(); const preview=await f.service.preview(input);
    await expect(f.service.execute(input,preview.confirmationToken,false,1)).rejects.toThrow();
    await expect(f.service.execute(input,preview.confirmationToken+"1",true,1)).rejects.toThrow();
    await expect(f.service.execute({...input,userId:99},preview.confirmationToken,true,1)).rejects.toThrow();
    f.advance(); await expect(f.service.execute(input,preview.confirmationToken,true,1)).rejects.toThrow("preview_expired");
    expect(f.provider.charge).not.toHaveBeenCalled();
  });
  it("requires another preview if the installed card changes",async()=>{
    const f=fixture(); const preview=await f.service.preview(input);
    f.subscription.authorization.authorization_code="AUTH_changed";
    await expect(f.service.execute(input,preview.confirmationToken,true,1)).rejects.toThrow("preview_changed");
    expect(f.repository.claim).not.toHaveBeenCalled();
    expect(f.provider.charge).not.toHaveBeenCalled();
  });
  it("a concurrent losing claim cannot charge",async()=>{
    const f=fixture(); const preview=await f.service.preview(input);
    f.repository.claim.mockResolvedValue(false);
    await expect(f.service.execute(input,preview.confirmationToken,true,1)).resolves.toMatchObject({outcome:"attempt_already_claimed"});
    expect(f.provider.charge).not.toHaveBeenCalled();
  });
  it("an ambiguous charge response can be verified, but is never retried",async()=>{
    const f=fixture(); const preview=await f.service.preview(input);
    f.provider.charge.mockImplementation(async()=>{throw new Error("timeout");});
    await expect(f.service.execute(input,preview.confirmationToken,true,1)).resolves.toMatchObject({outcome:"charge_result_unknown"});
    await f.service.execute(input,preview.confirmationToken,true,1);
    expect(f.provider.charge).toHaveBeenCalledTimes(1);
    expect(f.repository.settle).not.toHaveBeenCalled();
    f.setVerification({kind:"present",data:f.payment});
    const recovery=await f.service.preview(input);
    expect(recovery.outcome).toBe("verify_previous_attempt_only");
    await expect(f.service.execute(input,recovery.confirmationToken,true,1)).resolves.toMatchObject({outcome:"payment_and_access_applied"});
    expect(f.provider.charge).toHaveBeenCalledTimes(1);
  });
  it("a successful HTTP call without successful verification does not grant access",async()=>{
    const f=fixture(); const preview=await f.service.preview(input); f.payment.status="failed";
    await expect(f.service.execute(input,preview.confirmationToken,true,1)).resolves.toMatchObject({outcome:"payment_not_successful"});
    expect(f.repository.settle).not.toHaveBeenCalled();
  });
  it("mismatched verified payment metadata cannot restore access",async()=>{
    const f=fixture(); const preview=await f.service.preview(input); f.payment.metadata.catchupUser=99;
    await expect(f.service.execute(input,preview.confirmationToken,true,1)).rejects.toThrow("verified_payment_mismatch");
    expect(f.repository.settle).not.toHaveBeenCalled();
  });
  it("payment success followed by settlement failure never triggers another charge",async()=>{
    const f=fixture(); const preview=await f.service.preview(input); f.repository.settle.mockResolvedValue(false);
    await expect(f.service.execute(input,preview.confirmationToken,true,1)).resolves.toMatchObject({outcome:"payment_received_settlement_review_required"});
    await f.service.execute(input,preview.confirmationToken,true,1);
    expect(f.provider.charge).toHaveBeenCalledTimes(1);
  });
  it("stable references use supported characters and JSONB ordering does not change state",()=>{
    expect(catchupReference(input.invoiceCode)).toMatch(/^ss-catchup-[a-f0-9]{40}$/);
    expect(sameCatchupState({a:1,b:2},{b:2,a:1})).toBe(true);
  });
  it("routes require admin, feature gate, account allowlist, and explicit execution confirmation",()=>{
    const routes=readFileSync(new URL("./admin-routes.ts",import.meta.url),"utf8");
    const runtime=readFileSync(new URL("./paystack-catchup-runtime.ts",import.meta.url),"utf8");
    const webhooks=readFileSync(new URL("./routes.ts",import.meta.url),"utf8");
    expect(routes).toContain('paystack-catchup/${operation}`, requireAdmin');
    expect(routes).toContain('req.body?.confirmed !== true');
    expect(runtime).toContain('PAYSTACK_ADMIN_CATCHUP_ENABLED === "true"');
    expect(runtime).toContain('PAYSTACK_ADMIN_CATCHUP_USER_IDS');
    expect(runtime).toContain('pg_advisory_xact_lock($1, 36)');
    expect(webhooks.indexOf("isCatchupReference(data.reference)")).toBeLessThan(webhooks.indexOf("Processing Paystack charge success"));
  });
});
