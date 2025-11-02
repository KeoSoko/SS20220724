// Email Verification Diagnostic Utility
// For monitoring and debugging the verification flow

interface VerificationEvent {
  timestamp: number;
  type: 'component_mount' | 'token_extract' | 'api_call' | 'success' | 'error' | 'redirect';
  data: any;
}

class VerificationDiagnostics {
  private events: VerificationEvent[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    this.log('component_mount', { startTime: this.startTime });
  }

  log(type: VerificationEvent['type'], data: any) {
    const event: VerificationEvent = {
      timestamp: Date.now(),
      type,
      data
    };
    this.events.push(event);
    console.log(`[VERIFY-DIAG] ${type}:`, data);
  }

  getReport() {
    const totalTime = Date.now() - this.startTime;
    return {
      totalTime,
      events: this.events,
      summary: this.generateSummary()
    };
  }

  private generateSummary() {
    const hasToken = this.events.some(e => e.type === 'token_extract' && e.data?.token);
    const hasApiCall = this.events.some(e => e.type === 'api_call');
    const hasSuccess = this.events.some(e => e.type === 'success');
    const hasError = this.events.some(e => e.type === 'error');
    const hasRedirect = this.events.some(e => e.type === 'redirect');

    return {
      tokenFound: hasToken,
      apiCalled: hasApiCall,
      successful: hasSuccess,
      hasErrors: hasError,
      redirected: hasRedirect,
      totalEvents: this.events.length
    };
  }

  exportForSupport() {
    const report = this.getReport();
    const supportData = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      ...report
    };
    
    console.log('=== VERIFICATION DIAGNOSTIC REPORT ===');
    console.log(JSON.stringify(supportData, null, 2));
    console.log('=== END DIAGNOSTIC REPORT ===');
    
    return supportData;
  }
}

export default VerificationDiagnostics;