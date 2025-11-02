# Session Timeout Recommendations for Simple Slips

## Current Configuration
- **Session Timeout**: 7 days (604,800,000 ms)
- **JWT Token**: 7 days
- **Security Level**: Very low (high risk for financial app)

## Recommended Timeout Options

### Option 1: Conservative (Banking-level Security)
- **Session Timeout**: 15 minutes
- **JWT Token**: 15 minutes  
- **Auto-refresh**: If user is active
- **Security Level**: High
- **User Experience**: Requires frequent re-login but very secure

### Option 2: Balanced (Recommended for Simple Slips)
- **Session Timeout**: 1 hour
- **JWT Token**: 1 hour
- **Auto-refresh**: On activity
- **Security Level**: Good
- **User Experience**: Good balance of security and usability

### Option 3: Extended (Current mobile-friendly)
- **Session Timeout**: 24 hours
- **JWT Token**: 24 hours
- **Auto-refresh**: Daily
- **Security Level**: Medium
- **User Experience**: Very convenient but higher risk

### Option 4: Smart Adaptive
- **Active session**: 2 hours
- **Idle timeout**: 15 minutes
- **Mobile grace**: 4 hours (with biometric re-auth)
- **Security Level**: Dynamic
- **User Experience**: Best of both worlds

## Implementation Code Changes

### For 1 Hour Timeout (Recommended):
```typescript
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const SESSION_MAX_AGE = 1000 * 60 * 60; // 1 hour
```

### For Smart Adaptive (Advanced):
```typescript
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";
const SESSION_MAX_AGE = 1000 * 60 * 60 * 2; // 2 hours
// Plus activity-based refresh logic
```

## Considerations for Simple Slips

**Pros of Shorter Timeouts:**
- Better security for financial data
- Compliance with financial app standards
- Reduces risk if device is compromised
- Forces users to actively engage

**Pros of Longer Timeouts:**
- Better mobile experience
- Less friction for frequent users
- Reduces support requests about re-login
- Better for receipt scanning workflow

## Recommendation
Start with **1 hour timeout** and monitor user feedback. Can extend to 2-4 hours based on usage patterns.