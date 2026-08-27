const API_BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore, keep statusText */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function searchDeal(query, signal) {
  return request(`/api/search-deal?q=${encodeURIComponent(query)}`, { signal });
}

export function getDealDetails(dealId) {
  return request(`/api/deal-details/${encodeURIComponent(dealId)}`);
}

export function submitJobsheet(payload) {
  return request("/api/jobsheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
