export function ensureArray(v) {
  return Array.isArray(v) ? v : (v ? [v] : []);
}

// get highest chapter number by param string heuristic (not strictly needed but handy)
export function chapterParamToNumber(param) {
  // try to extract last number group
  const m = param && param.match(/(?:-|_)(?:chapter-)?(\d+)(?:$|[^0-9])/i);
  if (!m) return null;
  return parseInt(m[1], 10);
}
