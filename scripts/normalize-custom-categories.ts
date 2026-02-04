import { db } from "../server/db";
import { receipts } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

const CUSTOM_CATEGORY_REGEX = /\[Custom Category: (.*?)\]/i;

function normalizeNotesWithCustomCategory(notes: string | null, customLabel: string): string {
  const cleanedNotes = notes
    ? notes.replace(CUSTOM_CATEGORY_REGEX, "").trim()
    : "";

  const prefix = `[Custom Category: ${customLabel}]`;
  return cleanedNotes ? `${prefix} ${cleanedNotes}` : prefix;
}

async function run() {
  const receiptRows = await db
    .select({
      id: receipts.id,
      category: receipts.category,
      notes: receipts.notes,
    })
    .from(receipts)
    .where(sql`${receipts.notes} ILIKE '%[Custom Category:%]'`);

  let updatedCount = 0;

  for (const receipt of receiptRows) {
    const match = receipt.notes?.match(CUSTOM_CATEGORY_REGEX);
    const customLabel = match?.[1]?.trim();

    if (!customLabel) {
      continue;
    }

    const normalizedNotes = normalizeNotesWithCustomCategory(receipt.notes, customLabel);
    const needsCategoryUpdate = receipt.category !== "other";
    const needsNotesUpdate = receipt.notes !== normalizedNotes;

    if (!needsCategoryUpdate && !needsNotesUpdate) {
      continue;
    }

    await db
      .update(receipts)
      .set({
        category: "other",
        notes: normalizedNotes
      })
      .where(eq(receipts.id, receipt.id));

    updatedCount += 1;
  }

  console.log(`Normalized ${updatedCount} receipts with custom category notes.`);
}

run().catch(error => {
  console.error("Failed to normalize custom category notes:", error);
  process.exit(1);
});
