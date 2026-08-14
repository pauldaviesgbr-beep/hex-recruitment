'use client'

// THE ICON MODULE — design phase 1, from the 14 Aug handoff.
//
// One geometry everywhere: Lucide, 24x24 viewBox, no fill, currentColor,
// round caps and joins. Three sizes and no others — 16 (stroke 2, inline with
// body text), 20 (stroke 1.75, buttons/chips/cells), 24 (stroke 1.75, nav and
// headers). An icon never has a colour of its own: it inherits the text
// beside it. Beside a label it is decorative, so aria-hidden by default; an
// icon-only control passes a label and gets role/aria-label instead.
//
// Every emoji-as-iconography in the product routes through here now. If a new
// surface needs an icon, it gets an entry in this table — not an emoji, and
// not a one-off import of lucide-react somewhere else.

import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle, Apple, Ban, Banknote, BarChart3, Bell, Box, Briefcase, Building2,
  Cake, Calendar, Camera, Check, ChefHat, Clock, Compass, CreditCard, Eye,
  File, FileText, Flag, FlaskConical, Flame, Folder, Gift, Globe, Handshake,
  HelpCircle, Home, Image as ImageIcon, Inbox, Info, Key, Laptop, Lightbulb,
  Link as LinkIcon, Lock, LockOpen, Mail, MapPin, MessageSquare, Mic,
  Package, Paperclip, PartyPopper, Pause, Pencil, Phone, Radio, RefreshCw,
  Rocket, Search, Settings, Shield, Smartphone, Sparkles, Star, Tag, Tent,
  Timer, Trash2, TrendingUp, User, Users, UtensilsCrossed, Video, X, Zap,
  Martini,
} from 'lucide-react'

export const ICONS = {
  'alert-triangle': AlertTriangle,
  apple: Apple,
  ban: Ban,
  banknote: Banknote,
  'bar-chart-3': BarChart3,
  bell: Bell,
  box: Box,
  briefcase: Briefcase,
  building: Building2,
  cake: Cake,
  calendar: Calendar,
  camera: Camera,
  check: Check,
  'chef-hat': ChefHat,
  clock: Clock,
  compass: Compass,
  'credit-card': CreditCard,
  eye: Eye,
  file: File,
  'file-text': FileText,
  flag: Flag,
  flame: Flame,
  flask: FlaskConical,
  folder: Folder,
  gift: Gift,
  globe: Globe,
  handshake: Handshake,
  'help-circle': HelpCircle,
  home: Home,
  image: ImageIcon,
  inbox: Inbox,
  info: Info,
  key: Key,
  laptop: Laptop,
  lightbulb: Lightbulb,
  link: LinkIcon,
  lock: Lock,
  'lock-open': LockOpen,
  mail: Mail,
  'map-pin': MapPin,
  martini: Martini,
  'message-square': MessageSquare,
  mic: Mic,
  package: Package,
  paperclip: Paperclip,
  'party-popper': PartyPopper,
  pause: Pause,
  pencil: Pencil,
  phone: Phone,
  radio: Radio,
  'refresh-cw': RefreshCw,
  rocket: Rocket,
  search: Search,
  settings: Settings,
  shield: Shield,
  smartphone: Smartphone,
  sparkles: Sparkles,
  star: Star,
  tag: Tag,
  tent: Tent,
  timer: Timer,
  trash: Trash2,
  'trending-up': TrendingUp,
  user: User,
  users: Users,
  utensils: UtensilsCrossed,
  video: Video,
  x: X,
  zap: Zap,
} as const

export type IconName = keyof typeof ICONS

interface IcoProps {
  name: IconName
  /** 16 | 20 | 24 — nothing larger; an icon is never a picture. */
  size?: 16 | 20 | 24
  /** Only for icon-only controls; beside a text label leave it off. */
  label?: string
  className?: string
  style?: React.CSSProperties
}

export function Ico({ name, size = 20, label, className, style }: IcoProps) {
  const C: LucideIcon = ICONS[name]
  return (
    <C
      size={size}
      strokeWidth={size === 16 ? 2 : 1.75}
      absoluteStrokeWidth={false}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={className}
      style={{ verticalAlign: 'middle', flexShrink: 0, ...style }}
    />
  )
}
