import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import * as localDb from "./localDb.js";
let db;

if (SUPABASE_URL && SUPABASE_KEY) {
  // dynamic import supabase adapter
  const sup = await import("./supabaseDb.js");
  db = sup;
  console.log("[DB] Using Supabase adapter");
} else {
  db = localDb;
  console.log("[DB] Using local JSON adapter at ./data/db.json");
}

export const findComicByParam = db.findComicByParam;
export const insertComic = db.insertComic;
export const updateComic = db.updateComic;
export const findChapterByParam = db.findChapterByParam;
export const insertChapter = db.insertChapter;
export const insertPages = db.insertPages;
export const findPagesByChapterParam = db.findPagesByChapterParam;
export const listChaptersByComicParam = db.listChaptersByComicParam || (async (p)=>[]);
