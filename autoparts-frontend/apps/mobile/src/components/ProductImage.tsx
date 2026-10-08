import { useState } from 'react';
import { Image, Text, View } from 'react-native';

// Origine du backend (l'API est servie sous /api/v1, les uploads à la racine).
const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/api\/v1\/?$/, '');

/** Convertit une URL d'image relative du backend en URL absolue. */
export function assetUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

type Props = {
  url?: string | null;
  alt?: string;
  className?: string;
  /** Classes du conteneur (fond) affiché derrière l'image. */
  containerClassName?: string;
};

/** Image produit avec repli 🔧 si l'URL est absente ou en échec de chargement. */
export function ProductImage({ url, alt, className = '', containerClassName = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const uri = assetUrl(url);

  return (
    <View className={`items-center justify-center bg-slate-100 dark:bg-slate-700 ${containerClassName}`}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          className={`h-full w-full ${className}`}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityLabel={alt}
        />
      ) : (
        <Text className="text-3xl">🔧</Text>
      )}
    </View>
  );
}
