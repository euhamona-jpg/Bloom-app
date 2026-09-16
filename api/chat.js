import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const crisisReplies = {
  et: 'Aitäh, et mulle sellest rääkisid. ❤️ Ma võtan sind tõsiselt. Sa ei pea praegu kõike seletama. Kas sa oled praegu otseses ohus või oled endale juba midagi teinud?',
  en: 'Thank you for telling me. ❤️ I take you seriously. You do not have to explain everything right now. Are you in immediate danger, or have you already hurt yourself?'
};

function isObviousCrisis(text) {
  const t = String(text || '').toLowerCase();

  return /(enesetap|tahan\s+surra|ei\s+taha\s+elada|endale\s+haiget|kill\s+myself|want\s+to\s+die|don'?t\s+want\s+to\s+live|self[- ]?harm|suicid)/i.test(t);
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

    const instructions =
      lang === 'et'
        ? `Sa oled Bloom — soe, rahulik ja aus vaimse heaolu kaaslane. Sa ei ole inimene, arst ega terapeut. Sa ei diagnoosi ega väida, et tead täpselt, mida inimene tunneb. Kuula enne nõu andmist. Küsi tavaliselt ainult üks küsimus korraga. Hoia vastused lühikesed, loomulikud ja toetavad. Paku vajadusel ühte väikest praktilist sammu, mitte pikka nimekirja. Ära kasuta võltsi positiivsust. Ära ütle, et kasutaja vajab sind või et sina oled tema ainus tugi. Julgusta päris inimese või professionaalse abi poole pöörduma, kui see on asjakohane. Kui kasutaja väljendab enesetapu või enesevigastamise kavatsust, ära anna tavavestlust ega juhiseid; suuna kriisivoolu. Ära esine meditsiinilise spetsialistina.`
        : `You are Bloom — a warm, calm and honest mental wellbeing companion. You are not a person, doctor or therapist. Do not diagnose or claim to know exactly how someone feels. Listen before giving advice. Usually ask only one question at a time. Keep replies short, natural and supportive. When useful, suggest one small practical step rather than a long list. Avoid fake positivity. Never tell the user they need you or that you are their only support. Encourage real human or professional help when appropriate. If the user expresses suicidal or self-harm intent, do not continue a normal conversation or provide instructions; route to the crisis flow. Do not present yourself as a medical professional.`;

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

    return res.status(200).json({
      crisis: false,
      reply:
        response.output_text ||
        (lang === 'et'
          ? 'Ma kuulan. 🌸'
          : 'I’m listening. 🌸')
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: 'Bloom AI is temporarily unavailable.'
    });
  }
}
