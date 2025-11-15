import http from "../http.js";
import { info } from "../logger.js";

export async function fetchChapterPages(detailUrl){
  info("Fetching chapter pages:", detailUrl);
  const data = await http.get(detailUrl);
  // expecting { data: [ "url1", "url2", ... ] }
  return data?.data || [];
}
