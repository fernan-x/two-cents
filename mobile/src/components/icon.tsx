/**
 * App icons. The Nestly Figma set is Lucide (ISC); keys are the Figma layer names (`icon/<key>`),
 * plus a few extras the app needs. Import one file per icon so the bundle only carries these.
 */
import type { LucideIcon } from 'lucide-react-native';
import { Platform } from 'react-native';
import ArrowDownLeft from 'lucide-react-native/icons/arrow-down-left';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import Bell from 'lucide-react-native/icons/bell';
import Calendar from 'lucide-react-native/icons/calendar';
import Camera from 'lucide-react-native/icons/camera';
import Car from 'lucide-react-native/icons/car';
import ChartColumn from 'lucide-react-native/icons/chart-column';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import Circle from 'lucide-react-native/icons/circle';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleHelp from 'lucide-react-native/icons/circle-help';
import CircleUser from 'lucide-react-native/icons/circle-user';
import Clock from 'lucide-react-native/icons/clock';
import Coffee from 'lucide-react-native/icons/coffee';
import Coins from 'lucide-react-native/icons/coins';
import Copy from 'lucide-react-native/icons/copy';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Crown from 'lucide-react-native/icons/crown';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Eye from 'lucide-react-native/icons/eye';
import File from 'lucide-react-native/icons/file';
import Flame from 'lucide-react-native/icons/flame';
import Gift from 'lucide-react-native/icons/gift';
import Globe from 'lucide-react-native/icons/globe';
import GraduationCap from 'lucide-react-native/icons/graduation-cap';
import Heart from 'lucide-react-native/icons/heart';
import House from 'lucide-react-native/icons/house';
import Info from 'lucide-react-native/icons/info';
import Landmark from 'lucide-react-native/icons/landmark';
import Laptop from 'lucide-react-native/icons/laptop';
import Link from 'lucide-react-native/icons/link';
import Lock from 'lucide-react-native/icons/lock';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Moon from 'lucide-react-native/icons/moon';
import Palette from 'lucide-react-native/icons/palette';
import Pen from 'lucide-react-native/icons/pen';
import Percent from 'lucide-react-native/icons/percent';
import Plane from 'lucide-react-native/icons/plane';
import Plus from 'lucide-react-native/icons/plus';
import PoundSterling from 'lucide-react-native/icons/pound-sterling';
import Receipt from 'lucide-react-native/icons/receipt';
import Repeat from 'lucide-react-native/icons/repeat';
import ScanFace from 'lucide-react-native/icons/scan-face';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import Share2 from 'lucide-react-native/icons/share-2';
import Shield from 'lucide-react-native/icons/shield';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Smartphone from 'lucide-react-native/icons/smartphone';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Star from 'lucide-react-native/icons/star';
import Target from 'lucide-react-native/icons/target';
import TrainFront from 'lucide-react-native/icons/train-front';
import Trash from 'lucide-react-native/icons/trash';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import Trophy from 'lucide-react-native/icons/trophy';
import Tv from 'lucide-react-native/icons/tv';
import Umbrella from 'lucide-react-native/icons/umbrella';
import User from 'lucide-react-native/icons/user';
import Users from 'lucide-react-native/icons/users';
import X from 'lucide-react-native/icons/x';
import Zap from 'lucide-react-native/icons/zap';

import { type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ICONS = {
  home: House,
  target: Target,
  chart: ChartColumn,
  user: User,
  car: Car,
  trend: TrendingUp,
  arrowR: ArrowRight,
  coffee: Coffee,
  repeat: Repeat,
  percent: Percent,
  coins: Coins,
  mail: Mail,
  lock: Lock,
  eye: Eye,
  check: Check,
  face: ScanFace,
  arrowL: ArrowLeft,
  info: Info,
  bell: Bell,
  search: Search,
  calendar: Calendar,
  chevD: ChevronDown,
  umbrella: Umbrella,
  plane: Plane,
  heart: Heart,
  cap: GraduationCap,
  laptop: Laptop,
  plus: Plus,
  chevR: ChevronRight,
  shield: Shield,
  link: Link,
  out: ArrowUpRight,
  more: Ellipsis,
  clock: Clock,
  edit: Pen,
  sparkle: Sparkles,
  trash: Trash,
  cart: ShoppingCart,
  card: CreditCard,
  bank: Landmark,
  trophy: Trophy,
  share: Share2,
  sliders: SlidersHorizontal,
  inc: ArrowDownLeft,
  doc: File,
  train: TrainFront,
  receipt: Receipt,
  tv: Tv,
  flame: Flame,
  star: Star,
  zap: Zap,
  crown: Crown,
  gift: Gift,
  copy: Copy,
  users: Users,
  help: CircleHelp,
  logout: LogOut,
  camera: Camera,
  phone: Smartphone,
  globe: Globe,
  pound: PoundSterling,
  palette: Palette,
  moon: Moon,
  x: X,
  chevU: ChevronUp,
  msg: MessageSquare,
  switch: ArrowLeftRight,
  alert: CircleAlert,
  settings: Settings,
  account: CircleUser,
  radioOff: Circle,
  radioOn: CircleCheck,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;


/**
 * Icons are decorative. Native screen readers skip them through the RN accessibility props; on web
 * the icon is a plain `<svg>` that does not know those props (React warns), so it uses `aria-hidden`.
 */
const HIDDEN_FROM_SCREEN_READERS =
  Platform.OS === 'web'
    ? ({ 'aria-hidden': true } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);
/**
 * Decorative by default (hidden from screen readers): the surrounding control carries the label.
 * Stroke stays 2pt at any size, as in Figma.
 */
export function Icon({
  name,
  size = 20,
  color,
  themeColor = 'text',
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  themeColor?: ThemeColor;
  strokeWidth?: number;
}) {
  const theme = useTheme();
  const Component = ICONS[name];
  return (
    <Component
      size={size}
      color={color ?? theme[themeColor]}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      {...HIDDEN_FROM_SCREEN_READERS}
    />
  );
}
