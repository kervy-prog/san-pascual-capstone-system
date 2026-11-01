import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { App } from '@capacitor/app';

if (Capacitor.isNativePlatform()) {
  window.sanPascualNativeLocation = async () => {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  };
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.exitApp();
  }).catch((error) => console.error('Unable to configure Android back button:', error));
}
