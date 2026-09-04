import type { AccountDeletionCode } from "./account-deletion-service";

type ResponseLike = {
  status: (status: number) => ResponseLike;
  json: (body: Record<string, unknown>) => unknown;
};
type RequestLike = {
  body: { password?: string; confirmationText?: string };
  session?: { destroy: (callback: (error?: unknown) => void) => void };
};
export interface AccountDeletionHandlerDependencies {
  getUser: (id: number) => Promise<{ password: string } | undefined>;
  comparePassword: (input: string, hash: string) => Promise<boolean>;
  deleteAccount: (id: number) => Promise<unknown>;
  log: (message: string, category: string) => void;
}

const respond = (res: ResponseLike, status: number, code: string, userMessage: string) =>
  res.status(status).json({ error: code, code, userMessage });

export async function handleAccountDeletionRequest(
  req: RequestLike, res: ResponseLike, userId: number, deps: AccountDeletionHandlerDependencies,
): Promise<unknown> {
  const { password, confirmationText } = req.body ?? {};
  if (!password) return respond(res, 400, "PASSWORD_REQUIRED", "Please enter your password to confirm.");
  if (!confirmationText) return respond(res, 400, "CONFIRMATION_REQUIRED", "Please type 'DELETE MY ACCOUNT' in the confirmation box.");
  if (confirmationText !== "DELETE MY ACCOUNT") return respond(res, 400, "CONFIRMATION_TEXT_INCORRECT", "Please type exactly 'DELETE MY ACCOUNT' to confirm.");
  const user = await deps.getUser(userId);
  if (!user) return respond(res, 404, "NOT_FOUND", "This account has already been deleted.");
  if (!await deps.comparePassword(password, user.password)) {
    return respond(res, 403, "INCORRECT_PASSWORD", "The password you entered is incorrect.");
  }
  try {
    await deps.deleteAccount(userId);
  } catch (error) {
    const code = (error as { code?: AccountDeletionCode })?.code;
    const messages: Partial<Record<AccountDeletionCode, [number, string]>> = {
      NOT_FOUND: [404, "This account has already been deleted."],
      ACTIVE_PROVIDER_SUBSCRIPTION: [409, "This account has billing activity and cannot be deleted here. Please contact support."],
      DEPENDENCY_CONFLICT: [409, "This account belongs to a shared workspace and cannot be deleted here."],
      UNEXPECTED_DELETION_FAILURE: [500, "We could not delete your account. Please try again or contact support."],
    };
    const [status, message] = messages[code ?? "UNEXPECTED_DELETION_FAILURE"] ?? messages.UNEXPECTED_DELETION_FAILURE!;
    deps.log(`Account deletion rejected userId=${userId} code=${code ?? "UNEXPECTED_DELETION_FAILURE"}`, "api");
    return respond(res, status, code ?? "UNEXPECTED_DELETION_FAILURE", message);
  }
  if (req.session) {
    try {
      await new Promise<void>((resolve) => req.session!.destroy((error) => {
        if (error) deps.log(`Account deletion session destroy failed userId=${userId}`, "api");
        resolve();
      }));
    } catch {
      deps.log(`Account deletion session destroy failed userId=${userId}`, "api");
    }
  }
  return res.json({ message: "Account successfully deleted", timestamp: new Date().toISOString() });
}