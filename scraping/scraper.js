// scraper.js
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// DB clients
import Database from "better-sqlite3";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import pkg from "pg";

dotenv.config();

const {
  DATABASE_URL,          // optional Postgres URL
  SUPABASE_URL,          // optional Supabase
  SUPABASE_KEY,
  STARTING_API = "http://localhost:3000/api/komiku",
  CONCURRENCY = "3"
} = process.env;

const CONCURRENCY_LIMIT = parseInt(CONCURRENCY || "3", 10);

// ---------- Helper utilities ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safeLog = (...args) => console.log(new Date().toISOString(), ...args);

// JSON stringify for DB fields
const jsonStringify = (v) => (v == null ? null : JSON.stringify(v));

// ---------- DB Abstraction ----------
/**
 * We support 3 backends (priority):
 * 1) Supabase (if SUPABASE_URL + SUPABASE_KEY)
 * 2) Postgres (if DATABASE_URL)
 * 3) SQLite local fallback
 *
 * We'll implement minimal query wrappers for the operations we need.
 */

let dbMode = null;
let sqliteDb = null;
let supabase = null;
let pgClient = null;

async function initDatastore() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    dbMode = "supabase";
    supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false }});
    safeLog("Using Supabase as primary datastore.");
    // We expect tables exist. If not, we can also create via SQL, but supabase project needs to be prepared.
    return;
  }

  if (DATABASE_URL) {
    dbMode = "postgres";
    const { Client } = pkg;
    pgClient = new Client({ connectionString: DATABASE_URL });
    await pgClient.connect();
    safeLog("Connected to Postgres (DATABASE_URL). Ensuring tables exist...");
    // create tables if not exist
    await ensureTablesPostgres();
    return;
  }

  // fallback sqlite
  dbMode = "sqlite";
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "db.sqlite");
  sqliteDb = new Database(dbPath);
  safeLog("Using local SQLite at", dbPath);
  ensureTablesSqlite();
}

/* --------- Table creation for sqlite & postgres --------- */

function ensureTablesSqlite() {
  // comics
  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS comics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      param TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      thumbnail TEXT,
      synopsis TEXT,
      genres TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comic_id INTEGER NOT NULL,
      chapter TEXT NOT NULL,
      param TEXT NOT NULL,
      release_date TEXT,
      detail_url TEXT NOT NULL,
      seq INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(comic_id, param)
    );
  `).run();

  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chapter_id, idx)
    );
  `).run();

  sqliteDb.prepare(`
    CREATE TABLE IF NOT EXISTS meta_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      status TEXT,
      details TEXT
    );
  `).run();
}

async function ensureTablesPostgres() {
  const q = async (sql) => pgClient.query(sql);
  await q(`CREATE TABLE IF NOT EXISTS comics (
    id SERIAL PRIMARY KEY,
    param TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    thumbnail TEXT,
    synopsis TEXT,
    genres TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`);
  await q(`CREATE TABLE IF NOT EXISTS chapters (
    id SERIAL PRIMARY KEY,
    comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
    chapter TEXT NOT NULL,
    param TEXT NOT NULL,
    release_date TEXT,
    detail_url TEXT NOT NULL,
    seq INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comic_id, param)
  );`);
  await q(`CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chapter_id, idx)
  );`);
  await q(`CREATE TABLE IF NOT EXISTS meta_runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    status TEXT,
    details TEXT
  );`);
}

/* --------- CRUD wrappers (small set) --------- */

async function findComicByParam(param) {
  if (dbMode === "sqlite") {
    return sqliteDb
      .prepare("SELECT * FROM comics WHERE param = ?")
      .get(param);
  } else if (dbMode === "postgres") {
    const res = await pgClient.query("SELECT * FROM comics WHERE param = $1", [param]);
    return res.rows[0];
  } else if (dbMode === "supabase") {
    const { data, error } = await supabase.from("comics").select("*").eq("param", param).limit(1);
    if (error) throw error;
    return data[0] ?? null;
  }
}

