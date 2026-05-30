import "../envcrypt.js";
import { generateBriefing } from "../briefing.js";
import { sendHTML, isEnabled } from "../telegram.js";

async function main() {
  console.log("Checking if Telegram is enabled...");
  if (!isEnabled()) {
    console.error("Telegram is not enabled (missing token or chat ID)!");
    process.exit(1);
  }

  console.log("Generating briefing...");
  try {
    const briefingObj = await generateBriefing();
    const briefingText = typeof briefingObj === 'string' ? briefingObj : briefingObj.text;
    console.log("Briefing generated successfully:");
    console.log("-----------------------------------------");
    console.log(briefingText.replace(/<[^>]+>/g, "")); // Print stripped version to terminal console
    console.log("-----------------------------------------");

    console.log("Sending HTML briefing to Telegram...");
    const res = await sendHTML(briefingText);
    if (res) {
      console.log("Telegram response:", JSON.stringify(res));
      console.log("Briefing successfully sent!");
    } else {
      console.error("Failed to send briefing to Telegram.");
    }
  } catch (error) {
    console.error("Error occurred:", error);
    process.exit(1);
  }
}

main();
