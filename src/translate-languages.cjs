const LANGUAGES = [
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'en', name: 'English', native: 'English' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá' }
];

const BY_CODE = Object.fromEntries(LANGUAGES.map((item) => [item.code, item]));

function normalizeLanguage(code) {
  const value = String(code || '').trim().toLowerCase().replace('_', '-');
  if (value === 'auto') return 'auto';
  const primary = value.split('-')[0];
  return BY_CODE[primary] ? primary : '';
}

function resolveSystemLanguage(locale, fallback = 'id') {
  return normalizeLanguage(locale) || normalizeLanguage(fallback) || 'id';
}

module.exports = { LANGUAGES, BY_CODE, normalizeLanguage, resolveSystemLanguage };
