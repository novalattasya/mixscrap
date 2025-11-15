import dotenv from "dotenv";
dotenv.config();

export const API_BASE = process.env.API_BASE || "http://localhost:3000/api/komiku";
export const CONCURRENCY = parseInt(process.env.CONCURRENCY || "4", 10);
export const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || "15000", 10);
export const SUPABASE_URL = process.env.SUPABASE_URL || null;
export const SUPABASE_KEY = process.env.SUPABASE_KEY || null;
