import { GROQ_API_KEY, GROQ_MODEL } from './env.js'

/** Groq: abandoned-cart copy + AI search query intent (Gemini still does embeddings). */
export const isGroqConfigured = () => Boolean(GROQ_API_KEY)

if (GROQ_API_KEY) {
  console.info(`[Groq] client initialized ✅  (model: ${GROQ_MODEL}, cart reminders + search intent)`)
} else {
  console.warn('[Groq] No GROQ_API_KEY — cart reminders use templates; search intent disabled.')
}

export async function groqChatCompletion(prompt, { temperature = 0.8, max_tokens = 150 } = {}) {
  if (!GROQ_API_KEY) return null

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      messages:    [{ role: 'user', content: prompt }],
      temperature,
      max_tokens,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Groq API ${res.status}: ${errBody}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? null
}

/** JSON response — strips optional markdown fences. */
export async function groqJsonCompletion(prompt, opts = {}) {
  const text = await groqChatCompletion(prompt, { temperature: 0.1, max_tokens: 256, ...opts })
  if (!text) return null
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : null
  }
}
