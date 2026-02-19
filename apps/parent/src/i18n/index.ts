import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

// Import all locale files
const resources = {
  en: { translation: en },
}

// Dynamically load translations for other languages
const loadedLanguages = new Set(['en'])

export async function loadLanguage(lang: string): Promise<void> {
  if (loadedLanguages.has(lang)) return

  try {
    const module = await import(`./locales/${lang}.json`)
    i18n.addResourceBundle(lang, 'translation', module.default)
    loadedLanguages.add(lang)
  } catch (error) {
    console.warn(`Translation file for ${lang} not found, falling back to English`)
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
  })

export default i18n
