import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { classifyPaystackDisableWithReadback } from "../server/paystack-cancellation-provider-contract";

const API_ROOT = "https://api.paystack.co";
const MUTATION_ACK = "DISABLE_DISPOSABLE_TEST_SUBSCRIPTION";

type ProviderEnvelope = {
  status?: boolean;
  message?: string;
  data?: Record<string, any>;
};

type SafeResponse = {
  httpStatus: number;
  elapsedMs: number;
  body: ProviderEnvelope;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Refusing to run: ${name} is required.`);
  return value;
}

function assertCode(name: string, value: string, prefix: "SUB_" | "CUS_" | "PLN_") {
  if (!value.startsWith(prefix) || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Refusing to run: ${name} is not a syntactically valid ${prefix} value.`);
  }
}

function nestedCode(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const code = (value as Record<string, unknown>)[key];
  return typeof code === "string" ? code : null;
}

function safeSummary(result: SafeResponse) {
  const data = result.body.data ?? {};
  return {
    httpStatus: result.httpStatus,
    elapsedMs: result.elapsedMs,
    providerStatus: result.body.status ?? null,
    message: result.body.message ?? null,
    domain: data.domain ?? null,
    status: data.status ?? null,
    subscriptionCode: typeof data.subscription_code === "string" ? "SUB_[redacted]" : null,
    customerCode: nestedCode(data.customer, "customer_code") ? "CUS_[redacted]" : null,
    planCode: nestedCode(data.plan, "plan_code") ? "PLN_[redacted]" : null,
    emailToken: typeof data.email_token === "string" ? "[present, redacted]" : "[absent]",
    authorizationCode: nestedCode(data.authorization, "authorization_code") ? "[present, redacted]" : "[absent]",
    cancelledAt: data.cancelledAt ? "[present]" : "[absent]",
    nextPaymentDate: data.next_payment_date ?? null,
  };
}

async function providerRequest(
  secret: string,
  path: string,
  init: RequestInit = {},
): Promise<SafeResponse> {
  const started = performance.now();
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const elapsedMs = Math.round(performance.now() - started);
  const body = await response.json() as ProviderEnvelope;
  return { httpStatus: response.status, elapsedMs, body };
}

function exactReadback(
  result: SafeResponse,
  subscriptionCode: string,
  customerCode: string,
  planCode: string,
) {
  const data = result.body.data ?? {};
  return {
    httpStatus: result.httpStatus,
    domain: typeof data.domain === "string" ? data.domain : null,
    subscriptionCode: typeof data.subscription_code === "string" ? data.subscription_code : null,
    customerCode: nestedCode(data.customer, "customer_code"),
    planCode: nestedCode(data.plan, "plan_code"),
    status: typeof data.status === "string" ? data.status : null,
    matchesExpected: data.subscription_code === subscriptionCode
      && nestedCode(data.customer, "customer_code") === customerCode
      && nestedCode(data.plan, "plan_code") === planCode,
  };
}

function assertDisposableTestFixture(
  result: SafeResponse,
  expected: { subscriptionCode: string; customerCode: string; planCode: string; marker: string },
) {
  const data = result.body.data ?? {};
  if (result.httpStatus !== 200 || result.body.status !== true || data.domain !== "test") {
    throw new Error("Refusing to mutate: provider fetch did not prove domain=test.");
  }
  if (
    data.subscription_code !== expected.subscriptionCode
    || nestedCode(data.customer, "customer_code") !== expected.customerCode
    || nestedCode(data.plan, "plan_code") !== expected.planCode
  ) {
    throw new Error("Refusing to mutate: exact SUB/CUS/PLN relationship was not proven.");
  }
  const marker = expected.marker.toLowerCase();
  const fixtureLabels = [data.plan?.name, data.customer?.email]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (!fixtureLabels.includes(marker)) {
    throw new Error("Refusing to mutate: disposable fixture marker was not found in provider labels.");
  }
  if (typeof data.email_token !== "string" || data.email_token.length === 0) {
    throw new Error("Refusing to mutate: email_token is absent immediately before cancellation.");
  }
  return data.email_token as string;
}

