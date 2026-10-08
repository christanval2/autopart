import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

type Props = {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  /** Petit badge à droite du label (compteur, point…) — texte seul. */
  badge?: string;
  /** Valeur affichée à droite (ex. « Français »), en gris moyen. */
  value?: string;
  onPress: () => void;
  isLast?: boolean;
};

/** Ligne de navigation type réglages : tuile icône bordée + label + valeur/chevron. */
export function OptionRow({ icon: Icon, label, subtitle, badge, value, onPress, isLast = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => (pressed ? { backgroundColor: 'rgba(148,163,184,0.12)' } : undefined)}
      className={`flex-row items-center gap-3 p-3.5 ${isLast ? '' : 'border-b border-slate-200 dark:border-slate-700'}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900">
        <Icon size={17} color="#C92F3E" />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-slate-900 dark:text-slate-50">{label}</Text>
        {subtitle ? (
          <Text className="text-xs text-slate-400">{subtitle}</Text>
        ) : null}
      </View>
      {badge ? (
        <Text className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
          {badge}
        </Text>
      ) : null}
      {value ? (
        <Text className="max-w-[120px] shrink text-[13px] font-medium text-slate-400">{value}</Text>
      ) : null}
      <ChevronRight size={17} color="#97A0AC" />
    </Pressable>
  );
}
