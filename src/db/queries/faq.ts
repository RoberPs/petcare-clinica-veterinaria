import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { faqs, faqTopics } from '../schema';

export interface FaqTopic {
  slug: string;
  name: string;
  faqs: { slug: string; question: string; answerMd: string }[];
}

/** Temas con preguntas publicadas, en el orden configurado. Los temas vacíos no se devuelven (FR-032). */
export async function getFaqByTopic(): Promise<FaqTopic[]> {
  const rows = await getDb()
    .select({
      topicSlug: faqTopics.slug,
      topicName: faqTopics.name,
      slug: faqs.slug,
      question: faqs.question,
      answerMd: faqs.answerMd,
    })
    .from(faqs)
    .innerJoin(faqTopics, eq(faqs.topicId, faqTopics.id))
    .where(and(eq(faqs.published, true), eq(faqTopics.published, true)))
    .orderBy(asc(faqTopics.position), asc(faqTopics.slug), asc(faqs.position), asc(faqs.slug));
  const topics: FaqTopic[] = [];
  for (const r of rows) {
    let topic = topics[topics.length - 1];
    if (!topic || topic.slug !== r.topicSlug) {
      topic = { slug: r.topicSlug, name: r.topicName, faqs: [] };
      topics.push(topic);
    }
    topic.faqs.push({ slug: r.slug, question: r.question, answerMd: r.answerMd });
  }
  return topics;
}
