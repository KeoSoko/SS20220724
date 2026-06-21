import { ShieldCheck, Building2, User, Lock, Receipt, FileText, BarChart2, CheckCircle2 } from "lucide-react";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

function FeatureItem({ icon: Icon, label, desc }: { icon: any; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-sm bg-green-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-green-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

export function MemberView() {
  return (
    <div className="min-h-screen bg-gray-50 p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Page header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Company Account</h2>
          <p className="text-sm text-gray-500 mt-0.5">Your workspace and access details</p>
        </div>

        {/* ── ACCESS STATUS ─────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Access Status</span>
            </div>
          </div>
          <div className="p-5">
            {/* Green access badge */}
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-sm">
              <div className="w-10 h-10 bg-green-100 rounded-sm flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-green-800">Access included</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-green-600 text-white rounded-sm">Active</span>
                </div>
                <p className="text-xs text-green-700 mt-0.5 leading-relaxed">
                  Your access is included in your company subscription. Billing is managed by your account owner.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── COMPANY DETAILS ───────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Company Details</span>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InfoRow label="Company Name" value="Acme Consulting (Pty) Ltd" />
              <InfoRow label="Account Owner" value="Sipho Dlamini" />
              <div className="col-span-2">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Owner Contact</span>
                <p className="text-sm font-medium text-gray-800 mt-0.5">sipho@acme.co.za</p>
                <p className="text-xs text-gray-400 mt-0.5">Contact the owner for billing or access queries.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── YOUR PRIVATE DATA ─────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Private Data</span>
            </div>
          </div>
          <div className="p-5 space-y-4">

            {/* Key privacy message */}
            <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 border border-blue-100 rounded-sm">
              <Lock className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 leading-relaxed">
                <span className="font-semibold">Your receipts, invoices, reports and tax data remain private.</span>{" "}
                Sharing a billing account does not give others access to your financial records.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              <FeatureItem
                icon={Receipt}
                label="Receipts"
                desc="Only you can see your receipts and scanned documents."
              />
              <FeatureItem
                icon={FileText}
                label="Invoices & Quotes"
                desc="Your clients and billing history are visible only to you."
              />
              <FeatureItem
                icon={BarChart2}
                label="Reports & Tax Data"
                desc="Your expense reports and tax summaries are private to your account."
              />
            </div>
          </div>
        </div>

        {/* ── WHAT YOU CAN'T DO ─────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Billing & Admin</span>
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              Billing and team management are handled by the account owner. If you need a plan change or have billing questions, contact Sipho Dlamini.
            </p>
            <div className="space-y-2">
              {[
                "Upgrade or change the plan",
                "Cancel the subscription",
                "Invite or remove team members",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="w-4 h-4 rounded-sm border border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
