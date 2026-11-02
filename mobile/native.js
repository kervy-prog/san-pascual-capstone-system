import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

if (Capacitor.isNativePlatform()) {
  window.sanPascualTakePhoto = async () => {
    let photo;
    try {
      photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 85,
        correctOrientation: true,
        saveToGallery: false,
      });
    } catch (error) {
      if (error instanceof Error && /user cancel(?:led|ed)/i.test(error.message)) return null;
      throw error;
    }
    if (!photo.webPath) throw new Error('Camera did not return a readable photo.');
    const response = await fetch(photo.webPath);
    if (!response.ok) throw new Error('Unable to read the captured photo.');
    const blob = await response.blob();
    return new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
  };
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
