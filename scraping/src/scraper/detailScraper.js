import http from "../http.js";
import { info } from "../logger.js";

export async function fetchKomikDetail(detailUrl){
  info("Fetching komik detail:", detailUrl);
  const data = await http.get(detailUrl);
  // expecting { data: { title, param, thumbnail, genre, synopsis, chapters: [...] } }
  return data?.data || null;
}
