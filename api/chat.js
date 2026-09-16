
  import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const crisisReplies = {
  et: 'Aitäh, et mulle sellest rääkisid. ❤️ Ma võtan sind tõsiselt. Sa ei pea praegu kõike seletama. Kas sa oled praegu otseses ohus või oled endale juba midagi teinud? Kui oled otseses ohus, helista oma kohaliku hädaabiteenistuse numbrile või mine lähimasse erakorralise meditsiini osakonda.',
  en: 'Thank you for telling me. ❤️ I take you seriously. You do not have to explain everything right now. Are you in immediate danger, or have you already hurt yourself? If you are in immediate danger, contact your local emergency service now or go to the nearest emergency department.'
};

function isObviousCrisis(text) {
  const t = String(text || '').toLowerCase();

  return /(enesetap|tahan\s+surra|ei\s+taha\s+elada|endale\s+haiget|tahan\s+ennast\s+vigastada|enesevigastus|kill\s+myself|want\s+to\s+die|don'?t\s+want\s+to\s+live|self[- ]?harm|suicid|hurt\s+myself)/i.test(t);
}

function isHighRiskDistress(text) {
  const t = String(text || '').toLowerCase();

  return /(i\s+can'?t\s+go\s+on|i\s+cannot\s+go\s+on|i\s+don'?t\s+know\s+what\s+to\s+do\s+anymore|i\s+can'?t\s+take\s+this\s+anymore|everything\s+feels\s+too\s+much|there'?s\s+no\s+way\s+out|i'?m\s+done|life\s+isn'?t\s+worth\s+living|ma\s+ei\s+jaksa\s+enam|ma\s+ei\s+tea\s+enam\s+mida\s+teha|kõik\s+on\s+liiga\s+palju|pole\s+enam\s+väljapääsu|ma\s+olen\s+läbi)/i.test(t);
}

function cleanReply(text) {
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      message,
      history = [],
      language = 'en'
    } = req.body || {};

    const lang = language === 'et' ? 'et' : 'en';
    const text = String(message || '').trim();

    if (!text) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (text.length > 4000) {
      return res.status(400).json({ error: 'Message is too long' });
    }

    if (isObviousCrisis(text)) {
      return res.status(200).json({
        crisis: true,
        reply: crisisReplies[lang]
      });
    }

    if (isHighRiskDistress(text)) {
      const safetyQuestion = lang === 'et'
        ? 'Mul on kahju, et sul on praegu nii raske. ❤️ Ma tahan ühe olulise asja üle kontrollida: kas sa mõtled praegu endale haiget teha või et sa ei taha enam elada?'
        : 'I’m sorry things feel so overwhelming right now. ❤️ I want to check one important thing: are you thinking about hurting yourself or ending your life right now?';

      return res.status(200).json({
        crisis: true,
        reply: safetyQuestion
      });
    }

    const moderation = await client.moderations.create({
      model: 'omni-moderation-latest',
      input: text
    });

    const result = moderation.results?.[0];

    if (
      result?.categories?.['self-harm/intent'] ||
      result?.categories?.['self-harm/instructions']
    ) {
      return res.status(200).json({
        crisis: true,
        reply: crisisReplies[lang]
      });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .slice(-12)
          .filter(
            m =>
              m &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string'
          )
      : [];

    const instructions = lang === 'et'
      ? `Sa oled Bloom — soe, rahulik ja aus vaimse heaolu kaaslane. Sa ei ole inimene, arst ega terapeut.

Kuula enne nõu andmist. Küsi tavaliselt ainult üks küsimus korraga. Hoia vastused lühikesed, loomulikud ja toetavad. Paku vajadusel ühte väikest praktilist sammu.

Ära kasuta võltsi positiivsust. Ära ütle, et "kõik saab kindlasti korda". Ära ütle, et kasutaja vajab sind või et sina oled tema ainus tugi.

Ära diagnoosi. Ära väida, et tead täpselt, mida inimene tunneb.

Kui inimene väljendab enesetapu- või enesevigastamise mõtteid või kavatsust, keskendu turvalisusele ja päris inimese või hädaabi poole pöördumisele.

Kui inimene ütleb näiteks "ma ei tea enam, mida teha", "ma ei jaksa enam" või "kõik on liiga palju", kontrolli esmalt rahulikult, kas ta mõtleb endale haiget teha või et ta ei taha enam elada.

Ära kasuta Markdowni, tärne ega pealkirju. Kirjuta lihtsalt loomuliku tekstina.

Bloom on AI ja peab olema aus, et ta on AI.`
      : `You are Bloom — a warm, calm and honest mental wellbeing companion. You are not a person, doctor or therapist.

Listen before giving advice. Usually ask only one question at a time. Keep replies short, natural and supportive. When useful, suggest one small practical step.

Do not use fake positivity. Do not say that everything will definitely be okay. Never tell the user they need you or that you are their only support.

Do not diagnose. Do not claim to know exactly how someone feels.

If a person expresses suicidal or self-harm thoughts or intent, focus on safety and encourage real human or emergency support.

If a person says things like "I don't know what to do anymore", "I can't go on", "I can't take this anymore", or "everything feels too much", first calmly check whether they are thinking about hurting themselves or ending their life.

Do not use Markdown, asterisks or headings. Write naturally as plain text.

Bloom is AI and must be honest that it is AI.`;

    const response = await client.responses.create({
      model: 'gpt-5.6-luna',
      instructions,
      input: [
        ...safeHistory,
        {
          role: 'user',
          content: text
        }
      ]
    });

    const reply = cleanReply(
      response.output_text ||
      (lang === 'et'
        ? 'Ma kuulan. 🌸'
        : 'I’m listening. 🌸')
    );

    return res.status(200).json({
      crisis: false,
      reply
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: 'Bloom AI is temporarily unavailable.'
    });
  }
}
        
