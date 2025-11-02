import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { azureStorage } from "./azure-storage";
import { initializeSubscriptionPlans } from "./subscription-plans-seeder";

const app = express();

// Security: Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for development and testing
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all requests
app.use(generalLimiter);

// Apply stricter rate limiting to auth endpoints
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

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

// Increase JSON body size limit to 50MB
app.use(express.json({ limit: '50mb' }));
// Increase URL-encoded body size limit to 50MB
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
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

// Serve static files from public directory (logos, icons, etc.)
app.use(express.static('public'));

// Explicitly serve manifest.json and other PWA files from public directory
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.resolve(process.cwd(), 'public/manifest.json'));
});
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.resolve(process.cwd(), 'public/sw.js'));
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

  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();