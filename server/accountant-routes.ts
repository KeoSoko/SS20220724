import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { accountantReportAccess as grants, workspaces } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { emailService } from "./email-service";
import { exportService } from "./export-service";
import { buildPublicAppUrl } from "./public-app-origin";
import { getSubscriptionStatus } from "./subscription-middleware";

const ownerPath = "/api/user/accountant-access";
const guestPath = "/api/export/accountant-reports";
const minute = 60_000;
const uuid = z.string().uuid();
const secret = z.string().regex(/^[a-f0-9]{64}$/);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const newSecret = () => randomBytes(32).toString("hex");
const active = (id: string) => and(eq(grants.id, id), isNull(grants.revokedAt), gt(grants.expiresAt, new Date()));

async function hasPremium(ownerId: number) {
  const status = await getSubscriptionStatus(ownerId);
  return status.hasActiveSubscription && status.subscriptionType === "premium";
}

async function sendLink(grant: typeof grants.$inferSelect, token: string) {
  const link = buildPublicAppUrl(`/accountant-reports/${grant.id}#${token}`);
  return emailService.sendEmail(grant.email, "Your Simple Slips accountant access",
    `Open your shared ${grant.year} tax report: ${link}\n\nThis sign-in link is valid for 15 minutes and can be used once.`,
    `<p><a href="${link}">Open your shared ${grant.year} tax report</a></p><p>This sign-in link is valid for 15 minutes and can be used once.</p>`, false);
}

