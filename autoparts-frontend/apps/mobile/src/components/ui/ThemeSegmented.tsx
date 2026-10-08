import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme, type ThemePreference } from '../../theme/AppThemeProvider';

type Props = {
  value: ThemePreference;
  onChange: (v: ThemePreference) => void;
  options: Array<{ value: ThemePreference; label: string; icon: LucideIcon }>;
};

/** Segmented control à pilule coulissante — sélection du thème (auto/clair/sombre). */
export function ThemeSegmented({ value, onChange, options }: Props) {
  const { scheme } = useAppTheme();
  const isDark = scheme === 'dark';
  const [trackWidth, setTrackWidth] = useState(0);
  const segWidth = trackWidth > 0 ? (trackWidth - 8) / options.length : 0;
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const left = useSharedValue(4);
  useEffect(() => {
    if (segWidth > 0) {
      left.value = withSpring(4 + index * segWidth, { damping: 18, stiffness: 220 });
    }
  }, [index, segWidth, left]);

  const pillStyle = useAnimatedStyle(() => ({
    left: left.value,
    width: segWidth,
  }));

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      className={`relative mx-3.5 mb-3.5 h-[46px] flex-row rounded-[14px] p-1 ${
        isDark ? 'bg-white/5' : 'bg-slate-900/5'
      }`}
    >
      {segWidth > 0 ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 4,
              bottom: 4,
              borderRadius: 11,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.4)',
              backgroundColor: isDark ? '#333B43' : '#FFFFFF',
              shadowColor: '#0A0B0D',
              shadowOpacity: 0.06,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            },
            { width: segWidth },
            pillStyle,
          ]}
        />
      ) : null}
      {options.map((opt) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className="z-10 flex-1 flex-row items-center justify-center gap-1.5"
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Icon size={15} color={selected ? '#C92F3E' : '#97A0AC'} />
            <Text
              className={`text-[13px] ${selected ? 'font-semibold text-slate-900 dark:text-slate-50' : 'text-slate-400'}`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
