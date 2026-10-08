import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

type Props = {
  eyebrow?: string;
  title: string;
  rightIcon?: LucideIcon;
  onPressRight?: () => void;
};

/** En-tête d'écran : surtitre en petites capitales + titre h1 + action à droite. */
export function ScreenHeader({ eyebrow, title, rightIcon: RightIcon, onPressRight }: Props) {
  return (
    <View className="flex-row items-center px-5 pb-4 pt-3">
      <View className="flex-1">
        {eyebrow ? (
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-[1.1px] text-slate-400">
            {eyebrow}
          </Text>
        ) : null}
        <Text className="text-[25px] font-bold leading-[31px] tracking-[-0.3px] text-slate-900 dark:text-slate-50">
          {title}
        </Text>
      </View>
      {RightIcon && onPressRight ? (
        <Pressable
          onPress={onPressRight}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(148,163,184,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <RightIcon size={20} color="#5B616E" />
        </Pressable>
      ) : null}
    </View>
  );
}
