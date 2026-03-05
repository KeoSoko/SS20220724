import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { azureStorage } from "./azure-storage";
import { initializeSubscriptionPlans } from "./subscription-plans-seeder";

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

const parseEnvInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Production-safe defaults (overridable via env vars)
const DEFAULT_BODY_LIMIT = process.env.DEFAULT_BODY_LIMIT || '1mb';
const UPLOAD_BODY_LIMIT = process.env.UPLOAD_BODY_LIMIT || '25mb';
const REQUEST_TIMEOUT_MS = parseEnvInt(process.env.REQUEST_TIMEOUT_MS, isProduction ? 30_000 : 120_000);
const RATE_LIMIT_WINDOW_MS = parseEnvInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);

const AUTH_RATE_LIMIT_MAX = parseEnvInt(process.env.RATE_LIMIT_AUTH_MAX, isProduction ? 20 : 200);
const UPLOAD_RATE_LIMIT_MAX = parseEnvInt(process.env.RATE_LIMIT_UPLOAD_MAX, isProduction ? 60 : 300);
const SEARCH_RATE_LIMIT_MAX = parseEnvInt(process.env.RATE_LIMIT_SEARCH_MAX, isProduction ? 120 : 500);
const GENERAL_RATE_LIMIT_MAX = parseEnvInt(process.env.RATE_LIMIT_GENERAL_MAX, isProduction ? 400 : 2000);

const authEndpoints = new Set([
  '/api/login',
  '/api/register',
  '/api/logout',
  '/api/reset-password',
  '/api/verify-email',
  '/api/resend-verification',
  '/api/token',
  '/api/emergency-login',
  '/api/invalidate-tokens',
]);

const uploadEndpointsWithLargeBodies = new Set([
  '/api/profile/picture',
  '/api/receipts',
  '/api/receipts/scan',
  '/api/business-profile/logo',
]);

const uploadRateLimitEndpoints = new Set([
  ...Array.from(uploadEndpointsWithLargeBodies),
  '/api/webhooks/inbound-email',
]);

const searchPathPrefixes = [
  '/api/search',
  '/api/smart-search',
  '/api/receipts/search',
  '/api/receipts/smart-search',
  '/api/tax/ask',
  '/api/tax-assistant',
];

const hasSearchPrefix = (pathName: string): boolean => searchPathPrefixes.some((prefix) => pathName.startsWith(prefix));

const createCategoryLimiter = (max: number, message: string) => rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max,
  message,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = createCategoryLimiter(AUTH_RATE_LIMIT_MAX, 'Too many authentication requests, please try again later.');
const uploadLimiter = createCategoryLimiter(UPLOAD_RATE_LIMIT_MAX, 'Too many upload requests, please try again later.');
const searchLimiter = createCategoryLimiter(SEARCH_RATE_LIMIT_MAX, 'Too many search requests, please try again later.');
const generalLimiter = createCategoryLimiter(GENERAL_RATE_LIMIT_MAX, 'Too many requests from this IP, please try again later.');

app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS);
  res.setTimeout(REQUEST_TIMEOUT_MS);

  const abortController = new AbortController();
  (req as Request & { abortSignal?: AbortSignal }).abortSignal = abortController.signal;

  const timeoutHandle = setTimeout(() => {
    abortController.abort(new Error('Request timed out'));
    if (!res.headersSent) {
      res.status(408).json({
        message: 'Request timed out. Please try again.',
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    }
  }, REQUEST_TIMEOUT_MS);

  const cleanup = () => clearTimeout(timeoutHandle);
  req.on('aborted', cleanup);
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('finish', cleanup);

  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  if (authEndpoints.has(req.path)) {
    return authLimiter(req, res, next);
  }

  if (uploadRateLimitEndpoints.has(req.path)) {
    return uploadLimiter(req, res, next);
  }

  if (hasSearchPrefix(req.path)) {
    return searchLimiter(req, res, next);
  }

  return generalLimiter(req, res, next);
});

