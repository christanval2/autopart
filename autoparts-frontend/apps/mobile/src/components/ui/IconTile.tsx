import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

type Props = {
  icon: LucideIcon;
  size?: number;
  tone?: 'elevated' | 'outline';
};

/** Tuile icône carrée (rayon = 34 % de la taille) — motif récurrent des états vides et réglages. */
export function IconTile({ icon: Icon, size = 64, tone = 'elevated' }: Props) {
  return (
    <View
      className={`items-center justify-center ${
        tone === 'elevated'
          ? 'bg-slate-100 dark:bg-slate-800'
          : 'border border-slate-200 bg-transparent dark:border-slate-700'
      }`}
      style={{ width: size, height: size, borderRadius: size * 0.34 }}
    >
      <Icon size={Math.round(size * 0.42)} color="#C92F3E" />
    </View>
  );
}
