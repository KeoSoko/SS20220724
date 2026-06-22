import { createRequire } from "module";
import type { Response } from "express";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit");

const BRAND_BLUE = "#0073AA";
const DARK_TEXT = "#1a1a1a";
const BODY_TEXT = "#333333";
const LIGHT_GRAY = "#666666";
const RULE_COLOR = "#e0e0e0";

interface TocEntry {
  num: string;
  title: string;
  page: number; // 1-based
}

// ─── Manual content renderer ─────────────────────────────────────────────────
// Called twice: first pass to discover page numbers, second pass to produce
// the final PDF.  Pass 1 sends output to a throwaway sink; Pass 2 pipes to res.

function buildDoc(
  output: NodeJS.WritableStream,
  knownTocPages: number[] | null  // null = collecting phase; array = render phase
): { tocPages: number[] } {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 70, left: 60, right: 60 },
    bufferPages: false, // streaming mode — no post-hoc editing needed now
    info: {
      Title: "Simple Slips User Manual",
      Author: "Simple Slips",
      Subject: "Complete guide to using Simple Slips",
      Keywords: "receipts, expenses, tax, invoices, South Africa",
    },
  });

  doc.pipe(output);

  const PAGE_W = doc.page.width - 120;
  const PAGE_H = doc.page.height;

  // Tracks 1-based page number of the CURRENT page being written.
  let pageNumber = 1;

  const discoveredTocPages: number[] = [];

  function onNewPage() {
    pageNumber++;
    // Render footer on the completed previous page (happens on new-page event)
  }

  // PDFKit fires 'pageAdded' after every addPage()
  (doc as any).on("pageAdded", onNewPage);

  // Helper — footer on the CURRENT page (called before every addPage)
  function stampCurrentFooter() {
    // Skip cover (page 1) and (will skip back-cover at end)
    if (pageNumber <= 1) return;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(LIGHT_GRAY)
      .text(
        `Simple Slips User Manual  \u2013  Page ${pageNumber}`,
        60,
        PAGE_H - 40,
        { width: PAGE_W, align: "center" }
      );
  }

  function addPage() {
    stampCurrentFooter();
    doc.addPage();
  }

  function rule() {
    doc
      .moveTo(60, doc.y)
      .lineTo(60 + PAGE_W, doc.y)
      .strokeColor(RULE_COLOR)
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.5);
  }

  function sectionHeading(text: string): number {
    if (doc.y > PAGE_H - 160) addPage();
    const pg = pageNumber;
    doc.moveDown(0.8);
    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor(BRAND_BLUE)
      .text(text.toUpperCase(), 60, doc.y, { width: PAGE_W });
    doc.moveDown(0.25);
    rule();
    return pg;
  }

  function subHeading(text: string) {
    doc.moveDown(0.6);
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(DARK_TEXT)
      .text(text, 60, doc.y, { width: PAGE_W });
    doc.moveDown(0.3);
  }

  function body(text: string, indent = 0) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(BODY_TEXT)
      .text(text, 60 + indent, doc.y, { width: PAGE_W - indent, lineGap: 3 });
    doc.moveDown(0.3);
  }

  function bullet(text: string, level = 0) {
    const indent = 16 + level * 14;
    const mark = level === 0 ? "\u2022" : "\u2013";
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(BODY_TEXT)
      .text(`${mark}  ${text}`, 60 + indent, doc.y, {
        width: PAGE_W - indent,
        lineGap: 3,
      });
    doc.moveDown(0.2);
  }

  function numberedStep(n: number, text: string) {
    const indent = 16;
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(BODY_TEXT)
      .text(`${n}.  ${text}`, 60 + indent, doc.y, {
        width: PAGE_W - indent,
        lineGap: 3,
      });
    doc.moveDown(0.25);
  }

  function tip(text: string) {
    doc.moveDown(0.1);
    doc
      .font("Helvetica-Oblique")
      .fontSize(9.5)
      .fillColor("#005a8a")
      .text(`Tip:  ${text}`, 68, doc.y, {
        width: PAGE_W - 16,
        lineGap: 3,
      });
    doc.moveDown(0.4);
  }

  // ─── TOC renderer ───────────────────────────────────────────────────────────
  // tocPageNums: array of 1-based page numbers for each of the 14 sections,
  // or all zeros on the first pass.
  function drawToc(tocPageNums: number[]) {
    const tocEntries: TocEntry[] = [
      { num: "1",  title: "Introduction & What is Simple Slips",   page: tocPageNums[0]  ?? 0 },
      { num: "2",  title: "Getting Started",                        page: tocPageNums[1]  ?? 0 },
      { num: "3",  title: "Scanning & Uploading Receipts",          page: tocPageNums[2]  ?? 0 },
      { num: "4",  title: "Viewing & Managing Receipts",            page: tocPageNums[3]  ?? 0 },
      { num: "5",  title: "Categories",                             page: tocPageNums[4]  ?? 0 },
      { num: "6",  title: "Business Hub",                           page: tocPageNums[5]  ?? 0 },
      { num: "7",  title: "AI Tax Assistant",                       page: tocPageNums[6]  ?? 0 },
      { num: "8",  title: "Reports & Exports",                      page: tocPageNums[7]  ?? 0 },
      { num: "9",  title: "Recurring Expenses",                     page: tocPageNums[8]  ?? 0 },
      { num: "10", title: "Smart Search",                           page: tocPageNums[9]  ?? 0 },
      { num: "11", title: "Workspace & Team Features",              page: tocPageNums[10] ?? 0 },
      { num: "12", title: "Account Settings",                       page: tocPageNums[11] ?? 0 },
      { num: "13", title: "Subscription & Billing",                 page: tocPageNums[12] ?? 0 },
      { num: "14", title: "Frequently Asked Questions",             page: tocPageNums[13] ?? 0 },
    ];

    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor(BRAND_BLUE)
      .text("Table of Contents", 60, doc.y, { width: PAGE_W });
    doc.moveDown(0.25);
    rule();

    const numColW = 24;
    const pageNumColW = 32;
    const titleColW = PAGE_W - numColW - pageNumColW - 8;

    tocEntries.forEach((entry) => {
      const y = doc.y;

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(BRAND_BLUE)
        .text(entry.num + ".", 60, y, { width: numColW, lineBreak: false });

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(BODY_TEXT)
        .text(entry.title, 60 + numColW, y, {
          width: titleColW,
          lineBreak: false,
        });

      // Dot leader
      const approxTitleW = Math.min(
        doc.widthOfString(entry.title),
        titleColW - 2
      );
      const dotsStart = 60 + numColW + approxTitleW + 4;
      const dotsEnd = 60 + PAGE_W - pageNumColW - 4;
      if (dotsEnd > dotsStart) {
        const dotW = doc.widthOfString(".");
        const dotCount = Math.max(0, Math.floor((dotsEnd - dotsStart) / dotW));
        if (dotCount > 0) {
          doc
            .font("Helvetica")
            .fontSize(10)
            .fillColor(LIGHT_GRAY)
            .text(".".repeat(dotCount), dotsStart, y, {
              width: dotsEnd - dotsStart + dotW,
              lineBreak: false,
            });
        }
      }

      // Page number
      if (entry.page > 0) {
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(DARK_TEXT)
          .text(String(entry.page), 60 + PAGE_W - pageNumColW, y, {
            width: pageNumColW,
            align: "right",
            lineBreak: false,
          });
      }

      doc.moveDown(0.6);
    });
  }

  // ─── COVER PAGE ─────────────────────────────────────────────────────────────

  doc.rect(0, 0, doc.page.width, 280).fillColor(BRAND_BLUE).fill();

  doc
    .font("Helvetica-Bold")
    .fontSize(36)
    .fillColor("#ffffff")
    .text("Simple Slips", 0, 90, { align: "center", width: doc.page.width });

  doc
    .font("Helvetica")
    .fontSize(16)
    .fillColor("#cce8f6")
    .text("AI-Powered Receipt Management", 0, 145, {
      align: "center",
      width: doc.page.width,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor("#ffffff")
    .text("User Manual", 0, 185, { align: "center", width: doc.page.width });

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#cce8f6")
    .text(dateStr, 0, 230, { align: "center", width: doc.page.width });

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(BODY_TEXT)
    .text(
      "This manual covers every feature of Simple Slips — from scanning your first receipt to generating a tax report. Keep it as a quick reference whenever you need it.",
      80,
      310,
      { width: PAGE_W + 0, lineGap: 5, align: "center" }
    );

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(LIGHT_GRAY)
    .text("support@simpleslips.co.za  \u00B7  www.simpleslips.co.za", 0, 390, {
      align: "center",
      width: doc.page.width,
    });

  // ─── TABLE OF CONTENTS ──────────────────────────────────────────────────────

  addPage();
  drawToc(knownTocPages ?? new Array(14).fill(0));

  // ─── SECTION 1 ──────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("1. Introduction & What is Simple Slips"));

  body(
    "Simple Slips is a South African AI-powered receipt management system designed for individuals and small businesses. It removes the hassle of manual bookkeeping by automatically scanning, reading, and categorising your receipts — saving you time and helping you stay tax-ready year-round."
  );

  subHeading("Who is it for?");
  bullet("Freelancers and sole traders who need to track business expenses.");
  bullet("Small business owners managing invoices, quotes, and receipts.");
  bullet("Individuals who want to understand their spending and claim tax deductions.");

  subHeading("What can Simple Slips do?");
  bullet("Scan paper receipts with your phone camera or upload photos and PDFs.");
  bullet("Automatically read the store name, date, and total using AI.");
  bullet("Categorise expenses into 24 preset categories, or your own custom ones.");
  bullet("Generate professional invoices and quotations for your clients.");
  bullet("Produce detailed spending reports and CSV exports for your accountant.");
  bullet("Answer South African tax questions through an AI chat assistant.");
  bullet("Work as a team — invite colleagues to share a workspace.");

  tip(
    "Simple Slips is built specifically for the South African market. Currency is displayed in Rands (R) and tax advice is tailored to SARS regulations."
  );

  // ─── SECTION 2 ──────────────────────────────────────────────────────────────

  discoveredTocPages.push(sectionHeading("2. Getting Started"));

  subHeading("Creating an Account");
  numberedStep(1, "Open Simple Slips in your web browser or mobile app.");
  numberedStep(2, 'Tap "Sign Up" on the login screen.');
  numberedStep(3, "Enter your name, a username, your email address, and a password.");
  numberedStep(4, 'Tap "Create Account". Your 30-day free trial starts immediately.');
  numberedStep(5, "Check your inbox for a verification email and click the link inside.");

  tip("You can use most features during your free trial without verifying your email, but exports and tax reports require verification.");

  subHeading("Promo Codes");
  body("If you have a promotional code, enter it on the sign-up screen to extend your free trial. Promo codes are case-insensitive.");

  subHeading("Logging In");
  body("You can log in using either your username or your email address together with your password. Passwords are case-sensitive.");

  subHeading("Email Verification");
  body("After signing up, Simple Slips sends a verification link to your email. Click that link to unlock full access. If you didn't receive it:");
  numberedStep(1, "Go to Profile > Account Settings.");
  numberedStep(2, 'Click "Resend Verification Email".');
  numberedStep(3, "Check your spam folder if it still doesn't arrive.");

  // ─── SECTION 3 ──────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("3. Scanning & Uploading Receipts"));

  subHeading("Camera Scan");
  body("The camera scan is the fastest way to capture a paper receipt on your phone.");
  numberedStep(1, 'Tap the "+" or "Upload Receipt" button on the home screen.');
  numberedStep(2, 'Choose "Camera" and allow camera access when prompted.');
  numberedStep(3, "Hold your phone over the receipt so that it fills the frame.");
  numberedStep(4, "Tap the shutter button to capture the image.");
  numberedStep(5, "Simple Slips will automatically extract the store name, date, total, and items.");
  numberedStep(6, 'Review the details, make any corrections, then tap "Save".');

  tip("Good lighting makes a big difference. Avoid shadows across the receipt and try to keep the paper flat.");

  subHeading("File Upload");
  body("To upload an existing photo or PDF from your device:");
  numberedStep(1, 'Tap "Upload Receipt" and choose "File Upload".');
  numberedStep(2, "Select a JPEG, PNG, BMP, or PDF file from your device.");
  numberedStep(3, "Simple Slips will process the file and fill in the details.");
  numberedStep(4, 'Review and tap "Save".');

  subHeading("PDF Receipts");
  body("Simple Slips handles PDF receipts in two ways. For digital PDFs (e.g., a Pick n Pay online order), it extracts text directly — fast and very accurate. For scanned PDFs, it converts each page to an image and uses Azure OCR. You can view the original PDF in the receipt detail screen.");

  subHeading("Email-to-Receipt");
  body("Forward any receipt email to your personal Simple Slips email address and it will appear in your receipt list automatically.");
  numberedStep(1, "Go to Profile > Account Settings.");
  numberedStep(2, "Find your unique receipt email address (e.g., you@receipts.simpleslips.co.za).");
  numberedStep(3, "Forward receipt emails to that address from any email client.");
  numberedStep(4, "Receipts from supported senders (Pick n Pay, Takealot, Checkers, Amazon, Uber Eats) are processed automatically. Others are processed with AI.");

  tip("Inline or embedded images inside emails are always ignored — only actual receipt attachments and email body content are processed.");

  subHeading("Batch Gallery Import");
  body('You can import multiple receipt images at once. Tap "Upload" and choose "Gallery" to select several photos. A progress indicator shows how many have been processed.');

  subHeading("Continuous Scanning Mode");
  body("Use continuous scanning when you have a stack of paper receipts to capture. After saving one receipt, the camera reopens immediately so you can scan the next one without returning to the menu.");

  // ─── SECTION 4 ──────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("4. Viewing & Managing Receipts"));

  subHeading("Receipt List");
  body("The Receipts screen shows all your captured receipts in reverse chronological order. Each card displays the store name, date, category, and total.");

  subHeading("Filters & Sorting");
  body("Tap the filter icon to narrow down your receipts:");
  bullet("Date range — e.g., 'This month' or a custom date window.");
  bullet("Amount range — show only receipts within a spend range.");
  bullet("Category — show only a specific expense category.");
  bullet("Search — find receipts by store name or keyword.");

  subHeading("Editing a Receipt");
  numberedStep(1, "Tap on any receipt to open its detail view.");
  numberedStep(2, 'Tap the "Edit" button.');
  numberedStep(3, "Change the store name, date, amount, category, or notes.");
  numberedStep(4, 'Tap "Save Changes".');

  tip("If you correct the category for a particular store, Simple Slips remembers that choice and applies it automatically next time you capture a receipt from the same store.");

  subHeading("Splitting a Receipt");
  body("If a single receipt covers multiple expense categories (e.g., grocery shopping that includes both personal and business items), you can split it:");
  numberedStep(1, "Open the receipt detail.");
  numberedStep(2, 'Tap "Split Receipt".');
  numberedStep(3, "Enter the amounts and categories for each portion.");
  numberedStep(4, 'Tap "Save". The original receipt is replaced by the split items.');

  subHeading("Deleting a Receipt");
  body('Open the receipt and tap "Delete". You will be asked to confirm. Deleted receipts cannot be recovered.');

  subHeading("Tax Deductible Flag");
  body("Mark any receipt as tax deductible by toggling the option in the receipt detail view. Tax-deductible totals are highlighted in reports and exports.");

  // ─── SECTION 5 ──────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("5. Categories"));

  subHeading("Preset Categories");
  body("Simple Slips includes 24 built-in expense categories optimised for the South African market:");

  const cats = [
    "Groceries", "Dining & Takeaways", "Fuel & Transport", "Vehicle",
    "Medical & Health", "Clothing & Apparel", "Home & Garden", "Electronics & Technology",
    "Entertainment", "Travel & Accommodation", "Education & Training", "Professional Services",
    "Insurance", "Banking & Finance", "Utilities", "Telecommunications",
    "Office & Stationery", "Repairs & Maintenance", "Gifts & Donations", "Subscriptions",
    "Sports & Fitness", "Beauty & Personal Care", "Pets", "Other",
  ];

  const half = Math.ceil(cats.length / 2);
  const col1 = cats.slice(0, half);
  const col2 = cats.slice(half);
  const colWidth = (PAGE_W - 20) / 2;
  const catStartY = doc.y;

  col1.forEach((cat, i) => {
    doc.font("Helvetica").fontSize(10).fillColor(BODY_TEXT)
       .text(`\u2022 ${cat}`, 76, catStartY + i * 16, { width: colWidth });
  });
  col2.forEach((cat, i) => {
    doc.font("Helvetica").fontSize(10).fillColor(BODY_TEXT)
       .text(`\u2022 ${cat}`, 76 + colWidth + 20, catStartY + i * 16, { width: colWidth });
  });

  doc.y = catStartY + half * 16 + 8;
  doc.moveDown(0.5);

  subHeading("Custom Categories");
  body("You can create your own categories beyond the 24 presets:");
  numberedStep(1, "Go to Profile > Account Settings > Expense Categories.");
  numberedStep(2, 'Tap "Add Category" and enter a name.');
  numberedStep(3, "Your custom category appears in all filter and edit menus.");

  tip("Renaming a custom category updates all receipts that use it automatically — your history stays consistent.");

  subHeading("Merchant Learning");
  body("When you manually assign a category to a receipt, Simple Slips saves that preference for the merchant. Future receipts from the same store will be auto-categorised the same way — no AI needed.");
  body("If you reassign a category for a merchant, the stored preference is updated immediately.");

  // ─── SECTION 6 ──────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("6. Business Hub"));

  body("The Business Hub is the command centre for freelancers and small business owners. It lets you manage clients, create quotations, send invoices, and track payments — all in one place.");

  subHeading("Business Profile");
  body("Before sending any documents, set up your business profile. Go to Business Hub > Business Profile and fill in:");
  bullet("Business name and registration number.");
  bullet("Logo (optional).");
  bullet("Contact details and physical address.");
  bullet("VAT number (if registered for VAT).");
  bullet("Bank details and payment terms.");

  subHeading("Clients");
  numberedStep(1, "Go to Business Hub > Clients.");
  numberedStep(2, "Tap \"Add Client\" and enter the client's name, email, and address.");
  numberedStep(3, "Saved clients can be selected quickly when creating quotes or invoices.");

  subHeading("Quotations");
  body("A quotation is a formal document that outlines the price for goods or services before work begins.");
  numberedStep(1, 'Go to Business Hub > Quotations and tap the "+" button.');
  numberedStep(2, "Select a client or enter ad-hoc client details.");
  numberedStep(3, "Add line items with descriptions, quantities, and unit prices.");
  numberedStep(4, "Set an expiry date and any notes.");
  numberedStep(5, 'Tap "Save". You can preview, email, or download the quotation as a PDF.');

  tip("Quotation numbers are assigned automatically and reset each year — for example, QUO-2025-001. You can also draft AI-written emails for your quotes.");

  subHeading("Invoices");
  body("Invoices work the same way as quotations but represent a payment request.");
  numberedStep(1, "Create a new invoice from scratch, or convert a quotation to an invoice in one tap.");
  numberedStep(2, "Add your line items, due date, and payment details.");
  numberedStep(3, "Email the invoice to your client directly from the app. Simple Slips attaches a professionally styled PDF automatically.");
  numberedStep(4, "Record payments against an invoice once the client pays. The status changes from Unpaid to Partially Paid or Paid.");

  subHeading("Dashboard Analytics");
  body("The Business Hub dashboard shows at a glance: total outstanding, overdue invoices, revenue this month, and conversion rate of quotes to invoices.");

  // ─── SECTION 7 ──────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("7. AI Tax Assistant"));

  body("The AI Tax Assistant is a built-in chatbot powered by GPT-4o. It answers questions about South African tax in plain language, based on your actual receipt data.");

  subHeading("How to Use It");
  numberedStep(1, 'Open the "Tax" section from the main menu.');
  numberedStep(2, "Type your question in the chat box.");
  numberedStep(3, "The assistant replies within a few seconds.");

  subHeading("Example Questions");
  bullet("'Which of my expenses are tax deductible?'");
  bullet("'How much did I spend on home office costs this year?'");
  bullet("'What records do I need for a SARS audit?'");
  bullet("'Can I claim my car insurance as a business expense?'");

  subHeading("Important Limitations");
  body("The AI Tax Assistant provides general guidance based on publicly known South African tax law. It is not a substitute for advice from a qualified tax practitioner or accountant. For complex tax matters, always consult a professional.");

  tip("The assistant is aware of your spending categories and totals, so it can give contextually relevant answers — not just generic advice.");

  // ─── SECTION 8 ──────────────────────────────────────────────────────────────

  discoveredTocPages.push(sectionHeading("8. Reports & Exports"));

  subHeading("PDF Expense Report");
  body("Generate a branded PDF summary of your spending for any date range. Go to Exports and choose PDF. The report includes:");
  bullet("Spending by category.");
  bullet("Total spend and number of receipts.");
  bullet("Tax-deductible subtotal.");
  bullet("A full list of individual receipts.");

  subHeading("CSV Export");
  body("Download a spreadsheet-compatible CSV file for further analysis in Excel or Google Sheets, or to hand to your accountant.");
  numberedStep(1, "Go to Exports > CSV.");
  numberedStep(2, "Select your date range and any category filter.");
  numberedStep(3, 'Tap "Export" and the file downloads to your device.');

  subHeading("Tax Report");
  body("The Tax Report groups your deductible expenses by category and shows totals per financial year. It is formatted to help you complete your SARS return or provide to a tax professional.");

  tip("Email verification is required to access Exports and Tax Reports. This protects your financial data.");

  subHeading("Profit & Loss Summary");
  body("If you use the Business Hub, the Profit & Loss view shows your invoiced revenue versus your captured expenses over any period — giving you a quick view of business performance.");

  // ─── SECTION 9 ──────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("9. Recurring Expenses"));

  body("Simple Slips automatically detects when the same expense appears on a regular basis — for example, a monthly streaming subscription or weekly fuel fill-up. These are flagged as recurring expenses.");

  subHeading("Viewing Recurring Expenses");
  body('Go to "Recurring Expenses" from the main navigation. You will see a list of detected patterns, including the merchant name, typical amount, and next predicted date.');

  subHeading("How Detection Works");
  body("The system looks for receipts from the same merchant appearing at regular intervals (weekly, fortnightly, monthly, or annually). It needs at least two matching instances to flag a pattern.");

  subHeading("Managing Recurring Items");
  bullet("Confirm a recurring pattern to lock it in as a known recurring expense.");
  bullet("Dismiss a pattern if it was a coincidence and you don't want to track it.");
  bullet("Receive a notification when a predicted payment date is approaching.");

  tip("Recurring expense tracking is especially useful for budgeting — you can see upcoming commitments before they hit your account.");

  // ─── SECTION 10 ─────────────────────────────────────────────────────────────

  discoveredTocPages.push(sectionHeading("10. Smart Search"));

  body("Smart Search lets you find receipts using everyday language instead of exact keywords.");

  subHeading("Using Smart Search");
  numberedStep(1, 'Tap the "Search" icon or go to the Search screen.');
  numberedStep(2, "Type a question or description in the search bar.");
  numberedStep(3, "Results appear ranked by relevance.");

  subHeading("Example Searches");
  bullet("'Coffee last month'");
  bullet("'Fuel expenses over R500'");
  bullet("'Grocery spending in March'");
  bullet("'Pick n Pay receipts this year'");
  bullet("'All medical receipts'");

  subHeading("How It Works");
  body("Smart Search uses GPT-4o to interpret your query. If the AI finds a strong match, it returns AI-ranked results. For simpler queries, a fast text-match fallback is used. Results are returned in under a second.");

  // ─── SECTION 11 ─────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("11. Workspace & Team Features"));

  body("Every Simple Slips account belongs to a workspace. On a Team plan, you can invite colleagues or employees to join your workspace so you all see and manage the same receipts, clients, and invoices.");

  subHeading("Roles");
  body("There are three roles in a workspace:");
  bullet("Owner — full access including billing, invitations, and team management.");
  bullet("Editor — can add and edit receipts, clients, quotations, and invoices.");
  bullet("Viewer — can view all workspace data but cannot make changes.");

  subHeading("Inviting a Team Member");
  numberedStep(1, "Go to Profile and scroll to the Workspace section.");
  numberedStep(2, 'Tap "Invite Member".');
  numberedStep(3, "Enter the person's email address and choose their role.");
  numberedStep(4, 'Tap "Send Invite". They will receive an email with a secure link.');
  numberedStep(5, "Once they accept, they appear in the Members list and can start working.");

  subHeading("Accepting an Invitation");
  numberedStep(1, "Click the link in the invitation email.");
  numberedStep(2, "Log in or create a new Simple Slips account if you don't have one.");
  numberedStep(3, "You will be added to the workspace automatically.");

  subHeading("Seat Limits");
  body("Each Team plan tier allows a fixed number of seats. If your workspace is full, upgrade your plan or remove an existing member before sending a new invitation.");

  subHeading("Removing a Member");
  body("The workspace owner can remove any member (except themselves) from the Members list. Removed members lose access immediately.");

  // ─── SECTION 12 ─────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("12. Account Settings"));

  subHeading("Profile Information");
  body("Go to Profile to update:");
  bullet("Display name and email address.");
  bullet("Phone number.");
  bullet("Date of birth and gender (optional).");
  bullet("Postal address (used on invoices if no business address is set).");

  subHeading("Changing Your Password");
  numberedStep(1, "Go to Profile > Account Security.");
  numberedStep(2, 'Tap "Change Password".');
  numberedStep(3, "Enter your current password, then your new password twice.");
  numberedStep(4, 'Tap "Update Password".');

  subHeading("Business Profile");
  body("Configure your business details under Business Hub > Business Profile. These details appear on all quotations and invoices you send.");

  subHeading("Receipt Email Address");
  body("Find your unique receipt email address in Profile > Account Settings. Forward receipt emails to this address to add them to your account automatically.");

  subHeading("Clearing Your Data");
  body("You can delete all receipts from your account without closing your account. Go to Profile > Account Security and use the Clear Data option. You will be asked to confirm your password.");

  subHeading("Deleting Your Account");
  body("To permanently delete your account and all data, go to Profile > Account Security > Delete Account. Enter your password and type CONFIRM to proceed. This action is irreversible.");

  tip("Account deletion removes all receipts, clients, invoices, and workspace data permanently. Make sure to export anything you need first.");

  // ─── SECTION 13 ─────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("13. Subscription & Billing"));

  subHeading("Free Trial");
  body("All new accounts start with a 30-day free trial. During the trial, you have full access to all features. No credit card is required to start.");

  subHeading("Plans");
  body("After your trial, choose a plan that suits you:");
  bullet("Personal Monthly — R49/month. Ideal for individuals tracking personal or freelance expenses.");
  bullet("Personal Yearly — R530/year (saves ~10% vs monthly). Same features, billed once a year.");
  bullet("Team plans — available for workspaces with multiple members. Priced per the number of seats.");

  subHeading("Upgrading or Changing Plans");
  numberedStep(1, "Go to Profile > Subscription & Billing, or navigate to /subscription.");
  numberedStep(2, "Choose your desired plan and billing period.");
  numberedStep(3, 'Tap "Subscribe". You will be redirected to Paystack to complete payment.');
  numberedStep(4, "Paystack handles the transaction securely. Your card details are never stored by Simple Slips.");

  subHeading("Cancelling");
  numberedStep(1, "Go to Profile > Subscription & Billing.");
  numberedStep(2, 'Tap "Cancel Subscription".');
  numberedStep(3, "Your access continues until the end of your current billing period. You will not be charged again.");

  subHeading("Payment Failures");
  body("If a recurring payment fails, Simple Slips will send you an email notification. You have a grace period to update your payment method on Paystack before your access is suspended.");

  subHeading("Payment History");
  body("Go to Profile > Payment History to see a log of all transactions, including dates, amounts, and statuses.");

  tip("All payments are processed by Paystack, a leading South African payment gateway. Simple Slips never stores your card details.");

  // ─── SECTION 14 ─────────────────────────────────────────────────────────────

  addPage();
  discoveredTocPages.push(sectionHeading("14. Frequently Asked Questions"));

  const faqs = [
    {
      q: "Can I use Simple Slips on my phone?",
      a: "Yes. Simple Slips is a Progressive Web App (PWA) that works on any modern smartphone browser. On Android, you can install it to your home screen for a near-native experience. iOS users can also use the 'Add to Home Screen' option in Safari.",
    },
    {
      q: "How accurate is the AI receipt scanning?",
      a: "For clear, well-lit photos of printed receipts, accuracy is typically above 90% for the total amount and store name. Handwritten receipts or very low-quality photos may require manual correction. The more you correct the AI, the better the merchant learning system becomes.",
    },
    {
      q: "Is my financial data secure?",
      a: "Yes. Receipt images are stored securely on Azure Blob Storage. All data is encrypted in transit and at rest. Simple Slips never sells or shares your data with third parties.",
    },
    {
      q: "What happens to my data if I cancel my subscription?",
      a: "Your data is retained for a period after cancellation. We recommend exporting your receipts as a CSV before cancelling if you want a permanent local copy.",
    },
    {
      q: "Can I claim VAT on receipts captured in Simple Slips?",
      a: "Simple Slips shows you your spending data and can flag tax-deductible items, but you are responsible for determining VAT applicability. Consult a registered tax practitioner for VAT claims.",
    },
    {
      q: "Why is the AI Tax Assistant giving me unexpected answers?",
      a: "The AI works best with clear, specific questions. Try to be specific (e.g., 'Can I claim my home internet as a work-from-home deduction?'). The assistant is not connected to live SARS data and its knowledge has a training cutoff date.",
    },
    {
      q: "Can I forward receipts from Gmail or Outlook?",
      a: "Yes. Simply forward any receipt email to your Simple Slips receipt email address. The system processes both the email body and any attached PDFs or images.",
    },
    {
      q: "Does Simple Slips support multiple currencies?",
      a: "At this time, Simple Slips is optimised for South African Rands (R). Receipts in foreign currencies will be captured as-is, but reporting is in Rands only.",
    },
    {
      q: "I lost my password. How do I reset it?",
      a: "On the login screen, tap 'Forgot Password'. Enter your email address and check your inbox for a reset link. Links expire after a short period for security.",
    },
    {
      q: "How do I contact support?",
      a: "Go to Profile > Account Settings > Contact Support and fill in the form. You can also email support@simpleslips.co.za directly.",
    },
  ];

  faqs.forEach((faq, i) => {
    if (doc.y > PAGE_H - 120) addPage();
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(DARK_TEXT)
       .text(`Q${i + 1}: ${faq.q}`, 60, doc.y, { width: PAGE_W });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10).fillColor(BODY_TEXT)
       .text(faq.a, 76, doc.y, { width: PAGE_W - 16, lineGap: 3 });
    doc.moveDown(0.7);
  });

  // ─── BACK COVER ──────────────────────────────────────────────────────────────

  // Do NOT stamp footer on back cover — just add a blank page
  doc.addPage(); // Raw addPage — pageAdded fires but we handle footer skipping via pageNumber check

  doc.rect(0, 0, doc.page.width, doc.page.height).fillColor(BRAND_BLUE).fill();

  doc.font("Helvetica-Bold").fontSize(28).fillColor("#ffffff")
     .text("Simple Slips", 0, 200, { align: "center", width: doc.page.width });

  doc.font("Helvetica").fontSize(14).fillColor("#cce8f6")
     .text("AI-Powered Receipt Management", 0, 245, { align: "center", width: doc.page.width });

  doc.font("Helvetica").fontSize(11).fillColor("#cce8f6")
     .text("support@simpleslips.co.za", 0, 310, { align: "center", width: doc.page.width });

  doc.font("Helvetica").fontSize(11).fillColor("#cce8f6")
     .text("www.simpleslips.co.za", 0, 335, { align: "center", width: doc.page.width });

  doc.font("Helvetica-Oblique").fontSize(9).fillColor("#a3c8e0")
     .text(
       "\u00A9 Simple Slips. All rights reserved. This document is provided for informational purposes only.",
       60,
       PAGE_H - 80,
       { align: "center", width: PAGE_W }
     );

  doc.end();

  return { tocPages: discoveredTocPages };
}

// ─── Public entry point ──────────────────────────────────────────────────────

export function generateUserManual(res: Response): void {
  // Pass 1: dry run into a null sink to collect exact page numbers
  const { tocPages } = buildDoc(devNull(), null);

  // Pass 2: render final PDF with correct TOC page numbers piped to response
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="Simple-Slips-User-Manual.pdf"'
  );
  res.setHeader("Cache-Control", "public, max-age=86400");

  buildDoc(res, tocPages);
}

// A writable stream that discards all data (for the dry-run pass)
function devNull(): NodeJS.WritableStream {
  const { Writable } = require("stream");
  return new Writable({ write(_chunk: any, _enc: any, cb: any) { cb(); } });
}
