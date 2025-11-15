import { fetchAllListPages } from "./listScraper.js";
import { fetchKomikDetail } from "./detailScraper.js";
import { fetchChapterPages } from "./chapterScraper.js";
import * as db from "../db/index.js";
import { info, warn } from "../logger.js";
import pLimit from "p-limit";
import { CONCURRENCY } from "../config.js";
import { chapterParamToNumber } from "../utils.js";

const limit = pLimit(CONCURRENCY);

export async function runScraper(startUrl){
  await fetchAllListPages(startUrl, async (pageObj) => {
    const items = pageObj.data || [];
    // process items sequentially or concurrently with limit
    const tasks = items.map(item => limit(()=> processKomikItem(item)));
    await Promise.all(tasks);
  });

  info("Finished scanning all pages.");
}

async function processKomikItem(item){
  try {
    const detailUrl = item.detail_url;
    const komik = await fetchKomikDetail(detailUrl);
    if (!komik) {
      warn("Empty komik detail for", item.param);
      return;
    }
    const param = komik.param;
    let existing = await db.findComicByParam(param);

    if (!existing) {
      info("New comic:", komik.title, "-> inserting metadata");
      const meta = {
        title: komik.title,
        param: komik.param,
        thumbnail: komik.thumbnail,
        genre: komik.genre,
        synopsis: komik.synopsis
      };
      await db.insertComic(meta);
      // scrape all chapters
      const chapters = komik.chapters || [];
      for (const ch of chapters.reverse()) {
        // we insert from oldest -> newest maybe (reverse for consistency)
        await processChapter(param, ch);
      }
    } else {
      // compare chapters
      const remoteChapters = komik.chapters || [];
      // build set of existing chapter params
      const toCheck = remoteChapters.map(c=>c.param);
      const missing = [];
      for (const rc of remoteChapters) {
        const has = await db.findChapterByParam(rc.param);
        if (!has) missing.push(rc);
      }
      if (missing.length === 0) {
        info("No new chapters for", param);
      } else {
        info("New chapters found for", param, missing.length, "-> scraping");
        // sort missing by extracted chapter number ascending so we insert in order
        missing.sort((a,b)=>{
          const na = chapterParamToNumber(a.param) ?? 0;
          const nb = chapterParamToNumber(b.param) ?? 0;
          return na - nb;
        });
        for (const ch of missing) {
          await processChapter(param, ch);
        }
        // update comic's updated_at
        await db.updateComic(param, { updated: new Date().toISOString() }).catch(()=>{});
      }
    }
  } catch (err) {
    warn("Failed to process item", item.param, err.message);
  }
}

async function processChapter(comic_param, ch){
  // ch: { chapter, param, release, detail_url }
  const exists = await db.findChapterByParam(ch.param);
  if (exists) {
    info("Chapter exists, skip:", ch.param);
    return;
  }
  // insert chapter meta
  await db.insertChapter(comic_param, ch);
  // fetch pages
  const images = await fetchChapterPages(ch.detail_url);
  await db.insertPages(ch.param, images);
  info(`Saved chapter ${ch.param} with ${images.length} images`);
}
