import fs from "fs/promises";
import path from "path";
import { info } from "../logger.js";

const DB_PATH = path.resolve("./data/db.json");
const DEFAULT = {
  comics: [],   // { id: uuid, title, param, thumbnail, genre:[], synopsis, created_at, updated_at }
  chapters: [], // { id: uuid, comic_param, chapter, param, release, detail_url, created_at }
  pages: []     // { id: uuid, chapter_param, images: [urls], created_at }
};

function nowIso(){ return new Date().toISOString(); }
function uuid(){ return 'id-' + Math.random().toString(36).slice(2,11); }

async function ensureFile(){
  try {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(DEFAULT, null, 2), "utf8");
    info("Created local DB at", DB_PATH);
  }
}

export async function readDb(){
  await ensureFile();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

export async function writeDb(data){
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

// --- CRUD helpers:

export async function findComicByParam(param){
  const db = await readDb();
  return db.comics.find(c => c.param === param) || null;
}

export async function insertComic(meta){
  const db = await readDb();
  const now = nowIso();
  const record = {
    id: uuid(),
    title: meta.title,
    param: meta.param,
    thumbnail: meta.thumbnail || null,
    genre: meta.genre || [],
    synopsis: meta.synopsis || "",
    created_at: now,
    updated_at: now
  };
  db.comics.push(record);
  await writeDb(db);
  return record;
}

export async function updateComic(param, patch){
  const db = await readDb();
  const idx = db.comics.findIndex(c => c.param === param);
  if (idx === -1) throw new Error("comic not found");
  db.comics[idx] = { ...db.comics[idx], ...patch, updated_at: nowIso() };
  await writeDb(db);
  return db.comics[idx];
}

export async function listChaptersByComicParam(param){
  const db = await readDb();
  return db.chapters.filter(ch => ch.comic_param === param).sort((a,b)=> {
    const na = a.param || a.chapter; const nb = b.param || b.chapter;
    // try number ordering fallback: descending by created index
    return 0;
  });
}

export async function findChapterByParam(chapterParam){
  const db = await readDb();
  return db.chapters.find(c => c.param === chapterParam) || null;
}

export async function insertChapter(comic_param, chapterMeta){
  const db = await readDb();
  const now = nowIso();
  const record = {
    id: uuid(),
    comic_param,
    chapter: chapterMeta.chapter,
    param: chapterMeta.param,
    release: chapterMeta.release || null,
    detail_url: chapterMeta.detail_url,
    created_at: now
  };
  db.chapters.push(record);
  await writeDb(db);
  return record;
}

export async function insertPages(chapter_param, images){
  const db = await readDb();
  const now = nowIso();
  const record = {
    id: uuid(),
    chapter_param,
    images: images || [],
    created_at: now
  };
  db.pages.push(record);
  await writeDb(db);
  return record;
}

export async function findPagesByChapterParam(chapter_param){
  const db = await readDb();
  return db.pages.find(p => p.chapter_param === chapter_param) || null;
}
