import { BudgetTemplate, CurrencyOption } from './types';
import { GraduationCap, Briefcase, Home, Sunset, Zap, ShoppingCart, Coffee, Car, Film, HeartPulse } from 'lucide-react';

export const COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
];

export const CURRENCIES: CurrencyOption[] = [
  { symbol: '$', code: 'USD', name: 'US Dollar' },
  { symbol: '€', code: 'EUR', name: 'Euro' },
  { symbol: '£', code: 'GBP', name: 'British Pound' },
  { symbol: '₹', code: 'INR', name: 'Indian Rupee' },
  { symbol: '¥', code: 'JPY', name: 'Japanese Yen' },
  { symbol: 'C$', code: 'CAD', name: 'Canadian Dollar' },
  { symbol: 'A$', code: 'AUD', name: 'Australian Dollar' },
];

export const TEMPLATES: BudgetTemplate[] = [
  {
    id: 'student',
    name: 'Student',
    description: 'Focused on essentials, books, and social life.',
    icon: GraduationCap,
    defaultCategories: [
      { name: 'Rent/Dorm', color: '#3b82f6', icon: 'Home' },
      { name: 'Food & Dining', color: '#10b981', icon: 'Coffee' },
      { name: 'Transportation', color: '#f59e0b', icon: 'Car' },
      { name: 'Entertainment', color: '#8b5cf6', icon: 'Film' },
      { name: 'Books & Supplies', color: '#ef4444', icon: 'Briefcase' },
    ]
  },
  {
    id: 'young-pro',
    name: 'Young Professional',
    description: 'Balancing career growth, loans, and lifestyle.',
    icon: Briefcase,
    defaultCategories: [
      { name: 'Rent', color: '#3b82f6', icon: 'Home' },
      { name: 'Groceries', color: '#10b981', icon: 'ShoppingCart' },
      { name: 'Utilities', color: '#f59e0b', icon: 'Zap' },
      { name: 'Dining Out', color: '#ec4899', icon: 'Coffee' },
      { name: 'Student Loans', color: '#ef4444', icon: 'Briefcase' },
      { name: 'Travel', color: '#06b6d4', icon: 'Car' },
    ]
  },
  {
    id: 'family',
    name: 'Family',
    description: 'Comprehensive tracking for household needs.',
    icon: Home,
    defaultCategories: [
      { name: 'Mortgage/Rent', color: '#3b82f6', icon: 'Home' },
      { name: 'Groceries', color: '#10b981', icon: 'ShoppingCart' },
      { name: 'Utilities', color: '#f59e0b', icon: 'Zap' },
      { name: 'Childcare', color: '#ec4899', icon: 'HeartPulse' },
      { name: 'Healthcare', color: '#ef4444', icon: 'HeartPulse' },
      { name: 'Insurance', color: '#8b5cf6', icon: 'Briefcase' },
    ]
  },
  {
    id: 'retiree',
    name: 'Retiree',
    description: 'Simple tracking for enjoyment and health.',
    icon: Sunset,
    defaultCategories: [
      { name: 'Housing', color: '#3b82f6', icon: 'Home' },
      { name: 'Healthcare', color: '#ef4444', icon: 'HeartPulse' },
      { name: 'Groceries', color: '#10b981', icon: 'ShoppingCart' },
      { name: 'Travel/Leisure', color: '#f59e0b', icon: 'Car' },
      { name: 'Gifts', color: '#ec4899', icon: 'HeartPulse' },
    ]
  }
];
