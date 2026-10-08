import { Fragment, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import {
  ClipboardList,
  Home,
  Mic,
  ShoppingCart,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { useCartStore, selectCount } from '../store/cart.store';
import { radii } from '../theme/tokens';
import { useAppTheme } from '../theme/AppThemeProvider';

// ── Dock flottant animé : 4 onglets + bouton assistant vocal central ──
// Micro-interactions : chip de focus qui s'échelle derrière l'icône active,
// rebond d'icône à la pression, dash indicateur qui se déploie du centre,
// scale du bouton vocal. Les couleurs basculent instantanément (snap) —
// « tu es ici » se lit mieux en snap qu'en fondu.
const ACCENT = '#C92F3E';
const MUTED = '#97A0AC';
const DASH_WIDTH = 20;
const DASH_HEIGHT = 3;

type DockTabBarProps = {
  state: {
    index: number;
    routes: ReadonlyArray<{ key: string; name: string; params?: object | undefined }>;
  };
  navigation: {
    emit: (event: {
      type: 'tabPress';
      target?: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object | undefined) => void;
  };
};

type TabMeta = { icon: LucideIcon; label: string };

const TABS: Record<string, TabMeta> = {
  index: { icon: Home, label: 'Accueil' },
  panier: { icon: ShoppingCart, label: 'Panier' },
  commandes: { icon: ClipboardList, label: 'Commandes' },
  compte: { icon: User, label: 'Compte' },
};

function TabItem({
  focused,
  meta,
  isDark,
  badgeCount,
  onPress,
}: {
  focused: boolean;
  meta: TabMeta;
  isDark: boolean;
  badgeCount?: number;
  onPress: () => void;
}) {
  const pressScale = useSharedValue(1);
  const focusProgress = useSharedValue(focused ? 1 : 0);
  const iconBounce = useSharedValue(1);

  useEffect(() => {
    focusProgress.value = withSpring(focused ? 1 : 0, { damping: 16, stiffness: 180 });
  }, [focused]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const chipStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
    transform: [{ scale: 0.7 + focusProgress.value * 0.3 }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconBounce.value }],
  }));

  const dashStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
    transform: [{ scaleX: focusProgress.value }],
  }));

  // Snap, pas d'animation — voir note d'en-tête.
  const tint = focused ? ACCENT : MUTED;
  const Icon = meta.icon;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressScale.value = withTiming(0.9, { duration: 90 });
        iconBounce.value = withSpring(1.15, { damping: 8, stiffness: 260 });
      }}
      onPressOut={() => {
        pressScale.value = withTiming(1, { duration: 140 });
        iconBounce.value = withSpring(1, { damping: 8, stiffness: 260 });
      }}
      style={styles.item}
      hitSlop={8}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
    >
      <Animated.View style={[styles.itemInner, pressStyle]}>
        <View style={styles.iconSlot}>
          <Animated.View
            style={[
              styles.focusChip,
              { backgroundColor: isDark ? 'rgba(71,85,105,0.45)' : 'rgba(148,163,184,0.22)' },
              chipStyle,
            ]}
          />
          <Animated.View style={iconStyle}>
            {badgeCount != null ? (
              <View style={{ flexDirection: 'row' }}>
                <Icon size={21} color={tint} />
                {badgeCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badgeCount}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Icon size={21} color={tint} />
            )}
          </Animated.View>
        </View>
        <Text style={[styles.label, { color: tint, fontWeight: focused ? '700' : '500' }]} numberOfLines={1}>
          {meta.label}
        </Text>
      </Animated.View>
      <Animated.View style={[styles.dash, dashStyle]} />
    </Pressable>
  );
}

export function DockTabBar({ state, navigation }: DockTabBarProps) {
  const insets = useSafeAreaInsets();
  const { scheme } = useAppTheme();
  const isDark = scheme === 'dark';
  const scanScale = useSharedValue(1);
  const scanStyle = useAnimatedStyle(() => ({ transform: [{ scale: scanScale.value }] }));

  const cartCount = useCartStore(selectCount);

  // Seuls les onglets connus sont rendus ; le trou du scan coupe la liste visible.
  const visibleRoutes = state.routes.filter((route) => TABS[route.name]);
  const gapAfter = Math.ceil(visibleRoutes.length / 2);

  const renderTab = (route: { key: string; name: string; params?: object | undefined }, i: number) => {
    const meta = TABS[route.name];
    const focused = state.index === state.routes.findIndex((r) => r.key === route.key);
    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      void Haptics.selectionAsync();
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };
    return (
      <Fragment key={route.key}>
        {i === gapAfter && <View style={styles.scanGap} />}
        <TabItem
          focused={focused}
          meta={meta}
          isDark={isDark}
          badgeCount={route.name === 'panier' ? cartCount : undefined}
          onPress={onPress}
        />
      </Fragment>
    );
  };

  return (
    <View
      style={[
        styles.dock,
        {
          bottom: insets.bottom + 12,
          backgroundColor: isDark ? 'rgba(28,33,38,0.97)' : 'rgba(255,255,255,0.98)',
          borderColor: isDark ? 'rgba(71,85,105,0.5)' : 'rgba(148,163,184,0.35)',
          shadowOpacity: isDark ? 0.5 : 0.18,
        },
      ]}
    >
      <View style={styles.row}>
        {visibleRoutes.map((route, i) => renderTab(route, i))}
      </View>

      {/* Bouton assistant vocal central — scale à la pression, halo rouge */}
      <Pressable
        accessibilityRole="button"
        style={styles.scanWrap}
        hitSlop={10}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push('/vocal');
        }}
      >
        <Animated.View style={scanStyle}>
          <LinearGradient colors={['#E04553', '#C92F3E']} style={styles.scanBtn}>
            <Mic size={24} color="#FFFFFF" />
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 26,
    borderWidth: 1,
    shadowColor: '#0A0B0D',
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  row: { flexDirection: 'row', height: 64, alignItems: 'center' },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  itemInner: { alignItems: 'center', gap: 2 },
  iconSlot: {
    width: 40,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusChip: {
    position: 'absolute',
    width: 40,
    height: 30,
    borderRadius: radii.md,
  },
  scanGap: { width: 58 },
  label: { fontSize: 11, letterSpacing: 0.2 },
  dash: {
    position: 'absolute',
    bottom: 5,
    left: '50%',
    marginLeft: -(DASH_WIDTH / 2),
    width: DASH_WIDTH,
    height: DASH_HEIGHT,
    borderRadius: DASH_HEIGHT / 2,
    backgroundColor: ACCENT,
  },
  badge: {
    position: 'absolute',
    right: -8,
    top: -6,
    borderRadius: 999,
    backgroundColor: '#3874FF',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  scanWrap: {
    position: 'absolute',
    bottom: 18,
    left: '50%',
    marginLeft: -29,
  },
  scanBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C92F3E',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
});
