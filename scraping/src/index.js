import { API_BASE } from "./config.js";
import { info } from "./logger.js";
import { runScraper } from "./scraper/scraper.js";

async function main(){
  info("Starting komiku-scraper, api base:", API_BASE);
  try {
    await runScraper(API_BASE);
    info("All done.");
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

main();
