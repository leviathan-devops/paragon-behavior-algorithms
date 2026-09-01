import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);

export interface ExtractedPrinciple {
  name: string;
  statement: string;
  constraints: string[];
  successCriteria: string[];
}

export function extractPrinciplesFromText(text: string): ExtractedPrinciple[] {
  const doc = nlp.readDoc(text);
  const sentences: string[] = doc.sentences().out();
  const principles: ExtractedPrinciple[] = [];

  for (const sentence of sentences) {
    const sentDoc = nlp.readDoc(sentence);
    const tokens: string[] = sentDoc.tokens().out();
    const posTags: string[] = sentDoc.tokens().out((t: unknown) => tokenPos(t));

    const modalIndex = tokens.findIndex((t: string) =>
      ['must', 'should', 'shall', 'will', 'need', 'required'].includes(t.toLowerCase())
    );

    if (modalIndex >= 0) {
      const subject = tokens.slice(0, modalIndex).join(' ');
      const predicate = tokens.slice(modalIndex + 1).join(' ');

      principles.push({
        name: `Principle ${principles.length + 1}: ${subject}`,
        statement: sentence,
        constraints: [],
        successCriteria: [`${subject} ${predicate}`],
      });
    }
  }

  if (principles.length < 3) {
    for (const sentence of sentences) {
      const sentDoc2 = nlp.readDoc(sentence);
      const posTags2: string[] = sentDoc2.tokens().out((t: unknown) => tokenPos(t));

      const hasNoun = posTags2.some((t: string) => t.startsWith('NN'));
      const hasVerb = posTags2.some((t: string) => t.startsWith('VB'));

      if (hasNoun && hasVerb && principles.length < 5) {
        principles.push({
          name: `Principle ${principles.length + 1}`,
          statement: sentence,
          constraints: [],
          successCriteria: [sentence],
        });
      }
    }
  }

  return principles;
}


/** THE R16 TYPE_CERTAINTY GUARDED READ — the wink token's pos() is invoked
 *  behind the typeof guard (the assertion is earned by the check). */
function tokenPos(t: unknown): string {
  if (typeof t === 'object' && t !== null && typeof (t as { pos?: unknown }).pos === 'function') {
    return (t as { pos: () => string }).pos();
  }
  return '';
}
