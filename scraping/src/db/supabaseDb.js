import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { error, info } from "../logger.js";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Supabase config missing");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function findComicByParam(param){
  const { data, error: err } = await supabase.from("comics").select("*").eq("param", param).limit(1).single();
  if (err && err.code !== "PGRST116") { // not found etc
    throw err;
  }
  return data || null;
}

export async function insertComic(meta){
  const now = new Date().toISOString();
  const payload = {
    title: meta.title,
    param: meta.param,
    thumbnail: meta.thumbnail || null,
    genre: meta.genre || [],
    synopsis: meta.synopsis || "",
    created_at: now,
    updated_at: now
  };
  const { data, error: err } = await supabase.from("comics").insert(payload).select().single();
  if (err) throw err;
  return data;
}

export async function updateComic(param, patch){
  const now = new Date().toISOString();
  const { data, error: err } = await supabase.from("comics").update({ ...patch, updated_at: now }).eq("param", param).select().single();
  if (err) throw err;
  return data;
}

export async function findChapterByParam(chapterParam){
  const { data, error: err } = await supabase.from("chapters").select("*").eq("param", chapterParam).limit(1).single();
  if (err && err.code !== "PGRST116") throw err;
  return data || null;
}

export async function insertChapter(comic_param, chapterMeta){
  const payload = {
    comic_param,
    chapter: chapterMeta.chapter,
    param: chapterMeta.param,
    release: chapterMeta.release,
    detail_url: chapterMeta.detail_url,
    created_at: new Date().toISOString()
  };
  const { data, error: err } = await supabase.from("chapters").insert(payload).select().single();
  if (err) throw err;
  return data;
}

export async function insertPages(chapter_param, images){
  const payload = {
    chapter_param,
    images,
    created_at: new Date().toISOString()
  };
  const { data, error: err } = await supabase.from("pages").insert(payload).select().single();
  if (err) throw err;
  return data;
}

export async function findPagesByChapterParam(chapter_param){
  const { data, error: err } = await supabase.from("pages").select("*").eq("chapter_param", chapter_param).limit(1).single();
  if (err && err.code !== "PGRST116") throw err;
  return data || null;
}
