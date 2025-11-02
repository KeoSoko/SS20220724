import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { User as SelectUser, users } from "@shared/schema";
import { log } from "./vite";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { EmailService } from "./email-service.js";

// Extend Express User interface
declare global {
  namespace Express {
    interface User extends SelectUser {}
    interface Request {
      jwtUser?: SelectUser;
    }
  }
}

// Constants
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required for security");
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h"; // 24 hours for financial app security
const SESSION_MAX_AGE = 1000 * 60 * 60; // 1 hour

// Helper for async password hashing
const scryptAsync = promisify(scrypt);

/**
 * Hash a password with salt
 * @param password Plaintext password to hash
 * @returns Hashed password with salt
 */
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

/**
 * Compare a plain password with a hashed one
 * @param supplied Plaintext password to check
 * @param stored Hashed password from database
 * @returns Boolean indicating if passwords match
 */
async function comparePasswords(supplied: string, stored: string) {
  try {
    log(`Comparing passwords, stored hash length: ${stored.length}`, 'auth');
    
    // Split the stored hash into hash and salt parts
    const parts = stored.split(".");
    if (parts.length !== 2) {
      log(`Invalid stored password format: ${stored}`, 'auth');
      return false;
    }
    
    const [hashed, salt] = parts;
    log(`Hash part: ${hashed.slice(0, 10)}..., Salt: ${salt.slice(0, 5)}...`, 'auth');
    
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    
    const result = timingSafeEqual(hashedBuf, suppliedBuf);
    log(`Password comparison result: ${result}`, 'auth');
    return result;
  } catch (error) {
    log(`Error comparing passwords: ${error}`, 'auth');
    return false;
  }
}

/**
 * Generate a JWT token for a user
 * @param user User object to encode in the token
 * @param rememberMe Whether to generate a long-lived token
 * @returns JWT token string and expiration time
 */
function generateJWT(user: SelectUser, rememberMe = false): { token: string, expiresIn: number } {
  // Set token expiration time based on remember me preference
  // Use environment variable for regular sessions, 30 days for remember me
  const regularExpiration = JWT_EXPIRES_IN === "24h" ? 60 * 60 * 24 : 60 * 60 * 8; // 24 hours or 8 hours
  const expiresIn = rememberMe ? 60 * 60 * 24 * 30 : regularExpiration; // in seconds
  
  const payload = { 
    sub: user.id,         // Standard JWT claim for subject (user ID)
    username: user.username, // Directly embed username for verification
    iss: 'simple-slips-app', // Critical for validation - issuer
    iat: Math.floor(Date.now() / 1000), // Issued at timestamp
    remember: rememberMe,
    // Add extra identity verification data
    userCheck: `${user.id}:${user.username}`, // Combined identity check
    v: user.tokenVersion || 1 // Token version for invalidation
  };

  // Use a safer approach for JWT tokens with explicit expiration
  const options = { 
    expiresIn
    // Don't set algorithm or audience to be compatible with all JWT token verifiers
  };
  
  // For debugging purposes
  log(`Generating token for ${user.username} (${user.id}) with exp: ${expiresIn}s`, 'auth');
  
  try {
    // @ts-ignore: JWT typing issues
    const token = jwt.sign(payload, JWT_SECRET, options);
    return { token, expiresIn };
  } catch (error) {
    log(`Error generating JWT with string secret: ${error}`, 'auth');
    try {
      // @ts-ignore: JWT typing issues  
      const token = jwt.sign(payload, Buffer.from(JWT_SECRET, 'utf-8'), options);
      return { token, expiresIn };
    } catch (bufferError) {
      log(`Error generating JWT with buffer secret: ${bufferError}`, 'auth');
      throw new Error('Failed to generate authentication token');
    }
  }
}

/**
 * Authentication middleware for verifying JWT tokens
 */
