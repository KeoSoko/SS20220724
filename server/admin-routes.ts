import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { 
  users, 
  receipts, 
  userSubscriptions, 
  billingEvents, 
  paymentTransactions,
  emailEvents
} from "@shared/schema";
import { and, eq, gte, lt, lte, sql, isNull, isNotNull, desc, or, ilike, count } from "drizzle-orm";
import { log } from "./vite";
import { billingService } from "./billing-service";
import { emailService } from "./email-service";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Forbidden - Admin access required" });
  }
  next();
}

export function registerAdminRoutes(app: Express) {
  
  // ========================================
  // SYSTEM HEALTH METRICS
  // ========================================
  app.get("/api/admin/command-center/health", requireAdmin, async (req, res) => {
    try {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalUsersResult,
        unverifiedUsersResult,
        stuckTrialUsersResult,
        failedSubscriptions24hResult,
        failedSubscriptions7dResult,
        failedWebhooks24hResult,
        azureFailuresResult,
        emailFailuresResult
      ] = await Promise.all([
        db.select({ count: count() }).from(users),
        db.select({ count: count() }).from(users).where(eq(users.isEmailVerified, false)),
        db.select({ count: count() })
          .from(users)
          .where(
            and(
              isNotNull(users.trialEndDate),
              lt(users.trialEndDate, thirtyDaysAgo)
            )
          ),
        db.select({ count: count() })
          .from(billingEvents)
          .where(
            and(
              eq(billingEvents.eventType, 'payment_failed'),
              gte(billingEvents.createdAt, twentyFourHoursAgo)
            )
          ),
        db.select({ count: count() })
          .from(billingEvents)
          .where(
            and(
              eq(billingEvents.eventType, 'payment_failed'),
              gte(billingEvents.createdAt, sevenDaysAgo)
            )
          ),
        db.select({ count: count() })
          .from(billingEvents)
          .where(
            and(
              or(
                eq(billingEvents.eventType, 'paystack_webhook_failed'),
                eq(billingEvents.eventType, 'paystack_webhook_failed_user_resolution')
              ),
              gte(billingEvents.createdAt, twentyFourHoursAgo)
            )
          ),
        db.select({ count: count() })
          .from(receipts)
          .where(
            and(
              sql`blob_url LIKE '/uploads/%'`,
              gte(receipts.createdAt, sevenDaysAgo)
            )
          ),
        db.select({ count: count() })
          .from(emailEvents)
          .where(
            and(
              or(
                eq(emailEvents.eventType, 'bounce'),
                eq(emailEvents.eventType, 'dropped'),
                eq(emailEvents.eventType, 'deferred')
              ),
              gte(emailEvents.createdAt, sevenDaysAgo)
            )
          )
      ]);

      res.json({
        totalUsers: totalUsersResult[0]?.count || 0,
        unverifiedUsers: unverifiedUsersResult[0]?.count || 0,
        stuckTrialUsers: stuckTrialUsersResult[0]?.count || 0,
        failedSubscriptions24h: failedSubscriptions24hResult[0]?.count || 0,
        failedSubscriptions7d: failedSubscriptions7dResult[0]?.count || 0,
        failedWebhooks24h: failedWebhooks24hResult[0]?.count || 0,
        azureFailures7d: azureFailuresResult[0]?.count || 0,
        emailFailures7d: emailFailuresResult[0]?.count || 0
      });
    } catch (error: any) {
      log(`Error in /api/admin/command-center/health: ${error.message}`, 'admin');
      res.status(500).json({ error: "Failed to get system health" });
    }
  });

  // ========================================
  // USER SEARCH WITH METRICS (supports text search OR filter)
  // ========================================
  app.get("/api/admin/users/search", requireAdmin, async (req, res) => {
    try {
      const query = (req.query.query as string)?.trim();
      const filter = (req.query.filter as string)?.trim();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;
      
      // Must have either query or filter
      if (!query && !filter) {
        return res.status(400).json({ error: "Search query or filter required" });
      }

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      let searchResults: Array<{
        id: number;
        email: string | null;
        username: string;
        createdAt: Date;
        lastLogin: Date | null;
        isEmailVerified: boolean | null;
        trialEndDate: Date | null;
      }>;
      let totalCount = 0;

      // Filter mode - predefined filters by health card type
      if (filter) {
        const validFilters = ['all', 'unverified', 'stuck_trials', 'failed_24h', 'failed_7d', 'webhooks_24h', 'azure_failures', 'email_failures'];
        if (!validFilters.includes(filter)) {
          return res.status(400).json({ error: `Invalid filter. Must be one of: ${validFilters.join(', ')}` });
        }

        switch (filter) {
          case 'all':
            // Get total count
            const allCountResult = await db.select({ count: count() }).from(users);
            totalCount = allCountResult[0]?.count || 0;
            
            searchResults = await db.select({
              id: users.id,
              email: users.email,
              username: users.username,
              createdAt: users.createdAt,
              lastLogin: users.lastLogin,
              isEmailVerified: users.isEmailVerified,
              trialEndDate: users.trialEndDate
            })
            .from(users)
            .orderBy(desc(users.createdAt))
            .limit(limit)
            .offset(offset);
            break;

          case 'unverified':
            // Get total count
            const unverifiedCountResult = await db.select({ count: count() }).from(users).where(eq(users.isEmailVerified, false));
            totalCount = unverifiedCountResult[0]?.count || 0;
            
            searchResults = await db.select({
              id: users.id,
              email: users.email,
              username: users.username,
              createdAt: users.createdAt,
              lastLogin: users.lastLogin,
              isEmailVerified: users.isEmailVerified,
              trialEndDate: users.trialEndDate
            })
            .from(users)
            .where(eq(users.isEmailVerified, false))
            .orderBy(desc(users.createdAt))
            .limit(limit)
            .offset(offset);
            break;

          case 'stuck_trials':
            // Get total count
            const stuckTrialsCountResult = await db.select({ count: count() }).from(users).where(
              and(
                isNotNull(users.trialEndDate),
                lt(users.trialEndDate, thirtyDaysAgo)
              )
            );
            totalCount = stuckTrialsCountResult[0]?.count || 0;
            
            searchResults = await db.select({
              id: users.id,
              email: users.email,
              username: users.username,
              createdAt: users.createdAt,
              lastLogin: users.lastLogin,
              isEmailVerified: users.isEmailVerified,
              trialEndDate: users.trialEndDate
            })
            .from(users)
            .where(
              and(
                isNotNull(users.trialEndDate),
                lt(users.trialEndDate, thirtyDaysAgo)
              )
            )
            .orderBy(desc(users.createdAt))
            .limit(limit)
            .offset(offset);
            break;

          case 'failed_24h':
            // Get all distinct user IDs with payment failures in last 24h
            const failed24hUserIds = await db.selectDistinct({ userId: billingEvents.userId })
              .from(billingEvents)
              .where(
                and(
                  eq(billingEvents.eventType, 'payment_failed'),
                  gte(billingEvents.createdAt, twentyFourHoursAgo)
                )
              );
            
            totalCount = failed24hUserIds.length;
            
            if (failed24hUserIds.length === 0) {
              searchResults = [];
            } else {
              searchResults = await db.select({
                id: users.id,
                email: users.email,
                username: users.username,
                createdAt: users.createdAt,
                lastLogin: users.lastLogin,
                isEmailVerified: users.isEmailVerified,
                trialEndDate: users.trialEndDate
              })
              .from(users)
              .where(sql`${users.id} IN (${sql.join(failed24hUserIds.map(u => sql`${u.userId}`), sql`, `)})`)
              .orderBy(desc(users.createdAt))
              .limit(limit)
              .offset(offset);
            }
            break;

          case 'failed_7d':
            // Get all distinct user IDs with payment failures in last 7 days
            const failed7dUserIds = await db.selectDistinct({ userId: billingEvents.userId })
              .from(billingEvents)
              .where(
                and(
                  eq(billingEvents.eventType, 'payment_failed'),
                  gte(billingEvents.createdAt, sevenDaysAgo)
                )
              );
            
            totalCount = failed7dUserIds.length;
            
            if (failed7dUserIds.length === 0) {
              searchResults = [];
            } else {
              searchResults = await db.select({
                id: users.id,
                email: users.email,
                username: users.username,
                createdAt: users.createdAt,
                lastLogin: users.lastLogin,
                isEmailVerified: users.isEmailVerified,
                trialEndDate: users.trialEndDate
              })
              .from(users)
              .where(sql`${users.id} IN (${sql.join(failed7dUserIds.map(u => sql`${u.userId}`), sql`, `)})`)
              .orderBy(desc(users.createdAt))
              .limit(limit)
              .offset(offset);
            }
            break;

          case 'webhooks_24h':
            // Get all distinct user IDs with webhook failures in last 24h
            const webhook24hUserIds = await db.selectDistinct({ userId: billingEvents.userId })
              .from(billingEvents)
              .where(
                and(
                  or(
                    eq(billingEvents.eventType, 'paystack_webhook_failed'),
                    eq(billingEvents.eventType, 'paystack_webhook_failed_user_resolution')
                  ),
                  gte(billingEvents.createdAt, twentyFourHoursAgo)
                )
              );
            
            totalCount = webhook24hUserIds.length;
            
            if (webhook24hUserIds.length === 0) {
              searchResults = [];
            } else {
              searchResults = await db.select({
                id: users.id,
                email: users.email,
                username: users.username,
                createdAt: users.createdAt,
                lastLogin: users.lastLogin,
                isEmailVerified: users.isEmailVerified,
                trialEndDate: users.trialEndDate
              })
              .from(users)
              .where(sql`${users.id} IN (${sql.join(webhook24hUserIds.map(u => sql`${u.userId}`), sql`, `)})`)
              .orderBy(desc(users.createdAt))
              .limit(limit)
              .offset(offset);
            }
            break;

          case 'azure_failures':
            // Get all distinct user IDs with Azure upload failures
            const azureFailUserIds = await db.selectDistinct({ userId: receipts.userId })
              .from(receipts)
              .where(sql`blob_url LIKE '/uploads/%'`);
            
            totalCount = azureFailUserIds.length;
            
            if (azureFailUserIds.length === 0) {
              searchResults = [];
            } else {
              searchResults = await db.select({
                id: users.id,
                email: users.email,
                username: users.username,
                createdAt: users.createdAt,
                lastLogin: users.lastLogin,
                isEmailVerified: users.isEmailVerified,
                trialEndDate: users.trialEndDate
              })
              .from(users)
              .where(sql`${users.id} IN (${sql.join(azureFailUserIds.map(u => sql`${u.userId}`), sql`, `)})`)
              .orderBy(desc(users.createdAt))
              .limit(limit)
              .offset(offset);
            }
            break;

          case 'email_failures':
            // Get all distinct user IDs with email delivery failures in last 7 days
            const emailFailUserIds = await db.selectDistinct({ userId: emailEvents.userId })
              .from(emailEvents)
              .where(
                and(
                  or(
                    eq(emailEvents.eventType, 'bounce'),
                    eq(emailEvents.eventType, 'dropped'),
                    eq(emailEvents.eventType, 'deferred')
                  ),
                  gte(emailEvents.createdAt, sevenDaysAgo)
                )
              );
            
            totalCount = emailFailUserIds.length;
            
            if (emailFailUserIds.length === 0) {
              searchResults = [];
            } else {
              searchResults = await db.select({
                id: users.id,
                email: users.email,
                username: users.username,
                createdAt: users.createdAt,
                lastLogin: users.lastLogin,
                isEmailVerified: users.isEmailVerified,
                trialEndDate: users.trialEndDate
              })
              .from(users)
              .where(sql`${users.id} IN (${sql.join(emailFailUserIds.map(u => sql`${u.userId}`), sql`, `)})`)
              .orderBy(desc(users.createdAt))
              .limit(limit)
              .offset(offset);
            }
            break;

          default:
            searchResults = [];
        }
      } else {
        // Text search mode - get count first
        const searchCountResult = await db.select({ count: count() })
          .from(users)
          .where(
            or(
              ilike(users.email, `%${query}%`),
              ilike(users.username, `%${query}%`),
              sql`CAST(${users.id} AS TEXT) = ${query}`
            )
          );
        totalCount = searchCountResult[0]?.count || 0;
        
        searchResults = await db.select({
          id: users.id,
          email: users.email,
          username: users.username,
          createdAt: users.createdAt,
          lastLogin: users.lastLogin,
          isEmailVerified: users.isEmailVerified,
          trialEndDate: users.trialEndDate
        })
        .from(users)
        .where(
          or(
            ilike(users.email, `%${query}%`),
            ilike(users.username, `%${query}%`),
            sql`CAST(${users.id} AS TEXT) = ${query}`
          )
        )
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);
      }

      // Enrich results with subscription and usage data
      const results = await Promise.all(searchResults.map(async (user) => {
        const [subscription, totalReceipts, recentReceipts] = await Promise.all([
          db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, user.id)).limit(1),
          db.select({ count: count() }).from(receipts).where(eq(receipts.userId, user.id)),
          db.select({ count: count() }).from(receipts).where(
            and(
              eq(receipts.userId, user.id),
              gte(receipts.createdAt, thirtyDaysAgo)
            )
          )
        ]);

        const sub = subscription[0];
        
        const lastReceipt = await db.select({ createdAt: receipts.createdAt })
          .from(receipts)
          .where(eq(receipts.userId, user.id))
          .orderBy(desc(receipts.createdAt))
          .limit(1);

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          isEmailVerified: user.isEmailVerified,
          subscription: sub ? {
            status: sub.status,
            trialEndDate: sub.trialEndDate,
            nextBillingDate: sub.nextBillingDate
          } : {
            status: user.trialEndDate ? 'trial' : 'none',
            trialEndDate: user.trialEndDate,
            nextBillingDate: null
          },
          usage: {
            totalReceipts: totalReceipts[0]?.count || 0,
            receiptsLast30Days: recentReceipts[0]?.count || 0,
            lastReceiptAt: lastReceipt[0]?.createdAt || null,
            loginCount: 0
          }
        };
      }));

      res.json({
        users: results,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      });
    } catch (error: any) {
      log(`Error in /api/admin/users/search: ${error.message}`, 'admin');
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  // ========================================
  // USER DETAIL (DEEP DIVE)
  // ========================================
  app.get("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        subscription,
        totalReceiptsResult,
        recentReceipts7dResult,
        recentReceipts30dResult,
        azureFailuresResult,
        recentBillingEvents,
        recentPayments,
        lastReceipt,
        recentEmailEvents
      ] = await Promise.all([
        db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1),
        db.select({ count: count() }).from(receipts).where(eq(receipts.userId, userId)),
        db.select({ count: count() }).from(receipts).where(
          and(eq(receipts.userId, userId), gte(receipts.createdAt, sevenDaysAgo))
        ),
        db.select({ count: count() }).from(receipts).where(
          and(eq(receipts.userId, userId), gte(receipts.createdAt, thirtyDaysAgo))
        ),
        db.select({ count: count() }).from(receipts).where(
          and(eq(receipts.userId, userId), sql`blob_url LIKE '/uploads/%'`)
        ),
        db.select().from(billingEvents).where(eq(billingEvents.userId, userId)).orderBy(desc(billingEvents.createdAt)).limit(20),
        db.select().from(paymentTransactions).where(eq(paymentTransactions.userId, userId)).orderBy(desc(paymentTransactions.createdAt)).limit(10),
        db.select({ createdAt: receipts.createdAt }).from(receipts).where(eq(receipts.userId, userId)).orderBy(desc(receipts.createdAt)).limit(1),
        db.select().from(emailEvents).where(eq(emailEvents.userId, userId)).orderBy(desc(emailEvents.createdAt)).limit(20)
      ]);

      const sub = subscription[0];

      const lastDeliveredEmail = recentEmailEvents.find(e => e.eventType === 'delivered');
      const lastFailedEmail = recentEmailEvents.find(e => 
        e.eventType === 'bounce' || e.eventType === 'dropped' || e.eventType === 'deferred'
      );
      const lastEmailEvent = recentEmailEvents[0];

      let emailHealthStatus: 'healthy' | 'warning' | 'failed' = 'healthy';
      if (lastFailedEmail && lastDeliveredEmail) {
        const failedTime = new Date(lastFailedEmail.createdAt).getTime();
        const deliveredTime = new Date(lastDeliveredEmail.createdAt).getTime();
        emailHealthStatus = failedTime > deliveredTime ? 'failed' : 'warning';
      } else if (lastFailedEmail && !lastDeliveredEmail) {
        emailHealthStatus = 'failed';
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.fullName,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          isEmailVerified: user.isEmailVerified,
          trialEndDate: user.trialEndDate
        },
        subscription: sub ? {
          id: sub.id,
          status: sub.status,
          planId: sub.planId,
          trialStartDate: sub.trialStartDate,
          trialEndDate: sub.trialEndDate,
          trialRestartedAt: sub.trialRestartedAt,
          subscriptionStartDate: sub.subscriptionStartDate,
          nextBillingDate: sub.nextBillingDate,
          cancelledAt: sub.cancelledAt,
          paystackReference: sub.paystackReference,
          totalPaid: sub.totalPaid,
          lastPaymentDate: sub.lastPaymentDate
        } : null,
        usage: {
          totalReceipts: totalReceiptsResult[0]?.count || 0,
          receiptsLast7Days: recentReceipts7dResult[0]?.count || 0,
          receiptsLast30Days: recentReceipts30dResult[0]?.count || 0,
          azureUploadFailures: azureFailuresResult[0]?.count || 0,
          lastReceiptAt: lastReceipt[0]?.createdAt || null
        },
        emailHealth: {
          status: emailHealthStatus,
          lastEmailSent: lastEmailEvent ? {
            type: lastEmailEvent.emailType,
            status: lastEmailEvent.eventType,
            at: lastEmailEvent.createdAt
          } : null,
          lastDelivered: lastDeliveredEmail ? {
            at: lastDeliveredEmail.createdAt
          } : null,
          lastFailed: lastFailedEmail ? {
            type: lastFailedEmail.eventType,
            reason: lastFailedEmail.bounceReason || lastFailedEmail.smtpResponse,
            at: lastFailedEmail.createdAt
          } : null,
          recentEvents: recentEmailEvents.slice(0, 5).map(e => ({
            id: e.id,
            eventType: e.eventType,
            emailType: e.emailType,
            bounceReason: e.bounceReason,
            createdAt: e.createdAt
          }))
        },
        billingEvents: recentBillingEvents.map(e => ({
          id: e.id,
          eventType: e.eventType,
          eventData: e.eventData,
          processed: e.processed,
          processingError: e.processingError,
          createdAt: e.createdAt
        })),
        paymentTransactions: recentPayments.map(p => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          platform: p.platform,
          description: p.description,
          failureReason: p.failureReason,
          createdAt: p.createdAt
        }))
      });
    } catch (error: any) {
      log(`Error in /api/admin/users/:userId: ${error.message}`, 'admin');
      res.status(500).json({ error: "Failed to get user details" });
    }
  });

  // ========================================
  // ADMIN RECOVERY ACTIONS
  // ========================================
  app.post("/api/admin/users/:userId/actions", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { action, reason } = req.body;
      const adminUserId = req.user!.id;

      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const validActions = ['verify_email', 'resend_verification_email', 'restart_trial', 'activate_subscription', 'cancel_subscription', 'reconcile_payment'];
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let result: { success: boolean; message: string } = { success: false, message: "" };

      switch (action) {
        case 'verify_email':
          await db.update(users)
            .set({ 
              isEmailVerified: true, 
              emailVerifiedAt: new Date(),
              emailVerificationToken: null
            })
            .where(eq(users.id, userId));
          result = { success: true, message: "Email verified successfully" };
          break;

        case 'resend_verification_email':
          if (!user.email) {
            return res.status(400).json({ error: "User has no email address" });
          }
          if (user.isEmailVerified) {
            return res.status(400).json({ error: "User email is already verified" });
          }
          const token = user.emailVerificationToken || require('crypto').randomBytes(32).toString('hex');
          if (!user.emailVerificationToken) {
            await db.update(users)
              .set({ emailVerificationToken: token })
              .where(eq(users.id, userId));
          }
          await emailService.sendEmailVerification(user.email, user.username, token);
          await db.update(users)
            .set({ verificationEmailResentAt: new Date() })
            .where(eq(users.id, userId));
          result = { success: true, message: "Verification email resent" };
          break;

        case 'restart_trial':
          const newTrialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          const existingSub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1);
          
          if (existingSub.length > 0) {
            await db.update(userSubscriptions)
              .set({ 
                status: 'trial',
                trialEndDate: newTrialEnd,
                trialRestartedAt: new Date()
              })
              .where(eq(userSubscriptions.userId, userId));
          } else {
            await db.insert(userSubscriptions).values({
              userId,
              planId: 1,
              status: 'trial',
              trialStartDate: new Date(),
              trialEndDate: newTrialEnd
            });
          }
          await db.update(users)
            .set({ trialEndDate: newTrialEnd })
            .where(eq(users.id, userId));
          result = { success: true, message: `Trial restarted, ends ${newTrialEnd.toDateString()}` };
          break;

        case 'activate_subscription':
          const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          const existingSubAct = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1);
          
          if (existingSubAct.length > 0) {
            await db.update(userSubscriptions)
              .set({ 
                status: 'active',
                subscriptionStartDate: new Date(),
                nextBillingDate: nextBilling
              })
              .where(eq(userSubscriptions.userId, userId));
          } else {
            await db.insert(userSubscriptions).values({
              userId,
              planId: 2,
              status: 'active',
              subscriptionStartDate: new Date(),
              nextBillingDate: nextBilling
            });
          }
          result = { success: true, message: "Subscription activated" };
          break;

        case 'cancel_subscription':
          await db.update(userSubscriptions)
            .set({ 
              status: 'cancelled',
              cancelledAt: new Date()
            })
            .where(eq(userSubscriptions.userId, userId));
          result = { success: true, message: "Subscription cancelled" };
          break;

        case 'reconcile_payment':
          const { reference } = req.body;
          if (!reference) {
            return res.status(400).json({ error: "Payment reference required for reconciliation" });
          }
          const verification = await billingService.verifyPaystackTransaction(reference);
          if (!verification.valid) {
            return res.status(400).json({ error: `Payment verification failed: ${verification.error}` });
          }
          await billingService.processPaystackSubscription(userId, reference);
          result = { success: true, message: "Payment reconciled and subscription activated" };
          break;
      }

      await billingService.recordBillingEvent(userId, `admin_action_${action}`, {
        adminUserId,
        reason: reason || 'No reason provided',
        timestamp: new Date().toISOString()
      });

      log(`[ADMIN_ACTION] User ${adminUserId} performed ${action} on user ${userId}: ${result.message}`, 'admin');
      res.json(result);
    } catch (error: any) {
      log(`Error in /api/admin/users/:userId/actions: ${error.message}`, 'admin');
      res.status(500).json({ error: "Failed to perform action" });
    }
  });

  // ========================================
  // SEND RECOVERY EMAIL
  // ========================================
  app.post("/api/admin/users/:userId/send-recovery-email", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const adminUserId = req.user!.id;

      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.email) {
        return res.status(400).json({ error: "User has no email address" });
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentRecoveryEmails = await db.select()
        .from(billingEvents)
        .where(
          and(
            eq(billingEvents.userId, userId),
            eq(billingEvents.eventType, 'admin_recovery_email_sent'),
            gte(billingEvents.createdAt, sevenDaysAgo)
          )
        )
        .limit(1);

      if (recentRecoveryEmails.length > 0) {
        const lastSent = recentRecoveryEmails[0].createdAt;
        return res.status(400).json({ 
          error: "Recovery email already sent within the last 7 days",
          lastSentAt: lastSent
        });
      }

      const success = await emailService.sendTrialRecoveryEmail(user.email, user.username);

      if (!success) {
        return res.status(500).json({ error: "Failed to send recovery email" });
      }

      await db.insert(billingEvents).values({
        userId,
        eventType: 'admin_recovery_email_sent',
        eventData: {
          adminUserId,
          reason: 'trial_recovery',
          timestamp: new Date().toISOString(),
          recipientEmail: user.email
        }
      });

      log(`[ADMIN_ACTION] User ${adminUserId} sent recovery email to user ${userId} (${user.email})`, 'admin');
      res.json({ 
        success: true, 
        message: `Recovery email sent to ${user.email}` 
      });
    } catch (error: any) {
      log(`Error in /api/admin/users/:userId/send-recovery-email: ${error.message}`, 'admin');
      res.status(500).json({ error: "Failed to send recovery email" });
    }
  });

  // ========================================
  // EMAIL PREVIEW (READ-ONLY - NO SENDING)
  // ========================================
  app.post("/api/admin/email/preview", requireAdmin, async (req, res) => {
    try {
      const { template, userId } = req.body;
      
      const validTemplates = ['trial_recovery', 'verification', 'payment_failed'];
      if (!validTemplates.includes(template)) {
        return res.status(400).json({ error: `Invalid template. Must be one of: ${validTemplates.join(', ')}` });
      }

      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const preview = emailService.getEmailPreview(template, {
        email: user.email,
        username: user.username,
        trialEndDate: user.trialEndDate
      });

      res.json(preview);
    } catch (error: any) {
      log(`Error in /api/admin/email/preview: ${error.message}`, 'admin');
      res.status(500).json({ error: "Failed to generate email preview" });
    }
  });

  // ========================================
  // AI USER DIAGNOSIS
  // ========================================
  app.post("/api/admin/ai/analyze-user", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        subscription,
        totalReceiptsResult,
        recentReceipts,
        azureFailures,
        recentBillingEvents,
        recentPayments
      ] = await Promise.all([
        db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1),
        db.select({ count: count() }).from(receipts).where(eq(receipts.userId, userId)),
        db.select({ count: count() }).from(receipts).where(
          and(eq(receipts.userId, userId), gte(receipts.createdAt, sevenDaysAgo))
        ),
        db.select({ count: count() }).from(receipts).where(
          and(eq(receipts.userId, userId), sql`blob_url LIKE '/uploads/%'`)
        ),
        db.select().from(billingEvents).where(eq(billingEvents.userId, userId)).orderBy(desc(billingEvents.createdAt)).limit(20),
        db.select().from(paymentTransactions).where(eq(paymentTransactions.userId, userId)).orderBy(desc(paymentTransactions.createdAt)).limit(10)
      ]);

      const sub = subscription[0];

      const userContext = {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          isEmailVerified: user.isEmailVerified,
          daysInactive: user.lastLogin 
            ? Math.floor((Date.now() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60 * 24))
            : null
        },
        subscription: sub ? {
          status: sub.status,
          trialEndDate: sub.trialEndDate,
          nextBillingDate: sub.nextBillingDate,
          totalPaid: sub.totalPaid,
          lastPaymentDate: sub.lastPaymentDate
        } : null,
        usage: {
          totalReceipts: totalReceiptsResult[0]?.count || 0,
          recentReceipts: recentReceipts[0]?.count || 0,
          azureUploadFailures: azureFailures[0]?.count || 0
        },
        billingEvents: recentBillingEvents.slice(0, 10).map(e => ({
          type: e.eventType,
          data: e.eventData,
          error: e.processingError,
          createdAt: e.createdAt
        })),
        paymentTransactions: recentPayments.slice(0, 5).map(p => ({
          amount: p.amount,
          status: p.status,
          failureReason: p.failureReason,
          createdAt: p.createdAt
        }))
      };

      const prompt = `You are an admin support AI for Simple Slips, a receipt management app. Analyze this user's data and provide a diagnosis.

USER DATA:
${JSON.stringify(userContext, null, 2)}

Provide a JSON response with:
1. diagnosis: A brief summary of the user's situation
2. rootCause: What is the main issue affecting this user (if any)
3. riskLevel: "low", "medium", or "high" based on churn risk
4. recommendedActions: Array of actions to take, each with:
   - action: One of "verify_email", "resend_verification_email", "restart_trial", "activate_subscription", "cancel_subscription", "reconcile_payment", or "no_action"
   - reason: Why this action is recommended
5. confidence: "high", "medium", or "low"

Focus on:
- Is the user stuck in onboarding (unverified email)?
- Have they used the product (uploaded receipts)?
- Are there Azure upload failures indicating technical issues?
- Is their subscription/trial in a problematic state?
- Are there failed payments that need reconciliation?

Respond ONLY with valid JSON.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(completion.choices[0].message.content || '{}');
      res.json(analysis);
    } catch (error: any) {
      log(`Error in /api/admin/ai/analyze-user: ${error.message}`, 'admin');
      res.status(500).json({ error: "Failed to analyze user" });
    }
  });

  // ========================================
  // AI EVENT TIMELINE SUMMARY
  // ========================================
  app.post("/api/admin/ai/summarize-events", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      const [billingEventsData, paymentsData] = await Promise.all([
        db.select().from(billingEvents).where(eq(billingEvents.userId, userId)).orderBy(desc(billingEvents.createdAt)).limit(30),
        db.select().from(paymentTransactions).where(eq(paymentTransactions.userId, userId)).orderBy(desc(paymentTransactions.createdAt)).limit(20)
      ]);

      const timelineData = {
        billingEvents: billingEventsData.map(e => ({
          type: e.eventType,
          data: e.eventData,
          error: e.processingError,
          createdAt: e.createdAt
        })),
        payments: paymentsData.map(p => ({
          amount: p.amount,
          status: p.status,
          platform: p.platform,
          failureReason: p.failureReason,
          createdAt: p.createdAt
        }))
      };

      const prompt = `Summarize this user's billing and payment timeline for an admin operator.

TIMELINE DATA:
${JSON.stringify(timelineData, null, 2)}

Provide a JSON response with:
1. summary: A chronological narrative of what happened (2-4 sentences)
2. failures: List of any failures or errors that occurred
3. currentState: The user's current billing/subscription state
4. needsAttention: Boolean - does this need admin intervention?

Respond ONLY with valid JSON.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const summary = JSON.parse(completion.choices[0].message.content || '{}');
      res.json(summary);
    } catch (error: any) {
      log(`Error in /api/admin/ai/summarize-events: ${error.message}`, 'admin');
      res.status(500).json({ error: "Failed to summarize events" });
    }
  });
}
