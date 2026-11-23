import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ownerPath = "/api/user/accountant-access";
type Invitation = {
  id: string;
  email: string;
  year: number;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

function status(invite: Invitation) {
  if (invite.revokedAt) return "Revoked";
  if (Date.parse(invite.expiresAt) <= Date.now()) return "Expired";
  return invite.acceptedAt ? "Active" : "Pending";
}

export function AccountantAccess() {
  const cache = useQueryClient();
  const query = useQuery<{ premium: boolean; invitations: Invitation[] }>({ queryKey: [ownerPath] });
  const [message, setMessage] = useState("");
  const year = new Date().getFullYear();
  const change = useMutation({
    mutationFn: (action: { id: string } | { email: string; year: number; days: number }) =>
      "id" in action ? apiRequest("DELETE", `${ownerPath}/${action.id}`) : apiRequest("POST", ownerPath, action),
    onSuccess: (_, action) => {
      setMessage("id" in action ? "Access revoked." : "Invitation emailed.");
      return cache.invalidateQueries({ queryKey: [ownerPath] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    change.mutate({ email: String(form.get("email")), year: Number(form.get("year")), days: Number(form.get("days")) });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-5">
      <Link href="/profile" className="text-sm underline">Back to settings</Link>
      <h1 className="text-2xl font-semibold">Accountant Access</h1>
      <p>Invite your accountant to view and download a tax report for one year.</p>
      {query.isLoading && <p>Loading invitations…</p>}
      {query.isError && <p>Could not load invitations. Accountant Access requires a verified workspace owner.</p>}
      {query.data && !query.data.premium && <p>An active Premium plan is required to send invitations and share reports.</p>}
      {query.data?.premium && (
        <form onSubmit={invite} className="space-y-3">
          <label className="block">Accountant email<Input name="email" type="email" maxLength={254} required /></label>
          <label className="block">Tax report year<Input name="year" type="number" min={1900} max={year} defaultValue={year} required /></label>
          <label className="block">Days of access<Input name="days" type="number" min={1} max={90} defaultValue={30} required /></label>
          <Button disabled={change.isPending} type="submit">Invite accountant</Button>
        </form>
      )}
      <p role="status">{message}</p>
      {query.data && <section className="space-y-3">
        <h2 className="text-lg font-semibold">Invitations</h2>
        {!query.data.invitations.length && <p>No invitations yet.</p>}
        {query.data.invitations.map(entry => (
          <div key={entry.id} className="space-y-2 rounded-md border p-3">
            <p className="break-all">{entry.email}</p>
            <p className="text-sm">{entry.year} tax report · {status(entry)} · Expires {new Date(entry.expiresAt).toLocaleDateString()}</p>
            {["Active", "Pending"].includes(status(entry)) &&
              <Button variant="outline" disabled={change.isPending} onClick={() => change.mutate({ id: entry.id })}>Revoke access</Button>}
          </div>
        ))}
      </section>}
    </main>
  );
}

export function AccountantReports() {
  const [, params] = useRoute("/accountant-reports/:id");
  const path = `/api/export/accountant-reports/${params?.id}`;
  const [token] = useState(() => window.location.hash.slice(1));
  const [signingIn, setSigningIn] = useState(Boolean(token));
  const [message, setMessage] = useState("");
  const [requesting, setRequesting] = useState(false);
  const report = useQuery<{ workspace: string; year: number }>({
    queryKey: [path], enabled: !signingIn, retry: false, staleTime: 0, gcTime: 0,
  });

  useEffect(() => {
    if (!token) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    fetch(`${path}/session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    }).catch(() => undefined).finally(() => setSigningIn(false));
  }, [path, token]);

  async function requestLink() {
    setRequesting(true);
    try {
      const response = await fetch(`${path}/link`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      setMessage(response.ok ? "If access is still active, check the invited email address for a link." : "Could not request a link. Try again later.");
    } catch {
      setMessage("Could not request a link. Try again later.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Shared tax report</h1>
      {(signingIn || report.isLoading) && <p>Checking report access…</p>}
      {report.data && <section className="space-y-3">
        <h2 className="text-lg font-semibold">{report.data.workspace}</h2>
        <p>{report.data.year} tax report</p>
        <div className="flex gap-4">
          <a className="underline" href={`${path}/pdf`} target="_blank" rel="noopener noreferrer">View</a>
          <a className="underline" href={`${path}/pdf?download=1`}>Download PDF</a>
        </div>
      </section>}
      {report.isError && <>
        <p>This report is unavailable. If the invitation is still active, you can request a new sign-in link.</p>
        <Button onClick={requestLink} disabled={requesting}>Email me a new link</Button>
        <p role="status">{message}</p>
      </>}
    </main>
  );
}
