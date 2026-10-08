import { Pressable, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Désactive l'effet pilule pleine largeur (par défaut : pleine largeur). */
  inline?: boolean;
  className?: string;
  textClassName?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const VARIANTS: Record<Variant, { container: string; label: string }> = {
  primary: { container: 'bg-primary', label: 'text-white' },
  accent: { container: 'bg-accent', label: 'text-white' },
  outline: {
    container: 'border-[1.5px] border-slate-300 bg-transparent dark:border-slate-600',
    label: 'text-slate-800 dark:text-slate-100',
  },
  ghost: { container: 'bg-transparent', label: 'text-slate-800 dark:text-slate-100' },
  danger: { container: 'bg-danger', label: 'text-white' },
};

/** Bouton pilule avec retour haptique et micro-scale à la pression. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  inline = false,
  className = '',
  textClassName = '',
}: Props) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.035 }],
    opacity: disabled ? 0.4 : 1 - pressed.value * 0.08,
  }));

  const v = VARIANTS[variant];

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 90 });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 160 });
      }}
      onPress={onPress}
      className={`items-center justify-center rounded-full py-[15px] px-6 ${
        inline ? 'self-start px-5' : 'self-stretch'
      } ${v.container} ${disabled ? 'opacity-40' : ''} ${className}`}
      style={animatedStyle}
    >
      <Text className={`text-base font-semibold ${v.label} ${textClassName}`}>{label}</Text>
    </AnimatedPressable>
  );
}
