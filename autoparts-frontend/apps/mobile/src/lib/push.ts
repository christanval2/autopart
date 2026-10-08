// ── Push notifications Expo : permission → token → backend ────
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api, unwrap } from '@autoparts/api';

// Affiche les notifications même au premier plan
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function easProjectId(): string | undefined {
  return (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
}

/** Enregistre le token Expo push sur le compte connecté (POST /notifications/push-token). */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      // Les pushes Expo ne fonctionnent pas sur émulateur (sauf builds spéciaux Android)
      return null;
    }

    const settings = await Notifications.getPermissionsAsync();
    let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const ask = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      granted = ask.granted;
    }
    if (!granted) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Général',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1A4D8F',
      });
    }

    const projectId = easProjectId();
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;
    if (!token?.startsWith('ExponentPushToken[')) return null;

    await unwrap(api.post('/notifications/push-token', { token }));
    return token;
  } catch {
    // Non bloquant : le push se re-enregistrera au prochain login/démarrage
    return null;
  }
}
