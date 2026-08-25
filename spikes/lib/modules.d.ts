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

declare module "chrome-remote-interface" {
  // Minimal typing for the spike. The library is dynamically shaped by the CDP
  // protocol; full typing is not needed for the spike.
  const CDP: {
    (opts?: { target?: string | number; port?: number; host?: string; local?: boolean }): Promise<any>;
    List(opts?: { port?: number; host?: string }): Promise<any[]>;
    New(opts?: { port?: number; host?: string; url?: string }): Promise<any>;
    Activate(opts?: { port?: number; host?: string; id?: string }): Promise<void>;
    Close(opts?: { port?: number; host?: string; id?: string }): Promise<void>;
    Version(opts?: { port?: number; host?: string }): Promise<any>;
    Protocol(opts?: { port?: number; host?: string; remote?: boolean }): Promise<any>;
  };
  export default CDP;
}
