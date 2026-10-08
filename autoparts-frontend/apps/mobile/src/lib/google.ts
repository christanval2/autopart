// ── Google Sign-In mobile (expo-auth-session) ──────────────────
// Les client_id Google sont fournis par le propriétaire du projet et
// se renseignent :
//   • via .env / eas.json :
//       EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB     (plateforme web)
//       EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID (Android natif)
//       EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS     (iOS natif)
//   • ou via app.json : extra.googleClientIdWeb / Android / IOS
// Tant qu'ils sont absents, le bouton Google reste désactivé avec un message
// clair — le reste du flow est fonctionnel dès leur arrivée.
import Constants from 'expo-constants';

export interface GoogleClientIds {
  webClientId?: string;
  androidClientId?: string;
  iosClientId?: string;
}

export function googleClientIds(): GoogleClientIds {
  const env = {
    web: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
    android: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    ios: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
  };
  const extra = Constants.expoConfig?.extra as
    | {
        googleClientIdWeb?: string;
        googleClientIdAndroid?: string;
        googleClientIdIOS?: string;
      }
    | undefined;

  return {
    webClientId: env.web ?? extra?.googleClientIdWeb,
    androidClientId: env.android ?? extra?.googleClientIdAndroid,
    iosClientId: env.ios ?? extra?.googleClientIdIOS,
  };
}

export function googleConfigured(): boolean {
  const ids = googleClientIds();
  return Boolean(ids.webClientId || ids.androidClientId || ids.iosClientId);
}