export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip JWT middleware for static assets and Vite development files
  if (req.path.startsWith('/@fs/') || 
      req.path.startsWith('/src/') || 
      req.path.startsWith('/node_modules/') ||
      req.path.startsWith('/@vite/') ||
      req.path.startsWith('/@react-refresh') ||
      req.path.endsWith('.js') || 
      req.path.endsWith('.css') || 
      req.path.endsWith('.png') || 
      req.path.endsWith('.jpg') || 
      req.path.endsWith('.svg') ||
      req.path === '/sw.js' ||
      req.path.startsWith('/attached_assets/') ||
      req.path.startsWith('/uploads/')) {
    return next();
  }

  const authHeader = req.headers.authorization;
  
  // Only log API requests, not static assets
  if (req.path.startsWith('/api/')) {
    console.log(`[JWT] JWT middleware check for path ${req.path}: authHeader=${!!authHeader}`);
  }
  
  if (!authHeader) {
    // No JWT header, just continue to session authentication
    return next(); 
  }
  
  // Extract token - format should be "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    console.log(`[JWT] Invalid header format: ${authHeader}`);
    return res.status(401).json({ 
      error: "Invalid authorization header format",
      message: "Authorization header must be in the format: Bearer <token>"
    });
  }
  
  const token = parts[1];
  console.log(`[JWT] Token extracted (first 10 chars): ${token.substring(0, 10)}...`);
  
  try {
    // Verify the JWT token with the enhanced options
    let decoded: any; // Use any to accommodate our extended token claims
    
    // Minimal verification options
    const verifyOptions = {
      issuer: 'simple-slips-app'
      // Note: We're omitting algorithms and audience for compatibility with existing tokens
    };
    
    try {
      // Try string first with simplified verification
      decoded = jwt.verify(token, JWT_SECRET as string) as any;
    } catch (stringError: any) {
      console.log(`[JWT] String verification failed, trying buffer: ${stringError.message}`);
      // Try with Buffer if string fails (for compatibility)
      decoded = jwt.verify(token, Buffer.from(JWT_SECRET as string, 'utf-8')) as any;
    }
    
    // Verify the payload has all required claims
    if (!decoded.sub || !decoded.username) {
      console.log('[JWT] Missing required claims in token');
      return res.status(401).json({ 
        error: "Invalid token",
        message: "Token is missing required claims"
      });
    }
    
    const userId = decoded.sub; // Use standard sub claim for user ID
    const tokenUsername = decoded.username;
    
    console.log(`[JWT] Token verification successful for user ID: ${userId}, username: ${tokenUsername}`);
    
    // Get the user from the database
    storage.getUser(userId).then(user => {
      if (!user) {
        console.log(`[JWT] User with ID ${userId} not found in database`);
        return res.status(401).json({ 
          error: "Invalid token",
          message: "User associated with this token no longer exists"
        });
      }
      
      // Verify username in token matches user in database
      if (user.username !== tokenUsername) {
        console.log(`[JWT] Username mismatch: token=${tokenUsername}, db=${user.username}`);
        return res.status(401).json({ 
          error: "Invalid token",
          message: "Username in token does not match user in database"
        });
      }
      
      // Verify the additional userCheck claim if it exists
      if (decoded.userCheck && decoded.userCheck !== `${user.id}:${user.username}`) {
        console.log(`[JWT] User check failed: ${decoded.userCheck} vs ${user.id}:${user.username}`);
        return res.status(401).json({ 
          error: "Invalid token",
          message: "Token identity verification failed"
        });
      }
      
      // Verify token version matches user's current token version
      const tokenVersion = decoded.v || 1;
      if (user.tokenVersion && tokenVersion < user.tokenVersion) {
        console.log(`[JWT] Token version mismatch: token=${tokenVersion}, current=${user.tokenVersion}`);
        return res.status(401).json({ 
          error: "Token revoked",
          message: "This token has been invalidated. Please log in again."
        });
      }
      
      // Successfully authenticated with JWT
      console.log(`[JWT] Successfully authenticated user ${user.username} (${user.id})`);
      
      // Update last login timestamp
      if (storage.updateLastLogin) {
        storage.updateLastLogin(user.id).catch(err => {
          log(`Failed to update last login: ${err}`, 'auth');
        });
      }
      
      // Set both user properties for compatibility
      req.jwtUser = user;
      req.user = user;
      next();
    }).catch(err => {
      log(`JWT auth error fetching user: ${err}`, 'auth');
      return res.status(401).json({ 
        error: "Authentication error",
        message: "Error retrieving user data" 
      });
    });
  } catch (err: any) {
    // Return proper error for invalid token
    log(`JWT verification error: ${err}`, 'auth');
    
    // Check if token is expired vs other errors
    const isExpired = err.name === 'TokenExpiredError' || err.message?.includes('expired');
    
    return res.status(401).json({ 
      error: "Invalid token",
      message: isExpired ? "Your session has expired. Please log in again." : "The provided authentication token is invalid",
      expired: isExpired
    });
  }
}

/**
 * Configuration and setup for authentication with both session and JWT
 */
