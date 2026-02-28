import axios from "axios";

export interface GitHubSearchResult {
  hitCount: number;
  items?: any[];
}

/**
 * Lightweight GitHub search helper.
 * NOTE: This is a best-effort helper. It requires a GITHUB_TOKEN in env for higher rate limits.
 * For privacy reasons, this should be opt-in and cached.
 */
export async function githubSearch(query: string): Promise<GitHubSearchResult> {
  const token = process.env.GITHUB_TOKEN;
  const api = "https://api.github.com/search/code";
  try {
    const res = await axios.get(api, {
      params: { q: query, per_page: 1 },
      headers: token ? { Authorization: `token ${token}` } : undefined,
      timeout: 10_000
    });
    return { hitCount: res.data.total_count ?? 0, items: res.data.items ?? [] };
  } catch (e) {
    return { hitCount: 0, items: [] };
  }
}

