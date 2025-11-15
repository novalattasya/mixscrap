import http from "../http.js";
import pLimit from "p-limit";
import { CONCURRENCY } from "../config.js";
import { info, warn } from "../logger.js";

export async function fetchAllListPages(startUrl, onListPage){
  let url = startUrl;
  const limit = pLimit(CONCURRENCY);
  while (url) {
    info("Fetching list page:", url);
    const data = await http.get(url);
    if (!data || !data.data) {
      warn("No data field at", url);
      break;
    }
    // call handler
    await onListPage(data);

    // go to next page
    url = data.next_page || null;
  }
}
