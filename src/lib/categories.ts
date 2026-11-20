import type { IconName } from '@/components/icon-glyphs';
import type { CategoryId, PayMethod } from './types';

export type Category = {
  id: CategoryId;
  label: string;
  icon: IconName;
  /** [light, dark] */
  color: [string, string];
  keywords: string[];
};

export const CATEGORIES: readonly Category[] = [
  {
    id: 'food',
    label: 'Food',
    icon: 'fork-knife',
    color: ['#E0703F', '#FF9A6B'],
    keywords: ['food', 'lunch', 'dinner', 'breakfast', 'swiggy', 'zomato', 'pizza', 'biryani', 'restaurant', 'snack', 'snacks', 'meal', 'burger', 'dosa', 'thali', 'eat', 'dominos', 'kfc', 'mcdonalds'],
  },
  {
    id: 'groceries',
    label: 'Groceries',
    icon: 'basket',
    color: ['#4C9A6A', '#6FD39A'],
    keywords: ['grocery', 'groceries', 'blinkit', 'zepto', 'bigbasket', 'instamart', 'vegetables', 'veggies', 'fruits', 'milk', 'dmart', 'kirana', 'supermarket'],
  },
  {
    id: 'transport',
    label: 'Transport',
    icon: 'taxi',
    color: ['#3A6FD0', '#7FA6FF'],
    keywords: ['uber', 'ola', 'rapido', 'cab', 'taxi', 'auto', 'metro', 'bus', 'train', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'fastag'],
  },
  {
    id: 'shopping',
    label: 'Shopping',
    icon: 'shopping-bag',
    color: ['#B4508A', '#E27DB8'],
    keywords: ['amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'clothes', 'shoes', 'meesho', 'nykaa', 'shirt', 'jeans'],
  },
  {
    id: 'bills',
    label: 'Bills',
    icon: 'lightning',
    color: ['#C99419', '#F0C24F'],
    keywords: ['bill', 'bills', 'electricity', 'wifi', 'internet', 'broadband', 'gas', 'water', 'emi', 'insurance', 'subscription', 'netflix', 'spotify', 'prime', 'hotstar'],
  },
  {
    id: 'rent',
    label: 'Rent',
    icon: 'house',
    color: ['#7A5A3A', '#C8A27A'],
    keywords: ['rent', 'pg', 'hostel', 'maintenance', 'society', 'deposit'],
  },
  {
    id: 'health',
    label: 'Health',
    icon: 'heartbeat',
    color: ['#D23F57', '#FF7088'],
    keywords: ['doctor', 'medicine', 'medicines', 'pharmacy', 'hospital', 'gym', 'health', 'clinic', 'pharmeasy', 'apollo', 'dentist', 'test', 'lab'],
  },
  {
    id: 'fun',
    label: 'Fun',
    icon: 'film-slate',
    color: ['#7B4FD0', '#A78BFF'],
    keywords: ['movie', 'movies', 'cinema', 'pvr', 'inox', 'concert', 'party', 'drinks', 'beer', 'bar', 'game', 'games', 'bookmyshow', 'outing'],
  },
  {
    id: 'travel',
    label: 'Travel',
    icon: 'airplane-tilt',
    color: ['#1F8A9A', '#4FD0E0'],
    keywords: ['flight', 'hotel', 'trip', 'travel', 'airbnb', 'goa', 'holiday', 'vacation', 'irctc', 'makemytrip', 'booking'],
  },
  {
    id: 'coffee',
    label: 'Coffee',
    icon: 'coffee',
    color: ['#8A5A36', '#D29B6E'],
    keywords: ['coffee', 'chai', 'tea', 'starbucks', 'cafe', 'latte', 'cappuccino', 'ccd'],
  },
  {
    id: 'education',
    label: 'Learning',
    icon: 'graduation-cap',
    color: ['#2F6B4F', '#5FBF8F'],
    keywords: ['course', 'books', 'book', 'udemy', 'class', 'tuition', 'fees', 'exam', 'college', 'school', 'stationery'],
  },
  {
    id: 'gifts',
    label: 'Gifts',
    icon: 'gift',
    color: ['#C2412D', '#FF8066'],
    keywords: ['gift', 'gifts', 'birthday', 'present', 'wedding', 'donation', 'charity'],
  },
  {
    id: 'recharge',
    label: 'Recharge',
    icon: 'device-mobile',
    color: ['#4659C9', '#8E9DFF'],
    keywords: ['recharge', 'mobile', 'jio', 'airtel', 'vi', 'dth', 'phone'],
  },
  {
    id: 'other',
    label: 'Other',
    icon: 'dots-three-circle',
    color: ['#7C776D', '#B0AA9E'],
    keywords: [],
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function category(id: CategoryId): Category {
  return BY_ID.get(id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function isCategory(id: unknown): id is CategoryId {
  return typeof id === 'string' && BY_ID.has(id as CategoryId);
}

export function guessCategory(text: string): CategoryId | null {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  for (const c of CATEGORIES) {
    if (c.keywords.some((k) => words.includes(k))) return c.id;
  }
  return null;
}

export const METHODS: readonly { id: PayMethod; label: string; icon: IconName }[] = [
  { id: 'upi', label: 'UPI', icon: 'qr-code' },
  { id: 'cash', label: 'Cash', icon: 'money' },
  { id: 'card', label: 'Card', icon: 'credit-card' },
  { id: 'bank', label: 'Bank', icon: 'bank' },
];

export function isMethod(id: unknown): id is PayMethod {
  return id === 'upi' || id === 'cash' || id === 'card' || id === 'bank';
}
