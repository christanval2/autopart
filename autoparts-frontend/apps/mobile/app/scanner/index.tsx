import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { productsApi, searchApi } from '@autoparts/api';

/** Scanner code-barres / QR OEM → recherche du produit par code scanné. */
export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission) {
    return <View className="flex-1 bg-slate-900" />;
  }
  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-900 px-6">
        <Text className="mb-3 text-center text-sm text-slate-300">
          La caméra est nécessaire pour scanner les codes-barres OEM.
        </Text>
        <Pressable className="rounded-lg bg-primary px-5 py-2.5" onPress={requestPermission}>
          <Text className="font-semibold text-white">Autoriser la caméra</Text>
        </Pressable>
      </View>
    );
  }

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    try {
      // Le code scanné (EAN/OEM) est recherché dans le catalogue full-text
      const results = await searchApi.search({ q: data, limit: 1 });
      const first = results.items?.[0];
      if (first) {
        router.push(`/produits/${first.id}`);
      } else {
        router.push({ pathname: '/(tabs)', params: { q: data } });
      }
    } catch {
      router.back();
    } finally {
      setTimeout(() => setScanned(false), 2500);
    }
  };

  return (
    <View className="flex-1 bg-slate-900">
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'qr', 'code128'] }}
        onBarcodeScanned={handleScan}
      />
      <View className="absolute bottom-10 left-0 right-0 items-center">
        <Text className="rounded-full bg-black/60 px-4 py-2 text-xs text-white">
          Alignez le code-barres OEM dans le cadre
        </Text>
      </View>
    </View>
  );
}
