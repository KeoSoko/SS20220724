import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle, Mail, MailWarning, TrendingDown, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function EmailTrackingPage() {
  // Fetch email stats
  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalSent: number;
    delivered: number;
    bounced: number;
    spamReports: number;
    opened: number;
    clicked: number;
    deliveryRate: number;
    bounceRate: number;
  }>({
    queryKey: ['/api/admin/email-stats'],
  });

  // Fetch recent email events
  const { data: events, isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/email-events'],
  });

  // Fetch problematic emails
  const { data: problematicEmails, isLoading: problematicLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/problematic-emails'],
  });

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'delivered':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'bounce':
        return <MailWarning className="h-4 w-4 text-red-500" />;
      case 'spamreport':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'open':
        return <Mail className="h-4 w-4 text-blue-500" />;
      case 'click':
        return <TrendingUp className="h-4 w-4 text-purple-500" />;
      default:
        return <Mail className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventBadgeColor = (eventType: string) => {
    switch (eventType) {
      case 'delivered':
        return 'default';
      case 'bounce':
        return 'destructive';
      case 'spamreport':
        return 'destructive';
      case 'deferred':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-email-tracking">Email Deliverability Dashboard</h1>
          <p className="text-muted-foreground">Monitor email delivery, bounces, and engagement</p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : stats ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-sent">{stats.totalSent}</div>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Delivery Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold text-green-600" data-testid="stat-delivery-rate">
                    {stats.deliveryRate.toFixed(1)}%
                  </div>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-xs text-muted-foreground">{stats.delivered} delivered</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Bounce Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className={`text-2xl font-bold ${stats.bounceRate > 5 ? 'text-red-600' : 'text-gray-600'}`} data-testid="stat-bounce-rate">
                    {stats.bounceRate.toFixed(1)}%
                  </div>
                  {stats.bounceRate > 5 && <TrendingDown className="h-4 w-4 text-red-600" />}
                </div>
                <p className="text-xs text-muted-foreground">{stats.bounced} bounced</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Spam Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600" data-testid="stat-spam-reports">{stats.spamReports}</div>
                <p className="text-xs text-muted-foreground">User complaints</p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Problematic Emails */}
      {!problematicLoading && problematicEmails && problematicEmails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Problematic Emails
            </CardTitle>
            <CardDescription>Emails with bounces that need attention</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Bounce Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Occurrences</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problematicEmails.map((email, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium" data-testid={`problematic-email-${index}`}>{email.email}</TableCell>
                    <TableCell>
                      <Badge variant={email.bounceType === 'hard' ? 'destructive' : 'secondary'}>
                        {email.bounceType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{email.bounceReason}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{email.count}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Email Events</CardTitle>
          <CardDescription>Latest email delivery events from SendGrid</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event, index) => (
                  <TableRow key={event.id || index}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getEventIcon(event.eventType)}
                        <Badge variant={getEventBadgeColor(event.eventType)} data-testid={`event-type-${index}`}>
                          {event.eventType}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`event-email-${index}`}>{event.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{event.emailType || 'unknown'}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {event.bounceReason || event.clickedUrl || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No email events yet</p>
              <p className="text-sm">Events will appear here once SendGrid webhooks are configured</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
