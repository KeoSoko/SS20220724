export default function InviteEmail() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-xl">
        {/* Email client chrome */}
        <div className="bg-white rounded-sm shadow-xl overflow-hidden border border-gray-200">
          {/* Email header bar */}
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <div className="space-y-1 text-xs text-gray-500">
              <div><span className="font-medium text-gray-700">From:</span> Simple Slips &lt;noreply@simpleslips.co.za&gt;</div>
              <div><span className="font-medium text-gray-700">To:</span> member@example.com</div>
              <div><span className="font-medium text-gray-700">Subject:</span> You've been invited to join KeoraSoko's Workspace on Simple Slips</div>
            </div>
          </div>

          {/* Email body */}
          <div className="p-8">
            {/* Logo */}
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-light tracking-widest text-gray-700 uppercase">SIMPLE</span>
                <span className="text-xl font-bold italic text-[#0073AA]">SLIPS</span>
              </div>
            </div>

            {/* Greeting */}
            <p className="text-sm text-gray-700 mb-4">Hi there!</p>
            <p className="text-sm text-gray-700 mb-6 leading-relaxed">
              <strong>Keo Soko</strong> has invited you to join{' '}
              <strong>"KeoraSoko's Workspace"</strong> as a team member on Simple Slips — the AI-powered receipt and expense management platform.
            </p>

            {/* CTA button */}
            <div className="mb-6">
              <a
                href="#"
                className="inline-block bg-blue-600 text-white text-sm font-semibold px-6 py-3 rounded-sm no-underline"
                onClick={e => e.preventDefault()}
              >
                Accept Invitation
              </a>
            </div>

            {/* Details box */}
            <div className="bg-gray-50 border border-gray-200 rounded-sm p-4 mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What you'll get access to</p>
              <ul className="space-y-1.5 text-sm text-gray-700">
                {['Scan and manage receipts', 'View invoices and quotes', 'Access shared client list', 'Use AI tax assistant'].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-green-100 text-green-600 flex items-center justify-center rounded-full text-xs flex-shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Expiry notice */}
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-sm p-3 mb-6">
              <span className="text-amber-500 text-sm flex-shrink-0">⏱</span>
              <p className="text-xs text-amber-800 leading-relaxed">
                This invitation link expires in <strong>7 days</strong>. If you don't have a Simple Slips account yet, you'll need to sign up first, then accept the invitation.
              </p>
            </div>

            {/* Footer link */}
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
              If you weren't expecting this invite, you can safely ignore this email. The link won't work unless you click it.
            </p>
          </div>

          {/* Email footer */}
          <div className="bg-gray-50 border-t border-gray-200 px-8 py-4 text-center">
            <p className="text-xs text-gray-400">Simple Slips · South Africa · <a href="#" className="underline" onClick={e => e.preventDefault()}>Unsubscribe</a></p>
          </div>
        </div>

        <div className="text-center mt-3">
          <span className="text-xs text-gray-400 bg-white px-3 py-1 rounded-full shadow-sm border">
            Member's inbox — email they receive
          </span>
        </div>
      </div>
    </div>
  );
}
