// Translation service using Google Cloud Translation API
// Falls back to returning original text if API key is not set

// Use a getter to ensure env is loaded after dotenv.config()
function getApiKey(): string | undefined {
  return process.env.GOOGLE_TRANSLATE_API_KEY
}

// Simple in-memory cache for translations
// Key format: `${targetLang}:${hash(text)}`
const translationCache = new Map<string, { text: string; timestamp: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Simple hash function for cache keys
function simpleHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(36)
}

function getCacheKey(text: string, targetLang: string): string {
  return `${targetLang}:${simpleHash(text)}`
}

// Clean expired cache entries periodically
function cleanCache(): void {
  const now = Date.now()
  for (const [key, value] of translationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      translationCache.delete(key)
    }
  }
}

// Run cache cleanup every hour
setInterval(cleanCache, 60 * 60 * 1000)

// Supported languages (ISO 639-1 codes)
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'bn', name: 'বাংলা (Bengali)' },
  { code: 'zh', name: '中文 (Chinese)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'gu', name: 'ગુજરાતી (Gujarati)' },
  { code: 'hi', name: 'हिन्दी (Hindi)' },
  { code: 'it', name: 'Italiano (Italian)' },
  { code: 'ja', name: '日本語 (Japanese)' },
  { code: 'ko', name: '한국어 (Korean)' },
  { code: 'pl', name: 'Polski (Polish)' },
  { code: 'pt', name: 'Português (Portuguese)' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'ro', name: 'Română (Romanian)' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'so', name: 'Soomaali (Somali)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'ta', name: 'தமிழ் (Tamil)' },
  { code: 'tr', name: 'Türkçe (Turkish)' },
  { code: 'uk', name: 'Українська (Ukrainian)' },
  { code: 'ur', name: 'اردو (Urdu)' },
  { code: 'vi', name: 'Tiếng Việt (Vietnamese)' },
] as const

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['code']

/**
 * Translate a single text string to the target language
 * Returns original text if translation fails or API key not configured
 */
export async function translateText(
  text: string,
  targetLang: string
): Promise<string> {
  // Don't translate if target is English (source language)
  if (targetLang === 'en' || !text || text.trim() === '') {
    return text
  }

  // Check cache first
  const cacheKey = getCacheKey(text, targetLang)
  const cached = translationCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.text
  }

  // If no API key, return original text
  const apiKey = getApiKey()
  if (!apiKey) {
    console.log(`[Translation] No API key configured, returning original text`)
    return text
  }

  try {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'en',
          target: targetLang,
          format: 'text',
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('[Translation] API error:', error)
      return text
    }

    const data = await response.json()
    const translatedText = data.data?.translations?.[0]?.translatedText

    if (translatedText) {
      // Cache the result
      translationCache.set(cacheKey, {
        text: translatedText,
        timestamp: Date.now(),
      })
      return translatedText
    }

    return text
  } catch (error) {
    console.error('[Translation] Failed to translate:', error)
    return text
  }
}

/**
 * Translate multiple texts in a single API call (more efficient)
 * Returns array of translated texts in same order as input
 */
export async function translateTexts(
  texts: string[],
  targetLang: string
): Promise<string[]> {
  // Don't translate if target is English
  if (targetLang === 'en') {
    return texts
  }

  // Check cache for all texts, identify which need translation
  const results: string[] = new Array(texts.length)
  const textsToTranslate: { index: number; text: string }[] = []

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]
    if (!text || text.trim() === '') {
      results[i] = text
      continue
    }

    const cacheKey = getCacheKey(text, targetLang)
    const cached = translationCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      results[i] = cached.text
    } else {
      textsToTranslate.push({ index: i, text })
    }
  }

  // If all texts were cached, return early
  if (textsToTranslate.length === 0) {
    return results
  }

  // If no API key, return original texts
  const apiKey = getApiKey()
  if (!apiKey) {
    console.log(`[Translation] No API key configured, returning original texts`)
    for (const { index, text } of textsToTranslate) {
      results[index] = text
    }
    return results
  }

  try {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: textsToTranslate.map(t => t.text),
          source: 'en',
          target: targetLang,
          format: 'text',
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('[Translation] API error:', error)
      // Return original texts for failed translations
      for (const { index, text } of textsToTranslate) {
        results[index] = text
      }
      return results
    }

    const data = await response.json()
    const translations = data.data?.translations || []

    for (let i = 0; i < textsToTranslate.length; i++) {
      const { index, text } = textsToTranslate[i]
      const translatedText = translations[i]?.translatedText || text

      // Cache the result
      const cacheKey = getCacheKey(text, targetLang)
      translationCache.set(cacheKey, {
        text: translatedText,
        timestamp: Date.now(),
      })

      results[index] = translatedText
    }

    return results
  } catch (error) {
    console.error('[Translation] Failed to translate batch:', error)
    // Return original texts for failed translations
    for (const { index, text } of textsToTranslate) {
      results[index] = text
    }
    return results
  }
}

/**
 * Translate an object's specified fields
 * Returns a new object with translated fields
 */
export async function translateFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
  targetLang: string
): Promise<T> {
  if (targetLang === 'en') {
    return obj
  }

  const textsToTranslate: string[] = []
  for (const field of fields) {
    const value = obj[field]
    if (typeof value === 'string') {
      textsToTranslate.push(value)
    }
  }

  if (textsToTranslate.length === 0) {
    return obj
  }

  const translations = await translateTexts(textsToTranslate, targetLang)

  const result = { ...obj }
  let translationIndex = 0

  for (const field of fields) {
    if (typeof obj[field] === 'string') {
      (result[field] as string) = translations[translationIndex++]
    }
  }

  return result
}

/**
 * Translate an array of objects
 */
export async function translateArray<T extends Record<string, unknown>>(
  items: T[],
  fields: (keyof T)[],
  targetLang: string
): Promise<T[]> {
  if (targetLang === 'en' || items.length === 0) {
    return items
  }

  // Collect all texts to translate
  const allTexts: string[] = []
  const textMap: { itemIndex: number; field: keyof T; textIndex: number }[] = []

  for (let i = 0; i < items.length; i++) {
    for (const field of fields) {
      const value = items[i][field]
      if (typeof value === 'string' && value.trim() !== '') {
        textMap.push({ itemIndex: i, field, textIndex: allTexts.length })
        allTexts.push(value)
      }
    }
  }

  if (allTexts.length === 0) {
    return items
  }

  // Translate all texts in one batch
  const translations = await translateTexts(allTexts, targetLang)

  // Apply translations to items
  const results = items.map(item => ({ ...item }))

  for (const { itemIndex, field, textIndex } of textMap) {
    (results[itemIndex][field] as string) = translations[textIndex]
  }

  return results
}

// Export cache stats for debugging/monitoring
export function getCacheStats(): { size: number; hitRate: string } {
  return {
    size: translationCache.size,
    hitRate: 'N/A', // Could track hits/misses if needed
  }
}
