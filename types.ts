export type TransactionType = 'expense' | 'income';
export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  budgetLimit?: number;
}

export interface Transaction {
  id: string;
  amount: number;
  categoryId: string;
  description: string;
  date: string;
  type: TransactionType;
  isRecurring?: boolean;
  recurrence?: RecurrenceFrequency;
}

export interface BudgetTemplate {
  id: string;
  name: string;
  description: string;
  icon: any;
  defaultCategories: Omit<Category, 'id'>[];
}

export interface AppState {
  hasOnboarded: boolean;
  monthlyIncome: number;
  currency: string;
  theme: 'light' | 'dark';
  categories: Category[];
  transactions: Transaction[];
  userEmail?: string;
  userName?: string;
}

export interface CurrencyOption {
  symbol: string;
  code: string;
  name: string;
}