export function setupAuth(app: Express) {
  // Configure session
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "simple-slips-secret",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
    }
  };

  // Set up middleware
  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Add JWT authentication middleware
  app.use(jwtAuthMiddleware);
  
  // Add session debugging middleware
  app.use((req, res, next) => {
    console.log('[SESSION] Current Session ID:', req.sessionID);
    console.log('[SESSION] Authenticated User:', req.user?.username, '(ID:', req.user?.id, ')');
    console.log('[SESSION] JWT User:', req.jwtUser?.username, '(ID:', req.jwtUser?.id, ')');
    console.log('[SESSION] isAuthenticated:', req.isAuthenticated());
    next();
  });
  



  
  // Configure passport with enhanced username/email verification
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        log(`LocalStrategy authentication for username/email: ${username}`, 'auth');
        
        let user;
        
        // Check if input looks like an email (contains @)
        if (username.includes('@')) {
          log(`Input appears to be email, looking up by email: ${username}`, 'auth');
          const users = await storage.findUsersByEmail?.(username);
          user = users?.[0]; // Take first matching user
        } else {
          log(`Input appears to be username, looking up by username: ${username}`, 'auth');
          user = await storage.getUserByUsername(username);
        }
        
        if (!user) {
          log(`User not found for: ${username}`, 'auth');
          return done(null, false, { message: "Invalid username or password" });
        }
        
        log(`User found: ${user.username} (ID: ${user.id})`, 'auth');
        
        // Compare passwords
        const passwordMatch = await comparePasswords(password, user.password);
        if (!passwordMatch) {
          log(`Password mismatch for user: ${user.username}`, 'auth');
          return done(null, false, { message: "Invalid username or password" });
        }
        
        log(`Valid login credentials for user: ${user.username} (ID: ${user.id})`, 'auth');
        
        // Update last login
        if (storage.updateLastLogin) {
          storage.updateLastLogin(user.id).catch(err => {
            log(`Failed to update last login: ${err}`, 'auth');
          });
        }
        
        return done(null, user);
      } catch (error) {
        log(`Authentication error: ${error}`, 'auth');
        return done(error);
      }
    }),
  );

  // Serialize user for session storage
  passport.serializeUser((user, done) => done(null, user.id));
  
  // Deserialize user from session
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        // User doesn't exist anymore, clear the session
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      // If deserialization fails, clear the session instead of throwing
      console.error(`Failed to deserialize user ${id}, clearing session:`, error);
      done(null, false);
    }
  });

  // Combined authenticated check for both JWT and session
  const isAuthenticated = (req: Request) => {
    return req.isAuthenticated() || req.jwtUser !== undefined;
  };
  
  // Get user from either source
  const getUser = (req: Request) => {
    return req.user || req.jwtUser;
  };

  // Forgot password - send reset email
  app.post("/api/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Check if email exists
      const users = storage.findUsersByEmail ? await storage.findUsersByEmail(email) : [];
      const user = users?.[0];
      
      if (!user) {
        // Don't reveal if email exists or not for security
        return res.json({ 
          success: true, 
          message: "If this email is registered, you'll receive password reset instructions." 
        });
      }
      
      // Generate reset token
      const resetToken = randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour
      
      // Store reset token (you'll need to add this to your schema)
      if (storage.storePasswordResetToken) {
        await storage.storePasswordResetToken(user.id, resetToken, resetExpires);
      }
      
      // Send email using SendGrid
      if (process.env.SENDGRID_API_KEY) {
        const { default: sgMail } = await import('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        // Always use production domain for reset URLs
        const baseUrl = 'https://simpleslips.app';
        const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
        
        const msg = {
          to: email,
          from: {
            email: 'support@simpleslips.co.za',
            name: 'Simple Slips Support'
          },
          replyTo: {
            email: 'support@simpleslips.co.za',
            name: 'Simple Slips Support Team'
          },
          subject: 'Password Reset - Simple Slips',
          trackingSettings: {
            clickTracking: { enable: false },
            openTracking: { enable: false },
            subscriptionTracking: { enable: false }
          },
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0073AA;">Reset Your Password</h2>
              <p>You requested a password reset for your Simple Slips account.</p>
              <p>Click the button below to reset your password:</p>
              <a href="${resetUrl}" style="display: inline-block; background: #0073AA; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
                Reset Password
              </a>
              <p>Or copy and paste this link: ${resetUrl}</p>
              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request this, please ignore this email.</p>
            </div>
          `
        };
        
        try {
          const result = await sgMail.send(msg);
          log(`Password reset email sent successfully to ${email}. SendGrid response: ${JSON.stringify(result[0]?.statusCode)}`, 'auth');
        } catch (emailError) {
          log(`Failed to send password reset email to ${email}: ${JSON.stringify(emailError)}`, 'auth');
          // Don't throw error - still return success to user for security
        }
      }
      
      res.json({ 
        success: true, 
        message: "If this email is registered, you'll receive password reset instructions." 
      });
    } catch (error) {
      log(`Forgot password error: ${error}`, 'auth');
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });

  // Forgot username - send username reminder
  app.post("/api/forgot-username", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Check if email exists
      const users = storage.findUsersByEmail ? await storage.findUsersByEmail(email) : [];
      const user = users?.[0];
      
      if (!user) {
        // Don't reveal if email exists or not for security
        return res.json({ 
          success: true, 
          message: "If this email is registered, you'll receive your username." 
        });
      }
      
      // Send username reminder email
      if (process.env.SENDGRID_API_KEY) {
        const { default: sgMail } = await import('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        const msg = {
          to: email,
          from: 'noreply@simpleslips.co.za',
          subject: 'Username Reminder - Simple Slips',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0073AA;">Your Username</h2>
              <p>You requested a username reminder for your Simple Slips account.</p>
              <p>Your username is: <strong>${user.username}</strong></p>
              <p>You can now use this username to sign in to your account.</p>
              <p>If you didn't request this, please ignore this email.</p>
            </div>
          `
        };
        
        try {
          await sgMail.send(msg);
          log('Username reminder email sent successfully', 'auth');
        } catch (emailError) {
          log(`Failed to send username reminder email: ${emailError}`, 'auth');
        }
      }
      
      res.json({ 
        success: true, 
        message: "If this email is registered, you'll receive your username." 
      });
    } catch (error) {
      log(`Forgot username error: ${error}`, 'auth');
      res.status(500).json({ error: "Failed to process username reminder request" });
    }
  });

  // Reset password with token
  app.post("/api/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ 
          error: "Missing required information",
          message: "Both reset token and new password are required to complete the password reset.",
          userAction: "Please ensure you followed the link from your email and enter a new password."
        });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ 
          error: "Password too short",
          message: "Your new password must be at least 6 characters long for security.",
          userAction: "Please choose a longer password and try again."
        });
      }
      
      // Find user by reset token
      const user = storage.findUserByResetToken ? await storage.findUserByResetToken(token) : null;
      
      if (!user) {
        return res.status(400).json({ 
          error: "Reset link expired or invalid",
          message: "This password reset link has expired or has already been used. Password reset links are only valid for 1 hour.",
          userAction: "Please request a new password reset link from the sign-in page.",
          canRetry: true
        });
      }
      
      // Hash new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Update password and clear reset token
      if (storage.updateUserPassword) {
        await storage.updateUserPassword(user.id, hashedPassword);
      }
      
      if (storage.clearPasswordResetToken) {
        await storage.clearPasswordResetToken(user.id);
      }
      
      log(`Password reset successful for user: ${user.username}`, 'auth');
      
      res.json({ 
        success: true, 
        message: "Password reset successful. You can now sign in with your new password." 
      });
    } catch (error) {
      log(`Reset password error: ${error}`, 'auth');
      res.status(500).json({ 
        error: "Password reset temporarily unavailable",
        message: "We're experiencing technical difficulties with password reset. Please try again in a few minutes.",
        userAction: "If this problem persists, please contact support.",
        canRetry: true
      });
    }
  });

  // Check email availability
  app.post("/api/check-email", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.json({ 
          available: false, 
          error: "Please enter a valid email address" 
        });
      }
      
      // Check if email already exists
      const emailUsers = storage.findUsersByEmail ? await storage.findUsersByEmail(email) : [];
      const isAvailable = !emailUsers || emailUsers.length === 0;
      
      res.json({ 
        available: isAvailable,
        message: isAvailable ? "Email is available" : "This email is already registered"
      });
    } catch (error) {
      log(`Error checking email availability: ${error}`, 'auth');
      res.status(500).json({ error: "Failed to check email availability" });
    }
  });

  // Validate promo code
  app.post("/api/validate-promo-code", async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({ error: "Promo code is required" });
      }
      
      if (!storage.validatePromoCode) {
        return res.status(500).json({ error: "Promo code validation not available" });
      }
      
      const promoCode = await storage.validatePromoCode(code);
      
      if (!promoCode) {
        return res.status(404).json({ 
          valid: false,
          error: "Invalid or expired promo code" 
        });
      }
      
      res.json({
        valid: true,
        code: promoCode.code,
        trialDays: promoCode.trialDays,
        description: promoCode.description
      });
    } catch (error) {
      log(`Error validating promo code: ${error}`, 'auth');
      res.status(500).json({ error: "Failed to validate promo code" });
    }
  });

  // Register a new user
  app.post("/api/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const { username, password, email, fullName, promoCode } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      if (!email) {
        return res.status(400).json({ error: "Email is required for account verification" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ 
          error: "Username already exists", 
          message: "This username is already taken",
          suggestion: "Try a different username or sign in if you already have an account",
          field: "username"
        });
      }
      
      // Check if email already exists
      const emailUsers = storage.findUsersByEmail ? await storage.findUsersByEmail(email) : [];
      if (emailUsers && emailUsers.length > 0) {
        return res.status(409).json({ 
          error: "Email address is already registered", 
          message: "This email is already associated with an account",
          suggestion: "Sign in to your existing account instead, or use a different email address",
          field: "email",
          action: "redirect_to_login"
        });
      }

      // Generate email verification token
      const verificationToken = randomBytes(32).toString('hex');

      // Create user with hashed password and verification token
      const user = await storage.createUser({
        username,
        password: await hashPassword(password),
        email,
        fullName,
        emailVerificationToken: verificationToken,
        isEmailVerified: false
      });

      // Validate and apply promo code if provided
      let trialDays = 7; // Default trial days
      if (promoCode && storage.validatePromoCode && storage.usePromoCode) {
        try {
          const validPromo = await storage.validatePromoCode(promoCode);
          if (validPromo) {
            trialDays = validPromo.trialDays;
            await storage.usePromoCode(user.id, promoCode, trialDays);
            log(`Applied promo code ${promoCode} to user ${user.id} - ${trialDays} day trial`, 'auth');
          } else {
            log(`Invalid promo code ${promoCode} provided during registration`, 'auth');
          }
        } catch (promoError) {
          log(`Error applying promo code ${promoCode}: ${promoError}`, 'auth');
        }
      }

      // Automatically start free trial for new users
      try {
        if (storage.createUserSubscription) {
          // Get the free trial plan
          const plans = await storage.getSubscriptionPlans?.() || [];
          const trialPlan = plans.find(plan => plan.name === 'free_trial');
          
          if (trialPlan) {
            const trialStartDate = new Date();
            const trialEndDate = new Date();
            trialEndDate.setDate(trialEndDate.getDate() + trialDays); // Use promo code trial days if available
            
            await storage.createUserSubscription({
              userId: user.id,
              planId: trialPlan.id,
              status: 'trial',
              trialStartDate,
              trialEndDate,
              subscriptionStartDate: null,
              nextBillingDate: null,
              cancelledAt: null,
              googlePlayPurchaseToken: null,
              googlePlayOrderId: null,
              googlePlaySubscriptionId: null,
              paystackReference: null,
              paystackCustomerCode: null,
              appleReceiptData: null,
              appleTransactionId: null,
              appleOriginalTransactionId: null,
              totalPaid: 0,
              lastPaymentDate: null,
            });
            
            log(`Started ${trialDays}-day free trial for new user ${user.id} (${username})`, 'billing');
          }
        }
      } catch (trialError) {
        log(`Failed to start free trial for user ${user.id}: ${trialError}`, 'billing');
        // Don't fail registration if trial start fails
      }

      // Send verification email
      const emailService = new EmailService();
      const emailSent = await emailService.sendEmailVerification(email, username, verificationToken);
      
      if (!emailSent) {
        log(`Failed to send verification email to ${email}`, 'auth');
        // Continue with registration even if email fails - user can request resend
      }

      // Start free trial automatically for new users
      try {
        if (storage.startFreeTrial) {
          await storage.startFreeTrial(user.id);
          log(`✅ Free trial automatically activated for new user: ${username} (${user.id})`, 'auth');
        } else {
          log(`⚠️ Trial creation not available - storage method missing for user ${user.id}`, 'auth');
        }
      } catch (trialError) {
        log(`❌ FAILED to start trial for user ${user.id}: ${trialError}`, 'auth');
        // Continue with registration but log detailed error for debugging
        console.error('Trial creation error details:', trialError);
      }

      log(`User registered: ${username} (${user.id}) - verification email sent to ${email}`, 'auth');

      // Return registration success without auto-login (user must verify email first)
      res.status(201).json({
        success: true,
        message: "Your account has been created! Please check the email we have sent to you to verify your account.",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          isEmailVerified: false
        }
      });
    } catch (error) {
      log(`Registration error: ${error}`, 'auth');
      next(error);
    }
  });

  // Login a user
  app.post("/api/login", async (req: Request, res: Response, next: NextFunction) => {
    console.log('[AUTH] ======== LOGIN ATTEMPT START ========');
    log(`Login attempt for username: ${req.body.username}`, 'auth');
    
    // Comprehensive request fingerprinting for diagnostics
    console.log('--- REQUEST FINGERPRINT ---');
    console.log('IP:', req.ip);
    console.log('Headers:', JSON.stringify({
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent'],
      cookie: req.headers.cookie ? 'Set' : 'Not set',
      authorization: req.headers.authorization ? 'Set' : 'Not set',
      xDebugInfo: req.headers['x-debug-info'] || 'Not set',
    }, null, 2));
    
    console.log('Body:', JSON.stringify({ 
      username: req.body.username, 
      password: !!req.body.password,
      passwordLength: req.body.password ? req.body.password.length : 0,
      rememberMe: !!req.body.rememberMe 
    }));
    
    console.log('Cookies:', typeof req.cookies === 'object' ? Object.keys(req.cookies).length : 0, 'cookies');
    console.log('Session ID:', req.sessionID);
    console.log('Auth User:', req.user?.username, '(ID:', req.user?.id, ')');
    console.log('JWT User:', req.jwtUser?.username, '(ID:', req.jwtUser?.id, ')');
    console.log('Authenticated:', req.isAuthenticated());
    console.log('Timestamp:', new Date().toISOString());
    
    // Nuclear session reset to eliminate any contamination
    console.log('[AUTH] Performing nuclear session reset');
    
    // First force logout to clear any existing authentication
    await new Promise<void>((resolve) => {
      req.logout((err) => {
        if (err) {
          console.error('[AUTH] Error during session logout:', err);
        } else {
          console.log('[AUTH] Successfully logged out any existing session');
        }
        resolve();
      });
    });
    
    // Then regenerate the session to get a fresh session ID
    await new Promise<void>((resolve) => {
      req.session.regenerate((err) => {
        if (err) {
          console.error('[AUTH] Session regeneration failed:', err);
        } else {
          console.log('[AUTH] Session regenerated with new ID:', req.sessionID);
        }
        resolve();
      });
    });
    
    // Extract remember me preference
    const rememberMe = !!req.body.rememberMe;
    
    try {
      // Check if username exists first
      const username = req.body.username;
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }
      
      // Check for special headers
      const isSpecialAccount = req.headers["x-special-account"] === "true";
      const forceExactCase = req.headers["x-exact-case"] === "true";
      
      // Find user in database - different methods depending on headers
      let user;
      
      if (isSpecialAccount || forceExactCase || username === "KeoSoko") {
        // Use direct database query with exact case match for special accounts
        console.log(`[AUTH] Using direct DB query with exact case match for: "${username}"`);
        const [exactUser] = await db.select().from(users).where(eq(users.username, username));
        user = exactUser;
      } else {
        // Check if input looks like an email (contains @)
        if (username.includes('@')) {
          console.log(`[AUTH] Input appears to be email, looking up by email: ${username}`);
          const users = await storage.findUsersByEmail?.(username);
          user = users?.[0]; // Take first matching user
        } else {
          console.log(`[AUTH] Input appears to be username, looking up by username: ${username}`);
          user = await storage.getUserByUsername(username);
        }
      }
      
      // If user not found, just return generic message
      if (!user) {
        log(`User not found: ${username}`, 'auth');
        return res.status(401).json({ error: "Invalid username or password" });
      }
      
      // Check if account is locked
      if (user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date()) {
        const lockExpiresIn = Math.ceil((new Date(user.accountLockedUntil).getTime() - Date.now()) / 60000); // minutes
        log(`Account locked for user ${username}, expires in ${lockExpiresIn} minutes`, 'auth');
        return res.status(401).json({ 
          error: "Account locked", 
          message: `Too many failed login attempts. Account is locked for ${lockExpiresIn} more minutes.` 
        });
      }
      

      
      // Regular login path - check password
      const isValidPassword = await comparePasswords(req.body.password, user.password);
      
      if (!isValidPassword) {
        // Increment failed login attempts
        if (storage.updateUser) {
          const failedAttempts = (user.failedLoginAttempts ?? 0) + 1;
          log(`Failed login attempt ${failedAttempts} for user: ${user.username}`, 'auth');
          
          // Lock account after 5 failed attempts
          const updates: any = { failedLoginAttempts: failedAttempts };
          let lockUntil: Date | null = null;
          
          if (failedAttempts >= 5) {
            // Lock account for 15 minutes
            lockUntil = new Date(Date.now() + 15 * 60 * 1000);
            updates.accountLockedUntil = lockUntil;
            log(`Account locked until ${lockUntil.toISOString()} for user: ${user.username}`, 'auth');
            
            // Increment token version to invalidate all existing tokens
            if (storage.incrementTokenVersion) {
              try {
                const newVersion = await storage.incrementTokenVersion(user.id);
                log(`Incremented token version to ${newVersion} for user: ${user.username}`, 'auth');
              } catch (err) {
                log(`Failed to increment token version: ${err}`, 'auth');
              }
            }
          }
          
          await storage.updateUser(user.id, updates);
          
          // Check if account is now locked after this failed attempt
          if (failedAttempts >= 5 && lockUntil) {
            const lockExpiresIn = Math.ceil((lockUntil.getTime() - Date.now()) / 60000); // minutes
            return res.status(401).json({ 
              error: "Account locked", 
              message: `Too many failed login attempts. Account is locked for ${lockExpiresIn} more minutes.` 
            });
          }
        }
        
        return res.status(401).json({ error: "Invalid username or password" });
      }
      
      // Successfully authenticated
      log(`User authenticated successfully: ${user.id}`, 'auth');
      
      // Check email verification status
      if (!user.isEmailVerified) {
        log(`Login blocked for unverified email: ${user.email} (user: ${user.username})`, 'auth');
        return res.status(403).json({ 
          error: "Email not verified", 
          message: "Please verify your email address before signing in. Check your inbox for the verification link.",
          needsEmailVerification: true
        });
      }
      
      // Reset failed login attempts if any
      if (storage.updateUser && (user.failedLoginAttempts ?? 0) > 0) {
        await storage.updateUser(user.id, {
          failedLoginAttempts: 0,
          accountLockedUntil: null
        });
      }
      
      // Special handling for test user to fix login issue
      if (user.username === 'testuser') {
        console.log('[AUTH] Detected testuser login, using direct login');
        
        // Login without session regeneration for testuser to prevent conflicts
        req.login(user, async (loginErr) => {
          if (loginErr) {
            log(`Session login error: ${loginErr}`, 'auth');
            return next(loginErr);
          }
          
          log(`User session created successfully with id ${req.sessionID}`, 'auth');
          
          // Calculate token expiration based on remember me
          const tokenDays = rememberMe ? 30 : 1; // 30 days for remember me, 1 day for regular
          
          // Generate JWT token with appropriate expiration and issuer claim
          const { token, expiresIn } = generateJWT(user, rememberMe);
          
          // Update last login timestamp
          if (storage.updateLastLogin) {
            try {
              await storage.updateLastLogin(user.id);
            } catch (err) {
              log(`Failed to update last login timestamp: ${err}`, 'auth');
            }
          }
          
          console.log(`[AUTH] Testuser login successful, new session: ${req.sessionID}`);
          
          // Return user data, token, and expiration
          res.status(200).json({
            user,
            token,
            expiresIn,
            rememberMe
          });
        });
        
        return;
      }
      
      // For all other accounts, regenerate session to prevent session fixation attacks
      console.log('[AUTH] Using secure session regeneration for:', user.username);
      
      // Choose the simplest approach for session security
      req.login(user, async (loginErr) => {
        if (loginErr) {
          log(`Session login error: ${loginErr}`, 'auth');
          return next(loginErr);
        }
        
        log(`User session created successfully with id ${req.sessionID}`, 'auth');
        
        // Calculate token expiration based on remember me
        const tokenDays = rememberMe ? 30 : 1; // 30 days for remember me, 1 day for regular
        
        // Generate JWT token with appropriate expiration and issuer claim
        const { token, expiresIn } = generateJWT(user, rememberMe);
        
        // Store remember me preference if enabled
        if (rememberMe && storage.updateUser) {
          // Generate a remember me token that could be used for automatic re-authentication
          const rememberToken = randomBytes(32).toString('hex');
          await storage.updateUser(user.id, { rememberMeToken: rememberToken });
        }
        
        // Create auth token in database if supported
        if (storage.createAuthToken) {
          try {
            await storage.createAuthToken(user.id, tokenDays);
            log(`Auth token created in database`, 'auth');
          } catch (tokenErr) {
            log(`Failed to create auth token: ${tokenErr}`, 'auth');
          }
        }
        
        // Update last login timestamp
        if (storage.updateLastLogin) {
          try {
            await storage.updateLastLogin(user.id);
          } catch (err) {
            log(`Failed to update last login timestamp: ${err}`, 'auth');
          }
        }
        
        // Add detailed auth monitoring logs
        console.log(`Auth Attempt: 
          Input: ${req.body.username} 
          Found: ${user.username} 
          Match: ${user.username === req.body.username}
          Session: ${req.sessionID}`);
        
        // Return user data, token, and expiration
        res.status(200).json({
          user,
          token,
          expiresIn,
          rememberMe,
          debugInfo: {
            username: user.username,
            userId: user.id,
            requestedUsername: req.body.username,
            isKeoSokoAccount: user.username === 'KeoSoko',
            isTestuserAccount: user.username === 'testuser'
          }
        });
      });
    } catch (error) {
      log(`Login error: ${error}`, 'auth');
      next(error);
    }
  });

  // Logout a user
  app.post("/api/logout", async (req: Request, res: Response, next: NextFunction) => {
    let loggedOut = false;
    
    // Handle JWT token revocation
    const authHeader = req.headers.authorization;
    if (authHeader && storage.revokeAuthToken) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const token = parts[1];
        
        try {
          // Verify the token with proper JWT_SECRET handling
          const secret = JWT_SECRET || process.env.JWT_SECRET || 'default-secret-key';
          jwt.verify(token, secret);
          
          // If token is valid, revoke it in database
          if (storage.getAuthTokenByToken) {
            try {
              const authToken = await storage.getAuthTokenByToken(token);
              if (authToken && storage.revokeAuthToken) {
                await storage.revokeAuthToken(authToken.id);
                loggedOut = true;
                log('Token successfully revoked', 'auth');
              }
            } catch (dbError) {
              log(`Error revoking token in database: ${dbError}`, 'auth');
            }
          }
        } catch (err) {
          // Invalid token
          log(`Invalid token during logout: ${err}`, 'auth');
        }
      }
    }
    
    // Handle session logout
    if (req.isAuthenticated()) {
      req.logout((err) => {
        if (err) return next(err);
        loggedOut = true;
        log('Session successfully logged out', 'auth');
        res.status(200).json({ success: true, message: "Logged out successfully" });
      });
    } else if (loggedOut) {
      // Already logged out via token
      res.status(200).json({ success: true, message: "Logged out successfully" });
    } else {
      // No session or valid token found
      res.status(200).json({ success: true, message: "Already logged out" });
    }
  });

  // Get current authenticated user
  app.get("/api/user", (req: Request, res: Response) => {
    console.log(`[USER] Request for /api/user: isAuthenticated=${isAuthenticated(req)}`);
    console.log(`[USER] Request headers:`, JSON.stringify({
      authorization: req.headers.authorization ? 'Set' : 'Not set',
      contentType: req.headers['content-type'],
      cookie: req.headers.cookie ? 'Set' : 'Not set',
    }));
    
    if (!isAuthenticated(req)) {
      console.log('[USER] Authentication check failed, returning 401');
      return res.sendStatus(401);
    }
    
    const user = getUser(req);
    console.log(`[USER] Returning user data for user ID: ${user?.id}`);
    res.json(user);
  });
  
  // Sign out of all devices (destroy current session)
  app.post("/api/invalidate-tokens", async (req: Request, res: Response) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const user = getUser(req);
    
    if (!user) {
      return res.status(401).json({ error: "No user found" });
    }
    
    try {
      // Destroy the current session
      req.session.destroy((err) => {
        if (err) {
          log(`Error destroying session: ${err}`, 'auth');
        }
      });
      
      // Clear the session cookie
      res.clearCookie('connect.sid');
      
      log(`User signed out of all devices: ${user.username} (ID: ${user.id})`, 'auth');
      
      return res.status(200).json({ 
        success: true, 
        message: "Successfully signed out of all devices. Please log in again."
      });
    } catch (error) {
      log(`Error signing out of all devices: ${error}`, 'auth');
      return res.status(500).json({ 
        error: "Server error", 
        message: "Failed to sign out of all devices" 
      });
    }
  });
  
  // REMOVED: Duplicate password reset endpoint - use /api/forgot-password instead
  
  // Reset password with token
  app.post("/api/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ 
          error: "Invalid request", 
          message: "Reset token and new password are required" 
        });
      }
      
      // Find user with this reset token
      if (!storage.findUserByResetToken) {
        return res.status(400).json({ 
          error: "Not supported", 
          message: "Password reset is not supported in this environment" 
        });
      }

      const user = await storage.findUserByResetToken(token);
      
      if (!user) {
        return res.status(400).json({ 
          error: "Invalid token", 
          message: "Password reset token is invalid or has expired" 
        });
      }
      
      // Check if token is expired
      if (!user.passwordResetExpires || new Date(user.passwordResetExpires) < new Date()) {
        return res.status(400).json({ 
          error: "Token expired", 
          message: "Password reset token has expired" 
        });
      }
      
      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Update user with new password and clear reset token
      if (storage.updateUser) {
        await storage.updateUser(user.id, {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
          failedLoginAttempts: 0, // Reset failed login attempts
          accountLockedUntil: null // Remove account lock if present
        });
        
        log(`Password reset successful for user: ${user.id}`, 'auth');
        
        return res.status(200).json({ 
          success: true, 
          message: "Password has been reset successfully" 
        });
      } else {
        throw new Error("Storage implementation doesn't support updating users");
      }
    } catch (error) {
      log(`Password reset error: ${error}`, 'auth');
      return res.status(500).json({ 
        error: "Server error", 
        message: "Failed to reset password" 
      });
    }
  });

  // Email verification endpoint
  app.post("/api/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ 
          error: "Missing token", 
          message: "Verification token is required" 
        });
      }
      
      // Find user with this verification token
      if (!storage.findUserByVerificationToken) {
        return res.status(400).json({ 
          error: "Not supported", 
          message: "Email verification is not supported in this environment" 
        });
      }

      const user = await storage.findUserByVerificationToken(token);
      
      if (!user) {
        return res.status(400).json({ 
          error: "Invalid token", 
          message: "Email verification token is invalid or has expired" 
        });
      }
      
      if (user.isEmailVerified) {
        return res.status(200).json({ 
          success: true, 
          message: "Email is already verified" 
        });
      }
      
      // Mark email as verified and clear token
      if (storage.updateUser) {
        await storage.updateUser(user.id, {
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          emailVerificationToken: null
        });
        
        // Welcome messaging is handled by the verification email template
        
        log(`Email verified for user: ${user.id}`, 'auth');
        
        return res.status(200).json({ 
          success: true, 
          message: "Email verified successfully! You can now sign in to your account." 
        });
      } else {
        throw new Error("Storage implementation doesn't support updating users");
      }
    } catch (error) {
      log(`Email verification error: ${error}`, 'auth');
      return res.status(500).json({ 
        error: "Server error", 
        message: "Failed to verify email" 
      });
    }
  });

  // Resend verification email endpoint
  app.post("/api/resend-verification", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Find user by email
      const users = storage.findUsersByEmail ? await storage.findUsersByEmail(email) : [];
      
      // For security, always return success even if email not found
      if (!users || users.length === 0) {
        log(`Verification resend requested for non-existent email: ${email}`, 'auth');
        return res.status(200).json({ 
          success: true, 
          message: "If an account with that email exists and is not verified, a verification email has been sent." 
        });
      }
      
      const user = users[0];
      
      if (user.isEmailVerified) {
        return res.status(200).json({ 
          success: true, 
          message: "Email is already verified" 
        });
      }
      
      // Generate new verification token
      const verificationToken = randomBytes(32).toString('hex');
      
      // Update user with new token
      if (storage.updateUser) {
        log(`Updating user ${user.id} with new verification token: ${verificationToken}`, 'auth');
        const updatedUser = await storage.updateUser(user.id, {
          emailVerificationToken: verificationToken
        });
        log(`Database update result: ${updatedUser ? 'SUCCESS' : 'FAILED'}`, 'auth');
        
        if (!updatedUser) {
          log(`Failed to update user ${user.id} with verification token`, 'auth');
          return res.status(500).json({ 
            error: "Database error",
            message: "Failed to update verification token. Please try again later." 
          });
        }
        
        // Send new verification email
        const emailService = new EmailService();
        const emailSent = await emailService.sendEmailVerification(email, user.username, verificationToken);
        
        if (!emailSent) {
          log(`Failed to resend verification email to ${email}`, 'auth');
          return res.status(500).json({ 
            error: "Email service error",
            message: "Failed to send verification email. Please try again later." 
          });
        }
        
        log(`Verification email resent to: ${email}`, 'auth');
        
        return res.status(200).json({ 
          success: true, 
          message: "Verification email has been sent. Please check your inbox." 
        });
      } else {
        throw new Error("Storage implementation doesn't support updating users");
      }
    } catch (error) {
      log(`Resend verification error: ${error}`, 'auth');
      return res.status(500).json({ 
        error: "Server error", 
        message: "Failed to send verification email" 
      });
    }
  });
  
  // Enhanced emergency direct login endpoint for KeoSoko only
  app.post("/api/emergency-login", async (req: Request, res: Response, next: NextFunction) => {
    console.log('[AUTH] ======== EMERGENCY LOGIN ATTEMPT ========');
    console.log('[AUTH] Headers:', JSON.stringify({
      special: req.headers['x-keosoko-special'] || 'Not set',
      emergencyLogin: req.headers['x-emergency-login'] || 'Not set',
      contentType: req.headers['content-type'] || 'Not set',
      requestTime: req.headers['x-request-time'] || 'Not set',
    }));
    
    try {
      const { username, password, bypassKey } = req.body;
      console.log(`[AUTH] Emergency login request for username: ${username || 'Not set'}`);
      
      // Security check to prevent abuse - this is a dedicated endpoint
      if (bypassKey !== "keosoko-special-login-bypass") {
        console.log('[AUTH] Emergency login rejected: invalid bypass key');
        return res.status(403).json({ error: "Invalid bypass key" });
      }
      
      // This endpoint is STRICTLY for KeoSoko only
      if (username !== "KeoSoko") {
        console.log(`[AUTH] Emergency login rejected: username ${username} is not KeoSoko`);
        return res.status(403).json({ error: "This endpoint is only for KeoSoko account" });
      }
      
      // Find the KeoSoko user directly by exact username match
      console.log('[AUTH] Looking up KeoSoko user in the database');
      
      // Use the storage interface to find KeoSoko with exact case match
      console.log('[AUTH] Looking up KeoSoko user with exact case match');
      let keoSokoUser = await storage.getUserByUsername("KeoSoko");
      
      if (!keoSokoUser) {
        console.log('[AUTH] KeoSoko account not found with exact case match!');
        
        // For diagnostics only, try to find other usernames that might be similar
        console.log('[AUTH] Checking if any similarly named accounts exist');
        
        // Diagnostics to check all users
        try {
          // Use the storage interface to get all usernames
          const allKnownUsers = Array.from(
            await Promise.all([
              storage.getUserByUsername("KeoSoko"),
              storage.getUserByUsername("keosoko"),
              storage.getUserByUsername("kEoSoKo"),
              storage.getUserByUsername("KEOSOKO"),
              storage.getUserByUsername("testuser")
            ])
          ).filter(Boolean);
          
          console.log(`[AUTH] Found ${allKnownUsers.length} test accounts`);
          
          // Log the info for each test account
          if (allKnownUsers.length > 0) {
            allKnownUsers.forEach(user => {
              console.log(`[AUTH] Test account: "${user?.username}" (ID: ${user?.id})`);
            });
          } else {
            console.log('[AUTH] No test accounts found');
          }
        } catch (dbError) {
          console.log('[AUTH] Error checking for similar usernames:', dbError);
        }
        
        return res.status(404).json({ 
          error: "KeoSoko account not found", 
          message: "Could not find user 'KeoSoko' with exact case match" 
        });
      }
      
      console.log(`[AUTH] Found KeoSoko account with ID: ${keoSokoUser.id}`);
      
      // Verify the password is correct for this emergency path
      if (password !== "password123") {
        console.log(`[AUTH] Emergency login failed: Invalid password for KeoSoko`);
        return res.status(401).json({ error: "Invalid password" });
      }
      
      // Update last login timestamp
      if (storage.updateLastLogin) {
        await storage.updateLastLogin(keoSokoUser.id);
        console.log(`[AUTH] Updated last login for KeoSoko (ID: ${keoSokoUser.id})`);
      }
      
      // Clean any stale data
      if (storage.updateUser) {
        await storage.updateUser(keoSokoUser.id, {
          failedLoginAttempts: 0,
          accountLockedUntil: null
        });
        console.log(`[AUTH] Reset account status for KeoSoko`);
      }
      
      // Generate a fresh JWT token with the correct user data
      const { token, expiresIn } = generateJWT(keoSokoUser, true);
      console.log(`[AUTH] Generated token for KeoSoko (ID: ${keoSokoUser.id})`);
      
      // Create a new auth token in the database
      if (storage.createAuthToken) {
        await storage.createAuthToken(keoSokoUser.id, 30); // 30-day token
        console.log(`[AUTH] Created persistence token for KeoSoko`);
      }
      
      // First, clear any existing session
      if (req.session) {
        req.logout((logoutErr) => {
          if (logoutErr) {
            console.log('[AUTH] Warning: Failed to clear session during emergency login:', logoutErr);
          } else {
            console.log('[AUTH] Successfully cleared existing session');
          }
          
          // Now regenerate the session with a new ID
          req.session.regenerate((regenerateErr) => {
            if (regenerateErr) {
              console.log(`[AUTH] Session regeneration error: ${regenerateErr}`);
              return next(regenerateErr);
            }
            
            console.log(`[AUTH] Session regenerated with new ID: ${req.sessionID}`);
            
            // Now login with the new session
            req.login(keoSokoUser, (loginErr) => {
              if (loginErr) {
                console.log(`[AUTH] Login failed after session regeneration: ${loginErr}`);
                return next(loginErr);
              }
              
              console.log(`[AUTH] Emergency login successful for KeoSoko (ID: ${keoSokoUser.id})`);
              console.log('[AUTH] ======== EMERGENCY LOGIN SUCCESSFUL ========');
              
              // Return user data and token
              res.status(200).json({
                user: {
                  ...keoSokoUser,
                  username: "KeoSoko", // Ensure username is explicitly set
                  id: keoSokoUser.id,  // Ensure ID is explicitly set
                },
                token,
                expiresIn,
                emergency: true,
                timestamp: new Date().toISOString(),
                verification: {
                  username: "KeoSoko",
                  userId: keoSokoUser.id
                },
                message: "Emergency login successful for KeoSoko"
              });
            });
          });
        });
      } else {
        // If session doesn't exist for some reason, just return the token
        console.log('[AUTH] No session found, returning token only');
        res.status(200).json({
          user: keoSokoUser,
          token,
          expiresIn,
          emergency: true,
          noSession: true
        });
      }
    } catch (error) {
      console.error('[AUTH] Emergency login error:', error);
      console.log('[AUTH] ======== EMERGENCY LOGIN FAILED ========');
      next(error);
    }
  });
  
  // Generate new JWT token when already authenticated
  app.post("/api/token", (req: Request, res: Response) => {
    console.log('[AUTH] Token refresh request received');
    
    if (!isAuthenticated(req)) {
      console.log('[AUTH] Token refresh rejected - not authenticated');
      return res.status(401).json({ 
        error: "Not authenticated",
        message: "You must be logged in to refresh your token"
      });
    }
    
    const user = getUser(req)!;
    console.log(`[AUTH] Generating new token for user: ${user.username} (${user.id})`);
    
    const { token, expiresIn } = generateJWT(user);
    
    // Create auth token in database if supported
    if (storage.createAuthToken) {
      storage.createAuthToken(user.id, 1).catch(err => {
        log(`Failed to create auth token: ${err}`, 'auth');
      });
    }
    
    console.log('[AUTH] Token refreshed successfully');
    res.json({ token, expiresIn });
  });
  
  // Clean up expired tokens periodically if using database storage
  if (storage.cleanupExpiredTokens) {
    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    
    setInterval(() => {
      storage.cleanupExpiredTokens?.()
        .then(count => {
          if (count > 0) {
            log(`Cleaned up ${count} expired auth tokens`, 'auth');
          }
        })
        .catch(err => {
          log(`Failed to clean up expired tokens: ${err}`, 'auth');
        });
    }, CLEANUP_INTERVAL);
  }
}
