import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { IconTile } from './IconTile';

type Props = {
  icon: LucideIcon;
  title: string;
  body?: string;
  /** Label du bouton d'action facultatif (ex. « Voir le catalogue »). */
  actionLabel?: string;
  onAction?: () => void;
};

/** État vide : tuile icône + titre + corps + action, avec entrée fondu + glissée. */
export function EmptyState({ icon, title, body, actionLabel, onAction }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(80, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  return (
    <Animated.View
      style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 20 }, animatedStyle]}
    >
      <IconTile icon={icon} size={72} />
      <Text className="mt-5 text-center text-[21px] font-bold tracking-[-0.5px] text-slate-900 dark:text-slate-50">
        {title}
      </Text>
      {body ? (
        <Text className="mt-2.5 max-w-[300px] text-center text-sm leading-[21px] text-slate-400">
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Text
          onPress={onAction}
          className="mt-5 rounded-full border-[1.5px] border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:text-slate-100"
        >
          {actionLabel}
        </Text>
      ) : null}
    </Animated.View>
  );
}
