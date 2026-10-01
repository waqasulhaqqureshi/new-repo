export type KnowledgeDocument = {
  id: string;
  source: string;
  keywords: string;
  content: string;
};

/** Compact, approved excerpts distilled from the supplied Receptionist PDF. */
export const KNOWLEDGE_BASE: KnowledgeDocument[] = [
  {
    id: "raqmiva-positioning",
    source: "Receptionist PDF, page 1",
    keywords:
      "Raqmiva UAE AI receptionist bilingual front desk voice demo businesses hospitality clinic real estate automotive salon",
    content:
      "Raqmiva is positioned as a UAE-focused bilingual AI receptionist for businesses that handle enquiries and appointments. The experience is designed to sound local, stay professional, answer routine questions, complete the next front-desk step, and hand complex situations to a person.",
  },
  {
    id: "languages-and-voice",
    source: "Receptionist PDF, pages 2, 5, and 6",
    keywords:
      "Arabic English Emirati Gulf UAE dialect language detect automatic switch switch mid call accent عربي العربية انجليزي الإماراتية خليجي",
    content:
      "The receptionist automatically detects Arabic or English, speaks professional Emirati/Gulf Arabic or clear professional English, and can switch languages mid-call without losing context or repeating questions. The target is warm local phrasing without exaggerated slang. The brief's sample Emirati greeting is: مرحبا الساع، حياك الله. شلون أقدر أخدمك اليوم؟",
  },
  {
    id: "front-desk-workflow",
    source: "Receptionist PDF, pages 2 and 3",
    keywords:
      "booking appointment enquiry reschedule cancellation cancel intent collect name service time notes workflow حجز موعد استفسار تعديل إلغاء",
    content:
      "The proposed call flow is: greet and identify language; understand whether the caller wants information, a booking, a change, or human support; use approved business data; confirm only key details; close naturally; and, in a connected production setup, save a summary and outcome. The brief describes booking, rescheduling, cancellation, FAQs, and lead capture as capabilities to connect and configure.",
  },
  {
    id: "sample-clinic-appointment",
    source: "Receptionist PDF, pages 4 and 5",
    keywords:
      "Al Noor Clinic dental cleaning tomorrow sample example appointment slots 6:30 7:15 evening booking عيادة النور تنظيف اسنان باچر موعد",
    content:
      "The PDF contains an illustrative Al Noor Clinic dental-cleaning role-play. In that sample dialogue, the caller asks for tomorrow evening and the receptionist offers 6:30 PM or 7:15 PM. These are fictional demonstration times from a sample script, not live clinic availability, and must never be presented as a real booking or reservation.",
  },
  {
    id: "language-switch-example",
    source: "Receptionist PDF, page 6",
    keywords:
      "switch languages English Arabic one call context memory property apartment Dubai Hills viewing rent buy الخميس إيجار معاينة",
    content:
      "The bilingual-switching example begins in English about a two-bedroom apartment in Dubai Hills, changes to Arabic for an availability question, and returns to English for an evening viewing confirmation. The intended behavior is one continuous conversation: keep details already shared, do not ask the same questions again, and switch language naturally.",
  },
  {
    id: "human-escalation",
    source: "Receptionist PDF, pages 2 and 3",
    keywords:
      "human handoff transfer staff person complaint urgent emergency sensitive medical legal payment uncertain misunderstanding VIP موظف تحويل تصعيد شكوى عاجل",
    content:
      "The brief recommends human escalation when a caller asks for a person, raises a sensitive matter or complaint, has an urgent request, is repeatedly misunderstood, or meets a configured VIP rule. Escalation must follow the business's actual policy. This browser demo has no live transfer destination, so it cannot transfer a call.",
  },
  {
    id: "integrations-and-guardrails",
    source: "Receptionist PDF, page 7",
    keywords:
      "calendar CRM lead pipeline SMS WhatsApp phone number appointment availability actual integrations working hours price FAQ address parking سياسة اسعار دوام موقع",
    content:
      "The PDF lists a phone number, calendar, CRM/lead pipeline, knowledge base, WhatsApp/SMS, and human transfer as optional production integrations. The brief does not provide real business opening hours, address, prices, policies, or live appointment availability. A receptionist must not invent these facts, promise an unconnected action, or collect card details or unnecessary sensitive information.",
  },
  {
    id: "client-demo-runbook",
    source: "Receptionist PDF, page 8",
    keywords:
      "client demonstration runbook test English Arabic language switching booking handoff dashboard customization clients demo",
    content:
      "The suggested client demo tests an English enquiry and booking role-play, an Emirati Arabic enquiry, an English-to-Arabic-to-English language switch, a human-handoff scenario, and a review of call outcomes. Production behavior is customized for each business's approved vocabulary, services, hours, calendar, CRM, and staff rules.",
  },
  {
    id: "unknown-business-facts",
    source: "Receptionist PDF, pages 2 and 7",
    keywords:
      "price pricing cost fees opening hours address location working time schedule parking availability verified information اسعار سعر تكلفة دوام ساعات عنوان موقع موقف",
    content:
      "No real business-specific price list, opening hours, address, parking guidance, or live availability is included in the supplied brief. Ask the business for approved facts or direct the caller to contact it; never guess. The Al Noor Clinic times are example dialogue only.",
  },
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "the",
  "to",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
  "you",
  "your",
  "هذا",
  "هذه",
  "على",
  "عن",
  "في",
  "ما",
  "ماذا",
  "من",
  "هل",
]);

