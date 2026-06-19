---
name: drizzle-zod required server-injected fields break frontend forms
description: Why NOT NULL no-default columns (workspaceId/userId) in a drizzle insert schema silently break react-hook-form submission
---

Any column that is `NOT NULL` with no DB default becomes a **required** field in the schema produced by drizzle-zod's `createInsertSchema`. If a frontend form uses that schema directly as its `zodResolver` but has no input for that field (because the server injects it), react-hook-form validation fails on the missing required field and `handleSubmit` silently never fires — the user clicks the submit button and nothing happens, with no visible error.

**Why:** This bit the Clients form after the workspace migration added `workspaceId integer NOT NULL` (and `userId NOT NULL`) to business-hub tables. The server already injects `userId`/`workspaceId` from the authed session, so they must never be in the form's validation schema.

**How to apply:** For any form whose backend injects tenant/owner fields, derive a form-specific schema that omits them, e.g. `const formSchema = insertXSchema.omit({ userId: true, workspaceId: true })`, and type the form off that. Keep the full `insertXSchema` for server-side `.parse()` (server spreads req.body then sets userId/workspaceId). Suspect this pattern whenever a "create/add" button does nothing with no toast/network call. Quotation/invoice forms build payloads manually rather than via these resolvers, so they were not affected — but new forms should follow the omit pattern.
