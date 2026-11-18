import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time configuration. Values come from the environment (EAS env or a local .env):
 * - APP_BUNDLE_ID: iOS bundle identifier and Android package (default is a placeholder)
 * - APP_LINK_BASE_URL: https domain used for email links (universal links / app links)
 * - GOOGLE_IOS_URL_SCHEME: reversed iOS client ID from Google Cloud
 * - EXPO_PUBLIC_API_URL / EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID / EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: read at runtime
 */
const bundleId = process.env.APP_BUNDLE_ID ?? 'app.twocents.mobile';
const linkBase = process.env.APP_LINK_BASE_URL;
const linkHost = linkBase?.startsWith('https://') ? new URL(linkBase).host : undefined;
const googleIosUrlScheme =
  process.env.GOOGLE_IOS_URL_SCHEME ?? 'com.googleusercontent.apps.placeholder';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Two Cents',
  slug: 'two-cents',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'twocents',
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/expo.icon',
    bundleIdentifier: bundleId,
    usesAppleSignIn: true,
    associatedDomains: linkHost ? [`applinks:${linkHost}`] : [],
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    intentFilters: linkHost
      ? [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [
              { scheme: 'https', host: linkHost, pathPrefix: '/l/' },
              { scheme: 'https', host: linkHost, pathPrefix: '/i/' },
            ],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ]
      : [],
  },
  web: {
    output: 'server',
    favicon: './assets/images/favicon.png',
  },
  locales: {
    fr: './locales/fr.json',
    en: './locales/en.json',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'expo-secure-store',
    'expo-localization',
    'expo-sharing',
    'expo-apple-authentication',
    'expo-notifications',
    [
      'expo-local-authentication',
      { faceIDPermission: "Two Cents utilise Face ID pour déverrouiller l'app." },
    ],
    ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }],
    'expo-sqlite',
    [
      'expo-image-picker',
      {
        photosPermission: 'Two Cents accède à vos photos pour joindre un ticket de caisse.',
        cameraPermission: 'Two Cents utilise l’appareil photo pour photographier un ticket de caisse.',
        microphonePermission: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
