import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import fr from './fr.json';

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Device language if supported, else French (constitution Principle VI). */
export function deviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'fr';
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: deviceLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
