import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ events:[] as any[], payments:[] as any[], operations:[] as string[], providerPayment:null as any,
  nextDate:"2026-09-15T10:00:00.000Z", status:"paused" }));
const query = vi.hoisted(() => vi.fn(async (sql:string, values:any[] = []) => {
  state.operations.push(sql);
  if (sql.includes("SELECT s.*")) return {rows:[{id:354,user_id:385,plan_id:2,status:state.status,
    next_billing_date:new Date(state.nextDate),paystack_customer_code:"CUS_owner",subscription_code:"SUB_owner",
    customer_code:"CUS_owner",plan_code:"PLN_monthly",paystack_plan_code:"PLN_monthly",price:4900,currency:"ZAR",
    billing_period:"monthly",is_active:true,identity_count:1,pending_checkout:false,cancellation:false,
    period_payment:state.payments.length>0,subscription_expires_at:null}]};
  if(sql.includes("FROM payment_transactions")) return {rows:state.payments};
  if(sql.includes("FROM billing_events")) return {rows:state.events};
  if(sql.includes("INSERT INTO billing_events") && !sql.includes("admin_paystack_catchup_settled")) {
    // Simulate JSONB's canonical ordering, not JS insertion ordering.
    const data=JSON.parse(values[2]);
    data.intent=Object.fromEntries(Object.entries(data.intent).reverse());
    state.events.push({id:1,user_id:385,event_data:data,processed:false}); return {rows:[]};
  }
  if(sql.includes("INSERT INTO payment_transactions")) {
    state.payments.push({user_id:values[0],subscription_id:values[1],amount:values[2],currency:values[3]}); return {rows:[{id:1}]};
  }
  if(sql.includes("UPDATE user_subscriptions")) {state.status="active";state.nextDate=values[0];}
  if(sql.includes("UPDATE billing_events")) state.events[0].processed=true;
  return {rows:[]};
}));
vi.mock("./db",()=>({pool:{query,connect:vi.fn(async()=>({query,release:vi.fn()}))}}));
vi.mock("./paystack-billing-schema",()=>({requirePaystackBillingSchema:vi.fn(async()=>undefined)}));
vi.mock("./billing-owner",()=>({resolveBillingOwner:vi.fn(async()=>({state:"resolved",billingOwnerUserId:385,canManageBilling:true}))}));
import { catchupRuntime } from "./paystack-catchup-runtime";
const input={userId:385,subscriptionId:354,invoiceCode:"INV_test"};
const env={...process.env};

beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
  state.events=[];state.payments=[];state.operations=[];state.providerPayment=null;
  state.nextDate="2026-09-15T10:00:00.000Z";state.status="paused";
  process.env.PAYSTACK_ADMIN_CATCHUP_ENABLED="true";process.env.PAYSTACK_ADMIN_CATCHUP_USER_IDS="385";
  process.env.PAYSTACK_SECRET_KEY="sk_test_fake";process.env.NODE_ENV="test";
  vi.stubGlobal("fetch",vi.fn(async(url:string,options:any)=>{
    state.operations.push(`FETCH ${options.method} ${url}`);
    let data:any;let status=200;
    if(url.includes("/subscription/")) data={status:true,data:{id:20,domain:"test",subscription_code:"SUB_owner",amount:4900,status:"attention",
      customer:{id:10,email:"owner@example.com",customer_code:"CUS_owner"},plan:{plan_code:"PLN_monthly",currency:"ZAR",interval:"monthly"},
      authorization:{authorization_code:"AUTH_new",reusable:true,channel:"card"},next_payment_date:"2026-10-15T10:00:00.000Z",
      most_recent_invoice:{domain:"test",customer:10,subscription:20,invoice_code:"INV_test",paid:0,status:"failed",amount:4900,
        period_start:"2026-09-15T10:00:00.000Z",period_end:"2026-10-15T10:00:00.000Z"}}};
    else if(url.includes("/transaction/verify/")) {
      if(state.providerPayment)data={status:true,data:state.providerPayment};
      else {status=400;data={status:false,message:"Transaction reference not found"};}
    } else if(url.includes("/transaction/charge_authorization")) {
      const body=JSON.parse(options.body);
      state.providerPayment={...body,domain:"test",status:"success",id:123,customer:{customer_code:"CUS_owner"},
        authorization:{authorization_code:body.authorization_code},paid_at:"2026-09-17T12:00:00.000Z"};
      data={status:true};
    } else data={status:true,data:[],meta:{total:0}};
    return new Response(JSON.stringify(data),{status});
  }));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();process.env={...env};});
describe("catch-up production adapter (mocked provider/database)",()=>{
  it("commits a durable claim before a charge and atomically applies one payment despite JSONB key ordering",async()=>{
    const service=await catchupRuntime(input);const preview=await service.preview(input);
    expect(state.events).toHaveLength(0);
    await expect(service.execute(input,preview.confirmationToken,true,1)).resolves.toMatchObject({outcome:"payment_and_access_applied"});
    expect(state.payments).toHaveLength(1);expect(state.status).toBe("active");expect(state.nextDate).toBe("2026-10-15T10:00:00.000Z");
    const chargeIndex=state.operations.findIndex(value=>value.includes("FETCH POST"));
    expect(state.operations.slice(0,chargeIndex)).toContain("COMMIT");
    const replay=await service.preview(input);
    await expect(service.execute(input,replay.confirmationToken,true,1)).resolves.toMatchObject({outcome:"payment_and_access_applied"});
    expect(state.payments).toHaveLength(1);
    expect(state.operations.filter(value=>value.includes("FETCH POST"))).toHaveLength(1);
  });
  it("does not contact Paystack if the feature gate or owner allowlist is absent",async()=>{
    delete process.env.PAYSTACK_ADMIN_CATCHUP_ENABLED;
    await expect(catchupRuntime(input)).rejects.toThrow("catchup_feature_disabled");
    process.env.PAYSTACK_ADMIN_CATCHUP_ENABLED="true";process.env.PAYSTACK_ADMIN_CATCHUP_USER_IDS="99";
    await expect(catchupRuntime(input)).rejects.toThrow("catchup_feature_disabled");expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a test credential in production without attempting any provider request",async()=>{
    process.env.NODE_ENV="production";
    await expect(catchupRuntime(input)).rejects.toThrow("production_live_credential_required");expect(fetch).not.toHaveBeenCalled();
  });
});