export function registerAccountantRoutes(
  app: Express,
  verifyEmail: RequestHandler,
  requireOwner: RequestHandler,
  getUserId: (req: Parameters<RequestHandler>[0]) => number,
) {
  const route = (handler: RequestHandler): RequestHandler => (req, res, next) => {
    res.set("Cache-Control", "no-store");
    Promise.resolve().then(() => handler(req, res, next)).catch(next);
  };
  const limit = rateLimit({ windowMs: 15 * minute, max: 30, standardHeaders: true, legacyHeaders: false });
  const workspaceForOwner = async (userId: number) => {
    const user = await storage.getUser(userId);
    if (!user) return;
    const [workspace] = await db.select().from(workspaces)
      .where(and(eq(workspaces.id, user.workspaceId), eq(workspaces.ownerId, userId)));
    return workspace;
  };

  app.get(ownerPath, verifyEmail, requireOwner, route(async (req, res) => {
    const workspace = await workspaceForOwner(getUserId(req));
    if (!workspace) return res.sendStatus(403);
    const invitations = await db.select({
      id: grants.id, email: grants.email, year: grants.year, expiresAt: grants.expiresAt,
      acceptedAt: grants.acceptedAt, revokedAt: grants.revokedAt,
    }).from(grants).where(eq(grants.workspaceId, workspace.id));
    res.json({ premium: await hasPremium(workspace.ownerId), invitations });
  }));

  app.post(ownerPath, verifyEmail, requireOwner, limit, route(async (req, res) => {
    const input = z.object({
      email: z.string().trim().email().max(254).transform(email => email.toLowerCase()),
      year: z.number().int().min(1900).max(new Date().getFullYear()),
      days: z.number().int().min(1).max(90).default(30),
    }).safeParse(req.body);
    if (!input.success) return res.status(400).json({ message: "Enter a valid email, report year and access duration (1–90 days)." });
    const workspace = await workspaceForOwner(getUserId(req));
    if (!workspace || !await hasPremium(workspace.ownerId)) return res.sendStatus(403);
    const token = newSecret();
    const { days, ...details } = input.data;
    const [grant] = await db.insert(grants).values({
      ...details, id: randomUUID(), workspaceId: workspace.id,
      expiresAt: new Date(Date.now() + days * 1440 * minute),
      tokenHash: digest(token), tokenExpiresAt: new Date(Date.now() + 15 * minute),
    }).returning();
    if (!await sendLink(grant, token).catch(() => false)) {
      await db.update(grants).set({ revokedAt: new Date(), tokenHash: null }).where(eq(grants.id, grant.id));
      return res.status(502).json({ message: "The invitation email could not be sent." });
    }
    res.status(201).json({ id: grant.id });
  }));

  app.delete(`${ownerPath}/:id`, verifyEmail, requireOwner, route(async (req, res) => {
    const workspace = await workspaceForOwner(getUserId(req));
    if (!workspace) return res.sendStatus(403);
    const id = uuid.safeParse(req.params.id);
    if (!id.success) return res.sendStatus(404);
    const [revoked] = await db.update(grants).set({ revokedAt: new Date(), tokenHash: null, sessionHash: null })
      .where(and(eq(grants.id, id.data), eq(grants.workspaceId, workspace.id), isNull(grants.revokedAt)))
      .returning({ id: grants.id });
    res.sendStatus(revoked ? 204 : 404);
  }));

  async function getGrant(id: unknown) {
    const parsed = uuid.safeParse(id);
    if (!parsed.success) return;
    const [entry] = await db.select({ grant: grants, workspace: workspaces }).from(grants)
      .innerJoin(workspaces, eq(grants.workspaceId, workspaces.id)).where(active(parsed.data));
    if (entry && await hasPremium(entry.workspace.ownerId)) return entry;
  }

  app.post(`${guestPath}/:id/link`, limit, route(async (req, res) => {
    if (!req.is("application/json")) return res.sendStatus(415);
    const entry = await getGrant(req.params.id);
    if (entry) {
      const token = newSecret();
      const [grant] = await db.update(grants)
        .set({ tokenHash: digest(token), tokenExpiresAt: new Date(Date.now() + 15 * minute) })
        .where(and(active(entry.grant.id),
          or(isNull(grants.tokenExpiresAt), lt(grants.tokenExpiresAt, new Date(Date.now() + 14 * minute)))))
        .returning();
      if (grant) await sendLink(grant, token).catch(() => false);
    }
    res.sendStatus(204);
  }));

  app.post(`${guestPath}/:id/session`, limit, route(async (req, res) => {
    const token = secret.safeParse(req.body?.token);
    if (!token.success) return res.sendStatus(400);
    const entry = await getGrant(req.params.id);
    if (!entry) return res.sendStatus(403);
    const session = newSecret();
    const [grant] = await db.update(grants).set({
      tokenHash: null, acceptedAt: entry.grant.acceptedAt ?? new Date(), sessionHash: digest(session),
    }).where(and(active(entry.grant.id), eq(grants.tokenHash, digest(token.data)),
      gt(grants.tokenExpiresAt, new Date()))).returning();
    if (!grant) return res.sendStatus(403);
    res.cookie("accountant_report", session, {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
      path: `${guestPath}/${grant.id}`, expires: grant.expiresAt,
    }).sendStatus(204);
  }));

  app.get([`${guestPath}/:id`, `${guestPath}/:id/pdf`], route(async (req, res) => {
    const session = req.headers.cookie?.match(/(?:^|;\s*)accountant_report=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (!session) return res.sendStatus(401);
    const entry = await getGrant(req.params.id);
    if (!entry || entry.grant.sessionHash !== digest(session)) return res.sendStatus(403);
    const { grant, workspace } = entry;
    if (!req.path.endsWith("/pdf")) return res.json({ workspace: workspace.name, year: grant.year });
    const report = await exportService.generateTaxReport(workspace.ownerId, grant.year, { workspaceId: workspace.id });
    const current = await getGrant(grant.id);
    if (current?.grant.sessionHash !== digest(session) || current.workspace.ownerId !== workspace.ownerId) {
      return res.sendStatus(403);
    }
    res.type("pdf").set("Content-Disposition",
      `${req.query.download === "1" ? "attachment" : "inline"}; filename="tax-report-${grant.year}.pdf"`).send(report.pdf);
  }));
}
