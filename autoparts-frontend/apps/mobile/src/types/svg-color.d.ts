// react-native-svg 15.15.4 a retiré `color` de SvgProps côté types (et son
// packaging Windows casse les chemins d'augmentation). lucide-react-native
// étend SvgProps et le runtime accepte toujours `color` — on ré-ajoute la
// prop sur les déclarations de LucideProps du package.
import 'lucide-react-native/dist/types/icons';
import 'lucide-react-native/dist/types/lucide-react-native';

declare module 'lucide-react-native/dist/types/icons' {
  interface LucideProps {
    color?: string;
  }
}

declare module 'lucide-react-native/dist/types/lucide-react-native' {
  interface LucideProps {
    color?: string;
  }
}