const SYNONYM_GROUPS = [
  [
    "arabic",
    "emirati",
    "gulf",
    "uae",
    "عربي",
    "العربي",
    "العربية",
    "اماراتي",
    "إماراتي",
    "خليجي",
  ],
  ["english", "انجليزي", "الانجليزي", "الإنجليزي", "الانجليزية", "الإنجليزية"],
  [
    "appointment",
    "appointments",
    "booking",
    "book",
    "reserve",
    "reservation",
    "reschedule",
    "cancel",
    "cancellation",
    "موعد",
    "مواعيد",
    "حجز",
    "احجز",
    "الغاء",
    "إلغاء",
  ],
  [
    "language",
    "languages",
    "bilingual",
    "switch",
    "switching",
    "detect",
    "detected",
    "automatic",
    "auto",
    "اللغة",
    "لغات",
    "تبديل",
    "تحويل",
  ],
  [
    "price",
    "pricing",
    "cost",
    "fee",
    "fees",
    "سعر",
    "اسعار",
    "أسعار",
    "تكلفة",
    "رسوم",
  ],
  ["hours", "opening", "open", "working", "schedule", "دوام", "ساعات", "العمل"],
  ["location", "address", "parking", "موقع", "عنوان", "مواقف"],
  [
    "human",
    "staff",
    "person",
    "transfer",
    "escalate",
    "handoff",
    "موظف",
    "موظفة",
    "شخص",
    "تحويل",
    "تصعيد",
  ],
  ["clinic", "dental", "dentist", "cleaning", "عيادة", "أسنان", "اسنان", "تنظيف"],
  ["crm", "lead", "record", "saved", "save", "pipeline", "سجل", "متابعة"],
  ["sms", "whatsapp", "message", "confirmation", "رسالة", "تأكيد"],
];

const SYNONYMS = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    const normalized = normalizeToken(term);
    SYNONYMS.set(normalized, group.map(normalizeToken));
  }
}

function normalizeToken(token: string) {
  return token
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function tokenize(text: string) {
  return normalizeToken(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function expandEnglishVariant(term: string) {
  if (term.length > 5 && term.endsWith("ing")) return term.slice(0, -3);
  if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 4 && term.endsWith("s")) return term.slice(0, -1);
  return term;
}

const INDEXED_KNOWLEDGE_BASE = KNOWLEDGE_BASE.map((document) => {
  const termCounts = new Map<string, number>();
  for (const term of tokenize(`${document.keywords} ${document.content}`)) {
    termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }
  return { document, termCounts };
});

/**
 * Tiny in-memory BM25-style retriever. It is deliberately local and dependency-
 * free: factual turns get grounded without waiting on a separate embedding API
 * or vector database. Audio and ordinary conversational turns bypass it.
 */
export function retrieveKnowledge(query: string, limit = 3) {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];

  const indexed = INDEXED_KNOWLEDGE_BASE;

  return indexed
    .map(({ document, termCounts }) => {
      let score = 0;
      let matchedTerms = 0;

      for (const queryTerm of queryTerms) {
        const variants = new Set([
          queryTerm,
          expandEnglishVariant(queryTerm),
          ...(SYNONYMS.get(queryTerm) ?? []),
        ]);
        const frequencies = [...variants].reduce(
          (total, term) => total + (termCounts.get(term) ?? 0),
          0,
        );
        if (frequencies === 0) continue;

        matchedTerms += 1;
        const documentFrequency = indexed.filter((entry) =>
          [...variants].some((term) => entry.termCounts.has(term)),
        ).length;
        const inverseFrequency = Math.log(
          1 + (indexed.length - documentFrequency + 0.5) / (documentFrequency + 0.5),
        );
        const normalizedFrequency =
          (frequencies * 2.2) / (frequencies + 1.2);
        score += inverseFrequency * normalizedFrequency;
      }

      // Prefer a document that explains most of the query over one with a
      // single coincidental keyword hit.
      const coverage = matchedTerms / queryTerms.length;
      return { document, score: score * (0.65 + coverage * 0.7) };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(limit, 4)))
    .map(({ document }) => ({
      source: document.source,
      content: document.content,
    }));
}
