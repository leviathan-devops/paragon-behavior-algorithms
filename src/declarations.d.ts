// Type declarations for modules without types
// Known limitation: wink-nlp types are partial — out() return types are best-effort
declare module 'wink-eng-lite-web-model' {
  const model: object;
  export default model;
}

declare module 'wink-nlp' {
  interface TokenItem { pos(): string }
  interface SentenceItem { dependencyTree(): string; }
  interface WinkTokens {
    out(): any;
    out(cb: (t: TokenItem) => unknown): any;
  }
  interface WinkSentences {
    out(): any;
    out(cb: (s: SentenceItem) => unknown): any;
    length: number;
  }
  interface WinkEntities { out(): Array<{ type: string; value: string }>; }
  interface WinkDoc {
    tokens(): WinkTokens;
    sentences(): WinkSentences;
    entities(): WinkEntities;
  }
  interface WinkNLP { readDoc(text: string): WinkDoc; }
  function winkNLP(model: object): WinkNLP;
  export default winkNLP;
}

declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new () => SqlJsDatabase;
  }
  interface SqlJsDatabase {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string, params?: unknown[]): { columns: string[]; values: unknown[][] }[];
    close(): void;
  }
  function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
  export default initSqlJs;
}

declare module 'peggy' {
  interface Parser { parse(input: string): unknown; }
  function generate(grammar: string): Parser;
  export { generate };
}
