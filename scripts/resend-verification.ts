import { db } from '../server/db';
import { users, billingEvents } from '../shared/schema';
import { eq, and, lt, isNull, isNotNull } from 'drizzle-orm';
import { EmailService } from '../server/email-service';

async function resendVerificationEmails() {
  const beforeDate = new Date('2026-01-23');
  const coolOffTime = new Date(Date.now() - 15 * 60 * 1000);
  
  console.log('[RESEND] Starting verification email resend...');
  console.log('[RESEND] beforeDate:', beforeDate.toISOString());
  console.log('[RESEND] coolOffTime:', coolOffTime.toISOString());

  const eligibleUsers = await db.select({
    id: users.id,
    email: users.email,
    username: users.username,
    emailVerificationToken: users.emailVerificationToken,
    createdAt: users.createdAt
  })
  .from(users)
  .where(
    and(
      eq(users.isEmailVerified, false),
      isNotNull(users.emailVerificationToken),
      isNull(users.verificationEmailResentAt),
      lt(users.createdAt, coolOffTime),
      lt(users.createdAt, beforeDate)
    )
  )
  .limit(100);

  console.log(`[RESEND] Found ${eligibleUsers.length} eligible users`);

  const emailService = new EmailService();
  let successCount = 0;
  let failCount = 0;

  for (const user of eligibleUsers) {
    const freshUser = await db.select({
      verificationEmailResentAt: users.verificationEmailResentAt,
      emailVerificationToken: users.emailVerificationToken,
      isEmailVerified: users.isEmailVerified
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

    if (!freshUser[0] || 
        freshUser[0].verificationEmailResentAt !== null || 
        freshUser[0].isEmailVerified === true ||
        !freshUser[0].emailVerificationToken) {
      console.log(`[RESEND] Skipping user ${user.id} - state changed`);
      failCount++;
      continue;
    }

    try {
      const emailSent = await emailService.sendEmailVerification(
        user.email!,
        user.username,
        user.emailVerificationToken!
      );

      if (emailSent) {
        await db.update(users)
          .set({ verificationEmailResentAt: new Date() })
          .where(eq(users.id, user.id));

        await db.insert(billingEvents).values({
          userId: user.id,
          eventType: 'verification_email_resent',
          eventData: {
            email: user.email,
            resentAt: new Date().toISOString(),
            adminTriggered: true
          },
          processed: true
        });

        console.log(`[RESEND] ✓ Sent to user ${user.id} (${user.email})`);
        successCount++;
      } else {
        console.log(`[RESEND] ✗ Failed for user ${user.id} (${user.email})`);
        failCount++;
      }
    } catch (error: any) {
      console.log(`[RESEND] ✗ Error for user ${user.id}: ${error.message}`);
      failCount++;
    }
  }

  console.log(`[RESEND] Complete: ${successCount} sent, ${failCount} failed`);
  process.exit(0);
}

resendVerificationEmails().catch(err => {
  console.error('[RESEND] Fatal error:', err);
  process.exit(1);
});
