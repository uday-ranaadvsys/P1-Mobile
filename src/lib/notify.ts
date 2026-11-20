import { Alert, Platform, ToastAndroid } from 'react-native';

/** A short message that goes away by itself (a toast on Android, an alert on iPhone). */
export function notify(message: string | null) {
  if (!message) return;
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.LONG);
  else Alert.alert(message);
}
