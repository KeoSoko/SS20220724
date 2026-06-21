import { Crown, UserPlus, Users, CreditCard, Calendar, Mail, Building2, AlertCircle, ChevronRight, XCircle, Clock } from "lucide-react";

function ProgressBar({ used, total }: { used: number; total: number }) {
  const pct = Math.min(100, Math.round((used / total) * 100));
  const atCapacity = used >= total;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Team Seats</span>
        <span className={`text-sm font-semibold ${atCapacity ? "text-amber-600" : "text-gray-800"}`}>
          {used} / {total} used
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${atCapacity ? "bg-amber-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">
        {atCapacity ? "All seats filled — upgrade to invite more" : `${total - used} seat${total - used !== 1 ? "s" : ""} available`}
      </p>
    </div>
  );
}

function MemberRow({ name, email, role, lastActive, onRemove }: { name: string; email: string; role: string; lastActive: string; onRemove?: () => void }) {
  const isOwner = role === "Owner";
  return (
    <div className={`flex items-center gap-3 p-3.5 bg-white border rounded-sm ${isOwner ? "border-l-4 border-l-amber-400" : "border-l-4 border-l-blue-400"} border-gray-100`}>
      <div className={`h-9 w-9 rounded-sm flex items-center justify-center font-semibold text-sm flex-shrink-0 ${isOwner ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
        {name[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-800 truncate">{name}</span>
          <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-sm ${isOwner ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{role}</span>
        </div>
        <p className="text-xs text-gray-500 truncate">{email}</p>
      </div>
      <div className="text-right flex-shrink-0 flex items-center gap-2">
        <div>
          <p className="text-xs text-gray-400">Last active</p>
          <p className="text-xs text-gray-600">{lastActive}</p>
        </div>
        {!isOwner && (
          <button className="text-gray-300 hover:text-red-500 transition-colors p-1">
            <XCircle className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function PendingInvite({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-3 p-3.5 bg-gray-50 border border-dashed border-gray-300 rounded-sm border-l-4 border-l-gray-300">
      <div className="h-9 w-9 rounded-sm bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0">
        <Clock className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-600 truncate">{email}</span>
          <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded-sm bg-yellow-100 text-yellow-700">Pending</span>
        </div>
        <p className="text-xs text-gray-400">Invite expires in 6 days</p>
      </div>
      <button className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 px-2 py-1 rounded-sm transition-colors flex-shrink-0">
        Cancel
      </button>
    </div>
  );
}

export function OwnerView() {
  return (
    <div className="min-h-screen bg-gray-50 p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Page header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Company Account</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your team, billing and subscription</p>
        </div>

        {/* ── COMPANY OVERVIEW ─────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Company Overview</span>
              </div>
              <button className="text-xs text-blue-600 hover:underline">Edit name</button>
            </div>
          </div>
          <div className="p-5 space-y-5">

            {/* Company name */}
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">Company Name</span>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">Acme Consulting (Pty) Ltd</p>
            </div>

            {/* Progress bar seat usage */}
            <ProgressBar used={3} total={5} />

            {/* Capacity warning */}
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-sm p-3">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-800 font-medium">You've used 3 of 5 seats</p>
                <p className="text-xs text-amber-700 mt-0.5">2 seats remaining. Upgrade to add more team members.</p>
              </div>
              <button className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 px-2.5 py-1.5 rounded-sm transition-colors">
                <Crown className="h-3 w-3" />
                Upgrade
              </button>
            </div>

          </div>
        </div>

        {/* ── BILLING INFORMATION ───────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Billing Information</span>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">Plan Owner</span>
                <p className="text-sm font-medium text-gray-800 mt-0.5">Sipho Dlamini</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">Billing Email</span>
                <p className="text-sm font-medium text-gray-800 mt-0.5">sipho@acme.co.za</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">Current Plan</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm font-medium text-gray-800">Lite Team</p>
                  <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-sm font-medium">5 seats</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">Next Renewal</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  <p className="text-sm font-medium text-gray-800">21 Jul 2026</p>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">R245/month · Paystack recurring</span>
              <div className="flex items-center gap-2">
                <button className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-sm">Payment history</button>
                <button className="text-xs text-red-500 hover:text-red-700 border border-red-100 px-2.5 py-1.5 rounded-sm">Cancel subscription</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── TEAM MEMBERS ──────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Members</span>
                <span className="text-xs text-gray-400">(3 of 5)</span>
              </div>
              <button className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#0073AA] hover:bg-[#005f8d] px-3 py-1.5 rounded-sm transition-colors">
                <UserPlus className="h-3.5 w-3.5" />
                Invite Member
              </button>
            </div>
          </div>
          <div className="p-5 space-y-2.5">
            <MemberRow name="Sipho Dlamini" email="sipho@acme.co.za" role="Owner" lastActive="Today" />
            <MemberRow name="Kefilwe Mokoena" email="kefilwe@acme.co.za" role="Assistant" lastActive="Yesterday" />
            <MemberRow name="Thabo Nkosi" email="thabo@acme.co.za" role="Assistant" lastActive="3 days ago" />
            <PendingInvite email="naledi@acme.co.za" />
          </div>
        </div>

        {/* Privacy note */}
        <div className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-sm p-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-sm bg-blue-50 flex items-center justify-center">
            <Mail className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-700">Data remains private per member</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Each team member's receipts, invoices, reports and tax data are private to them. You share a billing account, not your financial records.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