async function insertOrUpdateComic(metadata) {
  // metadata: { param, title, thumbnail, synopsis, genres: array }
  if (dbMode === "sqlite") {
    const existing = sqliteDb.prepare("SELECT id FROM comics WHERE param = ?").get(metadata.param);
    if (existing) {
      sqliteDb.prepare(`
        UPDATE comics SET title = ?, thumbnail = ?, synopsis = ?, genres = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(metadata.title, metadata.thumbnail, metadata.synopsis, jsonStringify(metadata.genres), existing.id);
      return { id: existing.id, updated: true };
    } else {
      const info = sqliteDb.prepare(`
        INSERT INTO comics (param, title, thumbnail, synopsis, genres) VALUES (?, ?, ?, ?, ?)
      `).run(metadata.param, metadata.title, metadata.thumbnail, metadata.synopsis, jsonStringify(metadata.genres));
      return { id: info.lastInsertRowid, updated: false };
    }
  } else if (dbMode === "postgres") {
    // upsert
    const res = await pgClient.query(`
      INSERT INTO comics (param, title, thumbnail, synopsis, genres)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (param) DO UPDATE SET
        title = EXCLUDED.title,
        thumbnail = EXCLUDED.thumbnail,
        synopsis = EXCLUDED.synopsis,
        genres = EXCLUDED.genres,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `, [metadata.param, metadata.title, metadata.thumbnail, metadata.synopsis, jsonStringify(metadata.genres)]);
    return { id: res.rows[0].id, updated: true };
  } else if (dbMode === "supabase") {
    const { data, error } = await supabase
      .from("comics")
      .upsert({
        param: metadata.param,
        title: metadata.title,
        thumbnail: metadata.thumbnail,
        synopsis: metadata.synopsis,
        genres: metadata.genres
      }, { onConflict: "param" })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id, updated: true };
  }
}

async function getChaptersForComic(comic_id) {
  if (dbMode === "sqlite") {
    return sqliteDb.prepare("SELECT * FROM chapters WHERE comic_id = ? ORDER BY seq DESC").all(comic_id);
  } else if (dbMode === "postgres") {
    const res = await pgClient.query("SELECT * FROM chapters WHERE comic_id = $1 ORDER BY seq DESC", [comic_id]);
    return res.rows;
  } else if (dbMode === "supabase") {
    const { data, error } = await supabase.from("chapters").select("*").eq("comic_id", comic_id).order("seq", { ascending: false });
    if (error) throw error;
    return data;
  }
}

async function insertChapter(comic_id, chapterObj) {
  // chapterObj: { chapter, param, release_date, detail_url, seq }
  if (dbMode === "sqlite") {
    const stmt = sqliteDb.prepare(`
      INSERT OR IGNORE INTO chapters (comic_id, chapter, param, release_date, detail_url, seq)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(comic_id, chapterObj.chapter, chapterObj.param, chapterObj.release, chapterObj.detail_url, chapterObj.seq);
    return { inserted: info.changes > 0, id: info.lastInsertRowid };
  } else if (dbMode === "postgres") {
    const res = await pgClient.query(`
      INSERT INTO chapters (comic_id, chapter, param, release_date, detail_url, seq)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (comic_id, param) DO NOTHING
      RETURNING id
    `, [comic_id, chapterObj.chapter, chapterObj.param, chapterObj.release, chapterObj.detail_url, chapterObj.seq]);
    return { inserted: res.rowCount > 0, id: res.rows[0]?.id ?? null };
  } else if (dbMode === "supabase") {
    const { data, error } = await supabase.from("chapters").insert([{
      comic_id, chapter: chapterObj.chapter, param: chapterObj.param, release_date: chapterObj.release, detail_url: chapterObj.detail_url, seq: chapterObj.seq
    }]).select("id").maybeSingle();
    if (error) {
      if (error.code === "23505") return { inserted: false, id: null }; // unique violation
      throw error;
    }
    return { inserted: !!data, id: data?.id ?? null };
  }
}

async function insertPage(chapter_id, idx, url) {
  if (dbMode === "sqlite") {
    const stmt = sqliteDb.prepare(`
      INSERT OR IGNORE INTO pages (chapter_id, idx, url) VALUES (?, ?, ?)
    `);
    const info = stmt.run(chapter_id, idx, url);
    return info.changes > 0;
  } else if (dbMode === "postgres") {
    const res = await pgClient.query(`
      INSERT INTO pages (chapter_id, idx, url)
      VALUES ($1,$2,$3)
      ON CONFLICT (chapter_id, idx) DO NOTHING
      RETURNING id
    `, [chapter_id, idx, url]);
    return res.rowCount > 0;
  } else if (dbMode === "supabase") {
    const { data, error } = await supabase.from("pages").insert([{ chapter_id, idx, url }]).select("id").maybeSingle();
    if (error) {
      if (error.code === "23505") return false;
      throw error;
    }
    return !!data;
  }
}

async function findChapterByParam(comic_id, param) {
  if (dbMode === "sqlite") {
    return sqliteDb.prepare("SELECT * FROM chapters WHERE comic_id = ? AND param = ?").get(comic_id, param);
  } else if (dbMode === "postgres") {
    const res = await pgClient.query("SELECT * FROM chapters WHERE comic_id = $1 AND param = $2", [comic_id, param]);
    return res.rows[0];
  } else if (dbMode === "supabase") {
    const { data, error } = await supabase.from("chapters").select("*").eq("comic_id", comic_id).eq("param", param).limit(1);
    if (error) throw error;
    return data[0] ?? null;
  }
}

// meta run logging
async function createRunRow() {
  if (dbMode === "sqlite") {
    const info = sqliteDb.prepare("INSERT INTO meta_runs (status) VALUES ('running')").run();
    return info.lastInsertRowid;
  } else if (dbMode === "postgres") {
    const res = await pgClient.query("INSERT INTO meta_runs (status) VALUES ('running') RETURNING id", []);
    return res.rows[0].id;
  } else if (dbMode === "supabase") {
    const { data, error } = await supabase.from("meta_runs").insert([{ status: "running" }]).select("id").maybeSingle();
    if (error) throw error;
    return data.id;
  }
}
async function finishRunRow(id, status = "ok", details = "") {
  if (dbMode === "sqlite") {
    sqliteDb.prepare("UPDATE meta_runs SET finished_at = CURRENT_TIMESTAMP, status = ?, details = ? WHERE id = ?")
      .run(status, details, id);
  } else if (dbMode === "postgres") {
    await pgClient.query("UPDATE meta_runs SET finished_at = CURRENT_TIMESTAMP, status = $1, details = $2 WHERE id = $3", [status, details, id]);
  } else if (dbMode === "supabase") {
    await supabase.from("meta_runs").update({ finished_at: new Date().toISOString(), status, details }).eq("id", id);
  }
}

// ---------- Fetching helpers ----------
const http = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent": "komiku-scraper/1.0 (+https://example.invalid)"
  }
});

