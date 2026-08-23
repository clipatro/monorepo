import { EMBEDDING_SERVICE_URL } from "./constants";

// === Cosine similarity ===

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// === Semantic similarity via embedding-service ===

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${EMBEDDING_SERVICE_URL}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) throw new Error(`Embedding service error: ${res.status}`);
  const data = await res.json() as { vectors: Array<{ vector: number[] }> };
  return data.vectors.map((v) => v.vector);
}

export { cosineSimilarity, getEmbeddings };
