import { UserPlus, Send, X } from 'lucide-react';

export default function InviteDialog() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6 font-sans">
      <div className="bg-white rounded-sm shadow-xl w-full max-w-md overflow-hidden">
        {/* Dialog header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">Invite Team Member</h2>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                Your team member will have full access to receipts, invoices and clients, but cannot manage billing or account settings.
              </p>
            </div>
            <button className="text-gray-400 hover:text-gray-600 mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Dialog body */}
        <div className="px-6 py-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email address</label>
            <input
              type="email"
              placeholder="member@example.com"
              className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              readOnly
            />
          </div>

          {/* Info notice */}
          <div className="mt-4 flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-sm p-3">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
            <p className="text-xs text-blue-800 leading-relaxed">
              They'll receive an email with a secure link to accept the invite. The link expires in <strong>7 days</strong>. If they don't have an account yet, they'll be asked to sign up first.
            </p>
          </div>
        </div>

        {/* Dialog footer */}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50">
            Cancel
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700">
            <Send className="h-4 w-4" />
            Send Invite
          </button>
        </div>
      </div>

      {/* Label below */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <span className="text-xs text-gray-400 bg-white px-3 py-1 rounded-full shadow-sm border">
          Owner's view — Company Account tab
        </span>
      </div>
    </div>
  );
}
