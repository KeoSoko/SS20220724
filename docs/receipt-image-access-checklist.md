# Receipt image access: deployment verification

## What is and is not verified

Automated tests cover refresh recovery, classified storage outcomes, retry limits,
authorization and response-only links. A successful link response means only that
metadata was readable and a read-only link was generated; recovery is confirmed
when the browser loads the image.

The supplied screenshot is a browser fallback, not evidence of absent credentials
or of blob existence. No production secrets, live provider access, or the specific
receipt's blob have been verified as part of this fix.

Sanitized evidence on 2026-10-07: the restarted development app reported successful
Azure storage initialization. Existing deployment logs also showed successful
uploads for other receipts. Neither observation establishes access to the affected
receipt, validates the production refresh flow, or verifies production secrets.

## Authorized support checklist

1. Confirm the deployed build contains the fix and the server's existing esbuild
   `createRequire` compatibility banner. Development success alone does not prove
   the production ESM bundle can use Azure SDKs.
2. Check **production** secret presence and configuration through Replit's approved
   secrets flow, not chat, logs, screenshots or copied environment dumps.
   Effective precedence is `AZURE_STORAGE_CONNECTION_STRING` first; otherwise
   `SLIPSSTOR1_STORAGE_ACCOUNT_NAME` / `SLIPSSTOR1_STORAGE_ACCOUNT_KEY` each take
   precedence over `AZURE_STORAGE_ACCOUNT_NAME` / `AZURE_STORAGE_ACCOUNT_KEY`.
   The current fallback selects name and key independently: partial SLIPSSTOR1
   settings can mix accounts. Confirm the effective pair belongs to one account.
   A present but invalid connection string does not fall back to the other pair.
   SAS generation needs a shared account key, not a SAS-only connection string.
   Do not rotate credentials or change live secrets without separate approval.
3. Using authorized Azure access, confirm that the effective account matches the
   receipt's durable blob reference and that the private `receipt-images`
   container and exact blob exist. Do not recreate missing blobs or make the
   container public. An old signed URL expiring does not mean the blob is deleted.
4. Check Azure firewall, public-network settings, private endpoints and allowed
   networks. The deployed server must be able to read metadata; the customer's
   browser must also be able to reach the signed blob URL. A SAS does not bypass
   Azure network restrictions. Server success plus browser failure points to
   browser/network access or image content, not necessarily app configuration.
5. Check access tier and archive status. `archived` requires an authorized
   restoration decision; `rehydrating` means restoration is pending and may take
   hours. This refresh flow is read-only and does not initiate tier changes.
6. As an authorized receipt owner, open a receipt with an expired link. Confirm a
   refresh request returns `available`, then the browser loads the image. After
   three failed automatic refreshes, use **Retry Image** and confirm another
   attempt is possible. Trigger a background receipt refetch and navigate to
   another receipt: a fresh link must survive refetch and must not appear on the
   other receipt. Do not save HAR files or screenshots containing signed URLs.
7. Record only the build, time, HTTP status, returned access state, metadata-only
   provider status and whether the browser loaded the image. Do not record signed
   URLs, signature/query values, credentials, full Azure errors or image contents.
   The admin Command Center provider scan can supply sanitized read-only metadata
   when authorized; its database-only health queue does not establish existence.

## Interpret the refresh response

| State | Meaning / next step |
| --- | --- |
| `available` | Link generated; wait for browser load before declaring recovery. |
| `missing` (404) | No blob reference or Azure returned not found; check container/blob and account. |
| `configuration_unavailable` (503) | App cannot initialize/sign with its effective storage configuration; check approved secret settings. |
| `inaccessible` (403) | Azure denied access; check effective account/key, permissions and network restrictions. |
| `archived` / `rehydrating` (409) | Check archive restoration status; do not retry continuously. |
| `temporarily_unavailable` (503) | Timeout, throttling, provider/network or unexpected failure; retry later. |
| Browser-only load failure | Availability unconfirmed; do not infer missing configuration or promise the image exists. |

Receipt authentication and existing receipt ownership/workspace middleware still
apply before storage inspection. A generic receipt authorization 401/403 is not an
Azure access classification. Refreshed SAS URLs remain response-only, read-only,
private and `no-store`; never write them to receipt records.
