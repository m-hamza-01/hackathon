/**
 * BM25 full-text index over Jira ticket text.
 * Ported from src/engine/bm25.ts — pure TypeScript, no path dependencies.
 *
 * Field weighting via repetition (no multi-field BM25 complexity):
 *   title       × 3  — strongest domain signal
 *   components  × 2  — area signal; trimmed to strip trailing whitespace
 *   description × 1
 *   labels      × 1
 *
 * Parameters: k1 = 1.4, b = 0.75  (standard; tuned slightly toward shorter docs)
 */

const K1 = 1.4;
const B  = 0.75;

// General English + tracker-noise stopwords
const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","shall","can","need",
  "this","that","these","those","it","its","i","we","you","he","she","they",
  "not","no","nor","so","yet","both","either","neither","as","if","then",
  "than","when","where","who","which","what","how","why","from","by","via",
  "into","onto","upon","about","above","below","between","after","before",
  "issue","ticket","jira","kafka","apache","fix","fixed","bug","task",
  "also","just","use","used","using","new","get","set","one","two","three",
]);

export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function tryParseArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map(String);
  } catch { /* ignore */ }
  return [];
}

export interface DocMeta {
  id: number;
  key: string;
  title: string;
  type: string | null;
  resolved: string | null;
  assignee_id: number | null;
  cycle_days: number | null;
  work_days: number | null;
  comment_count: number | null;
}

export interface BM25Index {
  postings:   Map<string, Map<number, number>>;
  docLengths: Map<number, number>;
  avgDocLen:  number;
  N:          number;
  docs:       DocMeta[];
  docById:    Map<number, DocMeta>;
}

export interface RawDoc {
  id: number;
  key: string;
  title: string | null;
  description: string | null;
  components: string | null;
  labels: string | null;
  resolved: string | null;
  assignee_id: number | null;
  cycle_days: number | null;
  work_days: number | null;
  type?: string | null;
  comment_count?: number | null;
}

export function buildIndex(rawDocs: RawDoc[]): BM25Index {
  const postings   = new Map<string, Map<number, number>>();
  const docLengths = new Map<number, number>();
  const docs: DocMeta[] = [];
  const docById    = new Map<number, DocMeta>();
  let totalLen = 0;

  for (const d of rawDocs) {
    const comps = tryParseArray(d.components).map((c) => c.trim());

    const text = [
      d.title ?? "", d.title ?? "", d.title ?? "",
      comps.join(" "), comps.join(" "),
      (d.description ?? "").slice(0, 2000),
      ...tryParseArray(d.labels),
    ].join(" ");

    const tokens = tokenize(text);
    docLengths.set(d.id, tokens.length);
    totalLen += tokens.length;

    const meta: DocMeta = {
      id:            d.id,
      key:           d.key,
      title:         d.title ?? "",
      type:          d.type ?? null,
      resolved:      d.resolved,
      assignee_id:   d.assignee_id,
      cycle_days:    d.cycle_days,
      work_days:     d.work_days,
      comment_count: d.comment_count ?? null,
    };
    docs.push(meta);
    docById.set(d.id, meta);

    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    for (const [term, count] of tf) {
      if (!postings.has(term)) postings.set(term, new Map());
      postings.get(term)!.set(d.id, count);
    }
  }

  return {
    postings,
    docLengths,
    avgDocLen: rawDocs.length > 0 ? totalLen / rawDocs.length : 1,
    N: rawDocs.length,
    docs,
    docById,
  };
}

export interface SearchResult {
  doc: DocMeta;
  score: number;
}

export function search(idx: BM25Index, query: string, topK = 50): SearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const scores = new Map<number, number>();

  for (const term of terms) {
    const posting = idx.postings.get(term);
    if (!posting) continue;

    const df  = posting.size;
    const idf = Math.log((idx.N - df + 0.5) / (df + 0.5) + 1);

    for (const [docId, tf] of posting) {
      const dl   = idx.docLengths.get(docId) ?? idx.avgDocLen;
      const norm = K1 * (1 - B + B * (dl / idx.avgDocLen));
      const bm25 = idf * (tf * (K1 + 1)) / (tf + norm);
      scores.set(docId, (scores.get(docId) ?? 0) + bm25);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => ({ doc: idx.docById.get(id)!, score }));
}
