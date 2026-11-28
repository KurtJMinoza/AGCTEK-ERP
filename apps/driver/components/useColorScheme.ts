import { useColorScheme as useColorSchemeCore } from 'react-native';

export const useColorScheme = () => {
  return useColorSchemeCore() ?? 'light';
};
