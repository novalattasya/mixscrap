import axios from "axios";
import { REQUEST_TIMEOUT_MS } from "./config.js";
import { error } from "./logger.js";

const axiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "User-Agent": "komiku-scraper/1.0 (+https://example.local)"
  }
});

async function get(url, opts = {}) {
  const maxRetries = opts.retries ?? 3;
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await axiosInstance.get(url, opts);
      return res.data;
    } catch (err) {
      attempt++;
      error(`GET ${url} failed (attempt ${attempt}): ${err.message}`);
      if (attempt >= maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt)); // exponential-ish backoff
    }
  }
}

export default { get };