async function fetchJson(url) {
  safeLog("GET", url);
  const res = await http.get(url);
  return res.data;
}

// ---------- Main logic ----------
async function main() {
  await initDatastore();
  const runId = await createRunRow();
  try {
    let pageUrl = process.env.STARTING_API || STARTING_API;
    while (pageUrl) {
      safeLog("Fetching listing page:", pageUrl);
      const listing = await fetchJson(pageUrl).catch((e) => {
        safeLog("Failed to fetch listing page:", e.message);
        throw e;
      });

      if (!listing?.data || !Array.isArray(listing.data)) {
        safeLog("Listing response malformed; stopping.");
        break;
      }

      // Process each komik sequentially but with limited concurrency for chapter fetching
      for (const item of listing.data) {
        try {
          await processKomikItem(item);
        } catch (err) {
          safeLog("Error processing komik", item.param || item.title, err.message);
          // continue to next item
        }
      }

      // next page
      pageUrl = listing.next_page || null;
      if (pageUrl) {
        // small delay to be polite
        await sleep(300);
      }
    }

    await finishRunRow(runId, "ok", "Finished crawling successfully");
    safeLog("All done.");
  } catch (err) {
    safeLog("Fatal error:", err.message);
    await finishRunRow(runId, "error", (err && err.stack) ? err.stack.slice(0, 2000) : String(err));
    process.exitCode = 1;
  } finally {
    if (pgClient) await pgClient.end();
  }
}

