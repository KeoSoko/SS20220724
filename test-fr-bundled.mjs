import{createRequire as __cjsRequire}from'module';const require=__cjsRequire(import.meta.url);

// test-fr.mts
import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer";
import { readFileSync } from "fs";
async function main() {
  const endpoint = process.env.AZURE_FORM_RECOGNIZER_ENDPOINT || "";
  const key = process.env.AZURE_FORM_RECOGNIZER_KEY || "";
  console.log("endpoint present:", !!endpoint, "| key present:", !!key, "| key length:", key.length);
  console.log("endpoint host:", endpoint.replace(/^https?:\/\//, "").split("/")[0]);
  const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
  const buffer = readFileSync(process.argv[2]);
  try {
    const poller = await client.beginAnalyzeDocument("prebuilt-receipt", buffer);
    const result = await poller.pollUntilDone();
    console.log("RESULT: SUCCESS \u2014 documents:", result.documents?.length ?? 0);
  } catch (e) {
    console.log("RESULT: ERROR \u2014", e.statusCode || "", e.code || "", e.message);
  }
}
main();
