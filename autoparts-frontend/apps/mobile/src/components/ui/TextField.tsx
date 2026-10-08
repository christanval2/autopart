import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

type Props = {
  label: string;
  icon?: LucideIcon;
  error?: string | null;
  secure?: boolean;
} & TextInputProps;

/** Champ à label + icône optionnelle + anneau de focus + message d'erreur. */
export function TextField({ label, icon: Icon, error, secure = false, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View className="mb-4">
      <Text className="mb-2 ml-0.5 text-[13px] font-medium text-slate-500 dark:text-slate-400">
        {label}
      </Text>
      <View
        className={`h-14 flex-row items-center rounded-2xl border bg-white px-4 dark:bg-slate-800 ${
          error
            ? 'border-danger/50'
            : focused
              ? 'border-primary'
              : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {Icon ? (
          <Icon
            size={18}
            color={focused ? '#1A4D8F' : '#97A0AC'}
          />
        ) : null}
        <TextInput
          {...inputProps}
          className={`flex-1 py-0 text-[15px] text-slate-900 dark:text-slate-100 ${Icon ? 'pl-3' : ''}`}
          placeholderTextColor="#A6A5AD"
          secureTextEntry={secure}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
        />
      </View>
      {error ? <Text className="ml-0.5 mt-1.5 text-xs font-medium text-danger">{error}</Text> : null}
    </View>
  );
}
