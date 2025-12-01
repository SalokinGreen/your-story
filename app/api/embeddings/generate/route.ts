import { NextRequest, NextResponse } from "next/server";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

/** Maximum texts per batch */
const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
    if (!MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: "Mistral API key not configured" },
        { status: 500 }
      );
    }

    const { texts } = await req.json();

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "texts array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate all texts are strings
    for (let i = 0; i < texts.length; i++) {
      if (typeof texts[i] !== "string") {
        return NextResponse.json(
          { error: `texts[${i}] must be a string` },
          { status: 400 }
        );
      }
      // Ensure non-empty strings (Mistral rejects empty inputs)
      if (texts[i].trim().length === 0) {
        return NextResponse.json(
          { error: `texts[${i}] cannot be empty` },
          { status: 400 }
        );
      }
    }

    // Process in batches to avoid API limits
    const allEmbeddings: number[][] = [];
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

    console.log(`[Embeddings] Generating embeddings for ${texts.length} texts in ${totalBatches} batches`);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      console.log(`[Embeddings] Processing batch ${batchNum}/${totalBatches} (${batch.length} texts)`);

      const response = await fetch("https://api.mistral.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: "mistral-embed",
          input: batch,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Mistral embedding error:", errorText);
        return NextResponse.json(
          { error: `Embedding failed: ${errorText}` },
          { status: response.status }
        );
      }

      const result = await response.json();

      // Extract embeddings from response
      const batchEmbeddings = result.data.map(
        (d: { embedding: number[] }) => d.embedding
      );
      allEmbeddings.push(...batchEmbeddings);
      
      console.log(`[Embeddings] Batch ${batchNum} complete: got ${batchEmbeddings.length} embeddings, total: ${allEmbeddings.length}`);
    }

    console.log(`[Embeddings] All batches complete: ${allEmbeddings.length} embeddings generated`);

    return NextResponse.json({
      embeddings: allEmbeddings,
      count: allEmbeddings.length,
    });
  } catch (error: unknown) {
    console.error("Embedding generation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate embeddings: ${message}` },
      { status: 500 }
    );
  }
}
