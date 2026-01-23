import { db } from '../server/db';
import { users, billingEvents } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { EmailService } from '../server/email-service';

async function resendSingle() {
  const userId = 150;
  const email = 'adriaan@nyltaxidermy.com';
  const username = 'adriaan@nyltaxidermy.com';
  const token = '91fbbeca572bbc3759e0c8e96c3df0a3bd09c3b7f87de66588c32b804db37bec';
  
  console.log('[RESEND] Sending verification to adriaan@nyltaxidermy.com...');
  
  const emailService = new EmailService();
  const sent = await emailService.sendEmailVerification(email, username, token);
  
  if (sent) {
    await db.update(users).set({ verificationEmailResentAt: new Date() }).where(eq(users.id, userId));
    await db.insert(billingEvents).values({
      userId,
      eventType: 'verification_email_resent',
      eventData: { email, resentAt: new Date().toISOString(), adminTriggered: true },
      processed: true
    });
    console.log('[RESEND] ✓ Sent verification email to adriaan@nyltaxidermy.com');
  } else {
    console.log('[RESEND] ✗ Failed to send');
  }
  process.exit(0);
}
resendSingle().catch(e => { console.error(e); process.exit(1); });
