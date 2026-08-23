/** Ambient module declarations for packages installed during spikes. */

declare module "kokoro-js" {
  export class KokoroTTS {
    static from_pretrained(
      model: string,
      opts: { dtype: string; device: string },
    ): Promise<KokoroTTS>;
    generate(
      text: string,
      opts: { voice: string; speed?: number },
    ): Promise<{ save: (path: string) => void; toBuffer: () => Buffer }>;
    list_voices(): string[];
    stream(splitter: unknown): AsyncIterable<{ text: string; phonemes: string; audio: { save: (p: string) => void } }>;
  }
  export class TextSplitterStream {
    push(text: string): void;
    close(): void;
  }
}

declare module "@xenova/transformers" {
  export const env: {
    allowLocalModels?: boolean;
    allowRemoteModels?: boolean;
    cacheDir?: string;
  };
  export function pipeline(
    task: string,
    model: string,
    opts?: unknown,
  ): Promise<(input: string | string[]) => Promise<{
    data: number[] | Float32Array;
    dims?: number[];
  }>>;
}
