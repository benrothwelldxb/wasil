#!/usr/bin/env node

/**
 * Translation Generator Script
 *
 * Generates translation files for all supported languages using Google Translate API.
 *
 * Usage: node scripts/generate-translations.js
 *
 * Requires GOOGLE_TRANSLATE_API_KEY environment variable.
 */

const fs = require('fs')
const path = require('path')

const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY

const SUPPORTED_LANGUAGES = [
  { code: 'ar', name: 'Arabic' },
  { code: 'bn', name: 'Bengali' },
  { code: 'zh', name: 'Chinese' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'hi', name: 'Hindi' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'so', name: 'Somali' },
  { code: 'es', name: 'Spanish' },
  { code: 'ta', name: 'Tamil' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'vi', name: 'Vietnamese' },
]

async function translateText(text, targetLang) {
  if (!text || text.trim() === '') return text

  // Skip interpolation placeholders
  if (text.includes('{{') && text.includes('}}')) {
    // Extract and preserve placeholders
    const placeholders = []
    const withPlaceholders = text.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      placeholders.push({ match, name })
      return `__PLACEHOLDER_${placeholders.length - 1}__`
    })

    const translated = await translateSingleText(withPlaceholders, targetLang)

    // Restore placeholders
    let result = translated
    placeholders.forEach((p, i) => {
      result = result.replace(`__PLACEHOLDER_${i}__`, p.match)
    })
    return result
  }

  return translateSingleText(text, targetLang)
}

async function translateSingleText(text, targetLang) {
  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    throw new Error(`Translation API error: ${error}`)
  }

  const data = await response.json()
  return data.data?.translations?.[0]?.translatedText || text
}

async function translateObject(obj, targetLang) {
  const result = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = await translateText(value, targetLang)
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50))
    } else if (typeof value === 'object' && value !== null) {
      result[key] = await translateObject(value, targetLang)
    } else {
      result[key] = value
    }
  }

  return result
}

async function main() {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    console.error('Error: GOOGLE_TRANSLATE_API_KEY environment variable is required')
    process.exit(1)
  }

  const localesDir = path.join(__dirname, '..', 'src', 'i18n', 'locales')
  const enPath = path.join(localesDir, 'en.json')

  if (!fs.existsSync(enPath)) {
    console.error('Error: English translation file not found at', enPath)
    process.exit(1)
  }

  const enTranslations = JSON.parse(fs.readFileSync(enPath, 'utf8'))

  console.log('Starting translation generation...\n')

  for (const lang of SUPPORTED_LANGUAGES) {
    const outPath = path.join(localesDir, `${lang.code}.json`)

    // Skip if already exists
    if (fs.existsSync(outPath)) {
      console.log(`Skipping ${lang.name} (${lang.code}) - file already exists`)
      continue
    }

    console.log(`Translating to ${lang.name} (${lang.code})...`)

    try {
      const translated = await translateObject(enTranslations, lang.code)
      fs.writeFileSync(outPath, JSON.stringify(translated, null, 2))
      console.log(`  ✓ Created ${lang.code}.json`)
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`)
    }
  }

  console.log('\nTranslation generation complete!')
}

main().catch(console.error)