// Security: CORS configuration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use((req, res, next) => {
  const limit = uploadEndpointsWithLargeBodies.has(req.path) ? UPLOAD_BODY_LIMIT : DEFAULT_BODY_LIMIT;

  express.json({ limit })(req, res, (jsonErr) => {
    if (jsonErr) {
      return next(jsonErr);
    }

    express.urlencoded({ extended: false, limit })(req, res, next);
  });
});
// Configure MIME types for static files
app.use((req, res, next) => {
  // Set correct MIME types for JavaScript files
  if (req.path.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript');
  } else if (req.path.endsWith('.mjs')) {
    res.setHeader('Content-Type', 'application/javascript');
  } else if (req.path.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css');
  } else if (req.path.endsWith('.json')) {
    res.setHeader('Content-Type', 'application/json');
  } else if (req.path.endsWith('.html')) {
    res.setHeader('Content-Type', 'text/html');
  } else if (req.path.endsWith('.png')) {
    res.setHeader('Content-Type', 'image/png');
  } else if (req.path.endsWith('.jpg') || req.path.endsWith('.jpeg')) {
    res.setHeader('Content-Type', 'image/jpeg');
  } else if (req.path.endsWith('.gif')) {
    res.setHeader('Content-Type', 'image/gif');
  } else if (req.path.endsWith('.svg')) {
    res.setHeader('Content-Type', 'image/svg+xml');
  }
  next();
});

// Serve assetlinks.json for Android PWA verification (MUST be before express.static!)
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.resolve(process.cwd(), 'public/.well-known/assetlinks.json'));
});

// Serve static files from attached_assets directory
app.use('/attached_assets', express.static('attached_assets'));

// Serve uploaded files (receipts and profiles)
app.use('/uploads', express.static('uploads'));

// Serve sw.js and clear-cache.html BEFORE static middleware to ensure no-cache headers
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.resolve(process.cwd(), 'public/sw.js'));
});

app.get('/clear-cache.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.resolve(process.cwd(), 'public/clear-cache.html'));
});

// Serve static files from public directory (logos, icons, etc.)
app.use(express.static('public'));

// Explicitly serve manifest.json from public directory
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.resolve(process.cwd(), 'public/manifest.json'));
});

app.use('/favicon.ico', express.static('public/favicon.ico'));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize Azure Storage
  try {
    await azureStorage.initialize();
    log("Azure Storage initialized successfully", "azure");
  } catch (error) {
    log(`Warning: Azure Storage initialization failed: ${error}`, "azure");
  }

  // Initialize subscription plans
  await initializeSubscriptionPlans();

  // Error logging endpoints for monitoring
  app.post('/api/log-error', (req: Request, res: Response) => {
    try {
      const errorData = req.body;
      const timestamp = new Date().toISOString();
      
      // Log to console with structured format
      console.error(`[CLIENT ERROR] ${timestamp}`, {
        message: errorData.message,
        url: errorData.url,
        userId: errorData.userId,
        username: errorData.username,
        component: errorData.component,
        type: errorData.type,
        userAgent: errorData.userAgent
      });
      
      // In production, you would send this to a logging service like:
      // - Sentry
      // - LogRocket
      // - DataDog
      // - CloudWatch
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Failed to log client error:', error);
      res.status(500).json({ error: 'Failed to log error' });
    }
  });

  app.post('/api/log-performance', (req: Request, res: Response) => {
    try {
      const performanceData = req.body;
      const timestamp = new Date().toISOString();
      
      console.log(`[PERFORMANCE] ${timestamp}`, {
        metric: performanceData.metric,
        value: performanceData.value,
        url: performanceData.url,
        userId: performanceData.userId,
        context: performanceData.context
      });
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Failed to log performance data:', error);
      res.status(500).json({ error: 'Failed to log performance' });
    }
  });

  // Register API routes
  const server = await registerRoutes(app);

  // Setup static file serving and client routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log server errors for monitoring
    console.error(`[SERVER ERROR] ${new Date().toISOString()}`, {
      status,
      message,
      stack: err.stack,
      url: _req.url,
      method: _req.method,
      userAgent: _req.get('User-Agent')
    });

    res.status(status).json({ message });
    throw err;
  });

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