async function main() {
  const secret = required("PAYSTACK_TEST_SECRET_KEY");
  if (!secret.startsWith("sk_test_") || secret.startsWith("sk_live_")) {
    throw new Error("Refusing to run: only an sk_test_ credential is accepted.");
  }

  const subscriptionCode = required("PAYSTACK_CONTRACT_SUBSCRIPTION_CODE");
  const customerCode = required("PAYSTACK_CONTRACT_CUSTOMER_CODE");
  const planCode = required("PAYSTACK_CONTRACT_PLAN_CODE");
  const marker = required("PAYSTACK_CONTRACT_FIXTURE_MARKER");
  assertCode("PAYSTACK_CONTRACT_SUBSCRIPTION_CODE", subscriptionCode, "SUB_");
  assertCode("PAYSTACK_CONTRACT_CUSTOMER_CODE", customerCode, "CUS_");
  assertCode("PAYSTACK_CONTRACT_PLAN_CODE", planCode, "PLN_");
  if (!/^SS_PHASE4_CONTRACT_[A-Za-z0-9_-]+$/i.test(marker)) {
    throw new Error("Refusing to run: fixture marker must be a unique SS_PHASE4_CONTRACT_* label.");
  }

  const fetched = await providerRequest(secret, `/subscription/${encodeURIComponent(subscriptionCode)}`);
  const emailToken = assertDisposableTestFixture(fetched, { subscriptionCode, customerCode, planCode, marker });
  console.log(JSON.stringify({ case: "fetch", result: safeSummary(fetched) }, null, 2));

  const requestedCase = process.argv[2] ?? "fetch";
  if (requestedCase === "fetch") return;
  if (process.env.PAYSTACK_CONTRACT_MUTATION_ACK !== MUTATION_ACK) {
    throw new Error(`Refusing provider mutation: set PAYSTACK_CONTRACT_MUTATION_ACK=${MUTATION_ACK}.`);
  }

  if (requestedCase === "wrong-token") {
    const replacement = emailToken.endsWith("x") ? "y" : "x";
    const invalidToken = `${emailToken.slice(0, -1)}${replacement}`;
    const disabled = await providerRequest(secret, "/subscription/disable", {
      method: "POST",
      body: JSON.stringify({ code: subscriptionCode, token: invalidToken }),
    });
    const after = await providerRequest(secret, `/subscription/${encodeURIComponent(subscriptionCode)}`);
    console.log(JSON.stringify({
      case: requestedCase,
      disable: safeSummary(disabled),
      readback: safeSummary(after),
      classification: classifyPaystackDisableWithReadback({
        expectedSubscriptionCode: subscriptionCode,
        expectedCustomerCode: customerCode,
        expectedPlanCode: planCode,
        disableHttpStatus: disabled.httpStatus,
        readback: exactReadback(after, subscriptionCode, customerCode, planCode),
      }),
    }, null, 2));
    return;
  }

  if (requestedCase === "missing-subscription") {
    const missingCode = `SUB_ssphase4${randomBytes(8).toString("hex")}`;
    const missingFetch = await providerRequest(secret, `/subscription/${missingCode}`);
    const missingDisable = await providerRequest(secret, "/subscription/disable", {
      method: "POST",
      body: JSON.stringify({ code: missingCode, token: "intentionally_invalid_test_token" }),
    });
    console.log(JSON.stringify({
      case: requestedCase,
      fetch: safeSummary(missingFetch),
      disable: safeSummary(missingDisable),
    }, null, 2));
    return;
  }

  if (requestedCase !== "disable") {
    throw new Error("Unknown case. Use fetch, wrong-token, missing-subscription, or disable.");
  }

  if ((fetched.body.data ?? {}).status !== "active") {
    throw new Error("Refusing first-disable test: disposable fixture is not currently active.");
  }
  const first = await providerRequest(secret, "/subscription/disable", {
    method: "POST",
    body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
  });
  const polls: Array<{ targetMs: number; result: SafeResponse }> = [];
  let previousTarget = 0;
  for (const targetMs of [0, 1_000, 5_000, 15_000]) {
    await delay(targetMs - previousTarget);
    polls.push({
      targetMs,
      result: await providerRequest(secret, `/subscription/${encodeURIComponent(subscriptionCode)}`),
    });
    previousTarget = targetMs;
  }
  const repeated = await providerRequest(secret, "/subscription/disable", {
    method: "POST",
    body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
  });
  const finalRead = await providerRequest(secret, `/subscription/${encodeURIComponent(subscriptionCode)}`);
  console.log(JSON.stringify({
    case: requestedCase,
    firstDisable: safeSummary(first),
    polls: polls.map(({ targetMs, result }) => ({ targetMs, ...safeSummary(result) })),
    repeatedDisable: safeSummary(repeated),
    finalReadback: safeSummary(finalRead),
    classification: classifyPaystackDisableWithReadback({
      expectedSubscriptionCode: subscriptionCode,
      expectedCustomerCode: customerCode,
      expectedPlanCode: planCode,
      disableHttpStatus: repeated.httpStatus,
      readback: exactReadback(finalRead, subscriptionCode, customerCode, planCode),
    }),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown contract-runner failure.");
  process.exitCode = 1;
});
