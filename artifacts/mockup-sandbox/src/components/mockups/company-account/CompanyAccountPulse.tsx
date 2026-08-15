import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  Copy,
  CreditCard,
  Mail,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";

type Activity = {
  initials: string;
  name: string;
  action: string;
  time: string;
  tone: string;
};

const activity: Activity[] = [
  { initials: "KM", name: "Kefilwe Mokoena", action: "sent an invoice", time: "12 min ago", tone: "bg-[#e6eee8] text-[#42604f]" },
  { initials: "TN", name: "Thabo Nkosi", action: "uploaded a receipt", time: "Yesterday", tone: "bg-[#f5e6d6] text-[#8b5932]" },
  { initials: "SD", name: "Sipho Dlamini", action: "renewed your plan", time: "21 Jun", tone: "bg-[#e8e6f1] text-[#5c567d]" },
];

function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] ${className}`}>{children}</span>;
}

function Member({ initials, name, role, tone }: { initials: string; name: string; role: string; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${tone}`}>{initials}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[#25322c]">{name}</p>
        <p className="text-[11px] text-[#89958e]">{role}</p>
      </div>
      <button aria-label={`More options for ${name}`} className="rounded-full p-1.5 text-[#a0aaa4] hover:bg-[#f1f4ef]">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}

export function CompanyAccountPulse() {
  const [activeTab, setActiveTab] = useState<"overview" | "team">("overview");
  const [showInvite, setShowInvite] = useState(false);
  const [showNotice, setShowNotice] = useState(true);
  const [copied, setCopied] = useState(false);

  const copyInvite = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="min-h-screen bg-[#f7f7f2] px-4 pb-8 pt-5 text-[#25322c]" style={{ fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif" }}>
      <div className="mx-auto w-full max-w-[430px]">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[#183d31] text-[#f4f1df]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8b978f]">Workspace</p>
              <h1 className="text-[17px] font-bold tracking-[-0.03em]">Acme Consulting</h1>
            </div>
          </div>
          <button aria-label="Notifications" className="relative rounded-full border border-[#e4e7dc] bg-[#fbfbf7] p-2.5 text-[#53635b] shadow-[0_2px_8px_rgba(38,55,46,0.04)]">
            <Bell className="h-[17px] w-[17px]" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#d46f43]" />
          </button>
        </header>

        <nav className="mb-5 flex gap-1 rounded-[14px] bg-[#ebece3] p-1">
          {(["overview", "team"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-[10px] py-2 text-[12px] font-bold capitalize transition ${activeTab === tab ? "bg-[#fbfbf7] text-[#183d31] shadow-sm" : "text-[#87928b]"}`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {showNotice && (
          <div className="relative mb-4 overflow-hidden rounded-[18px] bg-[#183d31] p-4 text-[#f7f4e5] shadow-[0_8px_24px_rgba(24,61,49,0.12)]">
            <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full border-[18px] border-[#35604c] opacity-60" />
            <button aria-label="Dismiss plan notice" onClick={() => setShowNotice(false)} className="absolute right-3 top-3 rounded-full p-1 text-[#aac1b4] hover:bg-[#2d5746]">
              <X className="h-3.5 w-3.5" />
            </button>
            <Pill className="bg-[#d9e6c8] text-[#34523d]">LITE TEAM</Pill>
            <p className="mt-3 text-[15px] font-bold tracking-[-0.02em]">Your workspace is in good shape.</p>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="text-[11px] text-[#b9cbbd]">Seats in use</p>
                <p className="mt-0.5 text-[25px] font-bold leading-none">3 <span className="text-[14px] font-medium text-[#b9cbbd]">/ 5</span></p>
              </div>
              <button onClick={() => setActiveTab("team")} className="flex items-center gap-1 rounded-full bg-[#f3efdd] px-3 py-2 text-[11px] font-bold text-[#284838]">
                Manage seats <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {activeTab === "overview" ? (
          <>
            <section className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-[18px] border border-[#e8e8de] bg-[#fbfbf7] p-4">
                <div className="mb-5 flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f2e4d6] text-[#aa633b]"><CircleDollarSign className="h-4 w-4" /></div>
                <p className="text-[11px] font-medium text-[#8b978f]">Next renewal</p>
                <p className="mt-1 text-[16px] font-bold">21 Jul 2026</p>
                <p className="mt-1 text-[11px] text-[#a0aaa4]">R245 / month</p>
              </div>
              <div className="rounded-[18px] border border-[#e8e8de] bg-[#fbfbf7] p-4">
                <div className="mb-5 flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#e4ebdf] text-[#52715b]"><ShieldCheck className="h-4 w-4" /></div>
                <p className="text-[11px] font-medium text-[#8b978f]">Privacy status</p>
                <p className="mt-1 text-[16px] font-bold">Protected</p>
                <p className="mt-1 text-[11px] text-[#a0aaa4]">Personal data stays private</p>
              </div>
            </section>

            <section className="mb-4 rounded-[18px] border border-[#e8e8de] bg-[#fbfbf7] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-bold">Recent activity</p>
                  <p className="mt-0.5 text-[11px] text-[#929d96]">Across your shared workspace</p>
                </div>
                <button className="flex items-center gap-0.5 text-[11px] font-bold text-[#47715a]">View all <ChevronRight className="h-3 w-3" /></button>
              </div>
              <div className="space-y-4">
                {activity.map((item) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${item.tone}`}>{item.initials}</div>
                    <div className="min-w-0 flex-1 text-[12px]"><span className="font-bold">{item.name}</span> <span className="text-[#87938c]">{item.action}</span></div>
                    <span className="whitespace-nowrap text-[10px] text-[#a0aaa4]">{item.time}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[18px] border border-[#e8e8de] bg-[#fbfbf7] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#eee9d7] text-[#a16d42]"><CreditCard className="h-4 w-4" /></div>
                <div className="flex-1"><p className="text-[13px] font-bold">Billing is looked after</p><p className="mt-1 text-[11px] leading-relaxed text-[#8b978f]">Sipho Dlamini owns this plan and receives billing emails.</p></div>
              </div>
              <button onClick={copyInvite} className="mt-4 flex w-full items-center justify-center gap-2 rounded-[11px] border border-[#e4e4d9] py-2.5 text-[11px] font-bold text-[#587264] hover:bg-[#f3f4ec]">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Contact copied" : "Copy owner contact"}
              </button>
            </section>
          </>
        ) : (
          <section className="rounded-[18px] border border-[#e8e8de] bg-[#fbfbf7] p-4">
            <div className="mb-4 flex items-center justify-between"><div><p className="text-[13px] font-bold">People in this workspace</p><p className="mt-0.5 text-[11px] text-[#929d96]">3 active · 1 invite pending</p></div><button onClick={() => setShowInvite(true)} className="flex items-center gap-1 rounded-full bg-[#183d31] px-3 py-2 text-[11px] font-bold text-[#f7f4e5]"><Plus className="h-3.5 w-3.5" /> Invite</button></div>
            <div className="space-y-4"><Member initials="SD" name="Sipho Dlamini" role="Owner · You" tone="bg-[#e8e6f1] text-[#5c567d]" /><Member initials="KM" name="Kefilwe Mokoena" role="Assistant" tone="bg-[#e6eee8] text-[#42604f]" /><Member initials="TN" name="Thabo Nkosi" role="Assistant" tone="bg-[#f5e6d6] text-[#8b5932]" /></div>
            <div className="mt-5 flex items-center gap-3 rounded-[13px] border border-dashed border-[#d9ddd0] bg-[#f7f7f2] p-3"><Mail className="h-4 w-4 text-[#98a49a]" /><div className="flex-1"><p className="text-[11px] font-bold text-[#69766e]">naledi@acme.co.za</p><p className="text-[10px] text-[#a0aaa4]">Invite pending · expires in 6 days</p></div><button className="text-[10px] font-bold text-[#a86340]">Cancel</button></div>
          </section>
        )}

        <p className="mt-6 text-center text-[10px] font-medium tracking-[0.08em] text-[#a9b0a8]">ACME CONSULTING · PRIVATE WORKSPACE</p>
      </div>

      {showInvite && (
        <div className="fixed inset-0 z-10 flex items-end justify-center bg-[#183d31]/30 p-3 backdrop-blur-[2px]">
          <div className="w-full max-w-[430px] rounded-[22px] bg-[#fbfbf7] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between"><div><p className="text-[16px] font-bold">Invite a teammate</p><p className="mt-1 text-[11px] text-[#8b978f]">They’ll only see their own financial records.</p></div><button onClick={() => setShowInvite(false)} className="rounded-full bg-[#eef0e7] p-2"><X className="h-4 w-4 text-[#52635a]" /></button></div>
            <label className="text-[11px] font-bold text-[#6d7a71]">Email address</label>
            <input autoFocus type="email" placeholder="name@company.com" className="mt-2 w-full rounded-[12px] border border-[#dfe3d8] bg-white px-3 py-3 text-[13px] outline-none focus:border-[#6a9277]" />
            <button onClick={() => setShowInvite(false)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#183d31] py-3 text-[12px] font-bold text-[#f7f4e5]"><Mail className="h-4 w-4" /> Send invitation</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default CompanyAccountPulse;