async function processKomikItem(listItem) {
  // listItem shape from your sample: title, description, latest_chapter, thumbnail, param, detail_url
  const detailUrl = listItem.detail_url;
  if (!detailUrl) {
    safeLog("No detail_url for", listItem.param);
    return;
  }

  // fetch detail page (metadata + chapters)
  const detailResp = await fetchJson(detailUrl).catch((e) => {
    safeLog("Failed to fetch detail_url", detailUrl, e.message);
    throw e;
  });

  const data = detailResp.data;
  if (!data) {
    safeLog("Detail response bad for", listItem.param);
    return;
  }

  // map metadata
  const metadata = {
    param: data.param || listItem.param,
    title: data.title || listItem.title,
    thumbnail: data.thumbnail || listItem.thumbnail,
    synopsis: data.synopsis || listItem.description || "",
    genres: Array.isArray(data.genre) ? data.genre : (data.genres || [])
  };

  // Insert or update comic metadata
  const { id: comicId } = await insertOrUpdateComic(metadata);
  safeLog("Comic id", comicId, "param", metadata.param);

  // Get existing chapters in DB
  const existingChapters = await getChaptersForComic(comicId);
  // build set of params
  const existingParams = new Set(existingChapters.map((c) => c.param));

  // chapters in API: newest first in your example. We'll compute seq as index with high => newer.
  const apiChapters = Array.isArray(data.chapters) ? data.chapters : [];
  // assign seq by position: newest=length, older decremented
  const total = apiChapters.length;
  for (let i = 0; i < apiChapters.length; i++) {
    apiChapters[i].seq = total - i; // newer has larger seq
  }

  // Determine which chapters to insert (those with param not in DB)
  const missingChapters = apiChapters.filter((ch) => !existingParams.has(ch.param));

  if (missingChapters.length === 0) {
    safeLog(`No new chapters for ${metadata.param} (total known: ${existingChapters.length})`);
  } else {
    safeLog(`Found ${missingChapters.length} new chapter(s) for ${metadata.param}`);
    // We'll insert chapters oldest-first to preserve reading order (optional)
    // So sort missingChapters by seq ascending (oldest first)
    missingChapters.sort((a, b) => a.seq - b.seq);

    // insert each missing chapter then fetch its pages
    for (const chap of missingChapters) {
      const insertRes = await insertChapter(comicId, chap);
      safeLog("Inserted chapter", chap.param, "inserted=", insertRes.inserted);
      // get chapter row (we need its id)
      const chapRow = await findChapterByParam(comicId, chap.param);
      if (!chapRow) {
        safeLog("Failed to find inserted chapter row for", chap.param);
        continue;
      }
      // fetch chapter detail_url to get page list
      if (!chap.detail_url) {
        safeLog("No chapter detail_url for", chap.param);
        continue;
      }
      try {
        const chDetail = await fetchJson(chap.detail_url);
        const pages = chDetail?.data;
        if (!Array.isArray(pages)) {
          safeLog("chapter detail response not array for", chap.detail_url);
          continue;
        }
        // Insert pages in order
        for (let i = 0; i < pages.length; i++) {
          const url = pages[i];
          await insertPage(chapRow.id, i + 1, url);
        }
        safeLog(`Saved ${pages.length} pages for chapter ${chap.param}`);
      } catch (err) {
        safeLog("Failed to fetch/save pages for", chap.param, err.message);
      }

      // small pause between chapter fetches
      await sleep(120);
    }
  }
}

main();
