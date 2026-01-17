import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { 
  Plus, 
  Wallet, 
  TrendingUp, 
  Settings, 
  PieChart as PieIcon, 
  Trash2, 
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Moon,
  Sun,
  User,
  Filter,
  Calendar,
  Repeat,
  Download,
  Pencil
} from 'lucide-react';
import { TEMPLATES, COLORS, CURRENCIES } from './constants';
import { AppState, Category, Transaction, RecurrenceFrequency } from './types';
import { Modal } from './components/Modal';
import { SpendingChart } from './components/SpendingChart';
import { getFinancialAdvice, suggestCategoryFromText } from './services/geminiService';

// Initial State Generator
const generateId = () => Math.random().toString(36).substr(2, 9);

const App: React.FC = () => {
  // --- State Management ---
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('zenBudgetState');
    const defaultState: AppState = {
      hasOnboarded: false,
      monthlyIncome: 0,
      currency: '$',
      theme: 'light',
      categories: [],
      transactions: []
    };
    return saved ? { ...defaultState, ...JSON.parse(saved) } : defaultState;
  });

  const [currentDate, setCurrentDate] = useState(new Date());
  
  // UI Views State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions'>('dashboard');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // Transaction Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFrequency>('monthly');
  const [isSuggestingCategory, setIsSuggestingCategory] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterRecurrence, setFilterRecurrence] = useState<'all' | 'recurring' | 'non-recurring'>('all');

  // AI State
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isLoadingAdvice, setIsLoadingAdvice] = useState(false);

  // New Category Form State
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(COLORS[0]);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('zenBudgetState', JSON.stringify(state));
  }, [state]);

  // --- Theme Effect ---
  useEffect(() => {
    if (state.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.theme]);

  // --- Derived State (Filtered by Month with Projection) ---
  const currentMonthTransactions = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();

    // 1. Get regular transactions for this month
    const regularTransactions = state.transactions.filter(t => {
      if (t.isRecurring) return false; // Handle recurring separately
      const tDate = new Date(t.date);
      return tDate.getMonth() === month && tDate.getFullYear() === year;
    });

    // 2. Project recurring transactions
    const projectedRecurring = state.transactions.filter(t => t.isRecurring).flatMap(t => {
       const tDate = new Date(t.date);
       const startYear = tDate.getFullYear();
       const startMonth = tDate.getMonth();
       
       // Only show if the transaction started on or before the current view month
       if (startYear > year || (startYear === year && startMonth > month)) {
         return [];
       }

       // For Monthly recurrence
       // (Simple implementation: assumes it recurs every month from start date)
       if (t.recurrence === 'monthly' || !t.recurrence) { // Default to monthly if undefined but isRecurring is true
          // Construct the projected date for this month
          // Clamp day to end of month (e.g., Jan 31 -> Feb 28)
          const targetDay = Math.min(tDate.getDate(), daysInCurrentMonth);
          const projectedDate = new Date(year, month, targetDay, tDate.getHours(), tDate.getMinutes());
          
          return [{
             ...t,
             date: projectedDate.toISOString(),
             // We keep the original ID so editing/deleting targets the master record
          }];
       }
       
       // Fallback for types not fully implemented (daily/weekly/yearly) - just show if in current month
       if (tDate.getMonth() === month && tDate.getFullYear() === year) {
         return [t];
       }
       return [];
    });

    const all = [...regularTransactions, ...projectedRecurring];
    return all.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.transactions, currentDate]);

  const filteredTransactions = useMemo(() => {
    return currentMonthTransactions.filter(t => {
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterCategory !== 'all' && t.categoryId !== filterCategory) return false;
      if (filterRecurrence === 'recurring' && !t.isRecurring) return false;
      if (filterRecurrence === 'non-recurring' && t.isRecurring) return false;
      return true;
    });
  }, [currentMonthTransactions, filterType, filterCategory, filterRecurrence]);

  const totalIncome = useMemo(() => {
    const transactionIncome = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    return state.monthlyIncome + transactionIncome;
  }, [currentMonthTransactions, state.monthlyIncome]);

  const totalExpenses = useMemo(() => {
    return currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [currentMonthTransactions]);

  const remainingBudget = totalIncome - totalExpenses;
  const spendPercentage = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  // --- AI Advice Effect ---
  useEffect(() => {
    if (state.hasOnboarded && !isLoadingAdvice) {
      setIsLoadingAdvice(true);
      // We rely on the current view's transactions for context-aware advice
      getFinancialAdvice(state.monthlyIncome, currentMonthTransactions, state.categories, state.currency)
        .then(advice => {
          setAiAdvice(advice);
          setIsLoadingAdvice(false);
        });
    }
  }, [state.hasOnboarded, currentDate.getMonth()]); // Refresh advice when month changes

  // --- Handlers ---

  const handleConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: COLORS
    });
  };

  const toggleTheme = () => {
    setState(prev => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }));
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    const newCategories = template.defaultCategories.map(c => ({
      ...c,
      id: generateId()
    }));

    setState(prev => ({
      ...prev,
      categories: newCategories,
    }));
  };

  const completeOnboarding = (income: number, currency: string) => {
    setState(prev => ({
      ...prev,
      monthlyIncome: income,
      currency,
      hasOnboarded: true
    }));
    handleConfetti();
  };

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    if (editingId) {
      // Update Existing
      setState(prev => ({
        ...prev,
        transactions: prev.transactions.map(t => {
          if (t.id === editingId) {
            return {
              ...t,
              amount: parseFloat(amount),
              description,
              categoryId: txType === 'income' ? 'income' : selectedCategory,
              type: txType,
              isRecurring,
              recurrence: isRecurring ? recurrenceFreq : 'none',
              // Note: We preserve the original date. 
              // If user wanted to change date, we'd need a date picker (not in MVP spec)
            };
          }
          return t;
        })
      }));
      setEditingId(null);
    } else {
      // Create New
      // Use currently selected month's date (middle of month) or today if same month
      let txDate = new Date(currentDate);
      const today = new Date();
      if (txDate.getMonth() === today.getMonth() && txDate.getFullYear() === today.getFullYear()) {
        txDate = today;
      } else {
        txDate.setDate(15); 
      }

      const newTx: Transaction = {
        id: generateId(),
        amount: parseFloat(amount),
        description,
        categoryId: txType === 'income' ? 'income' : selectedCategory,
        type: txType,
        date: txDate.toISOString(),
        isRecurring,
        recurrence: isRecurring ? recurrenceFreq : 'none'
      };

      setState(prev => ({
        ...prev,
        transactions: [newTx, ...prev.transactions]
      }));
      handleConfetti(); 
    }

    setIsAddModalOpen(false);
    resetForm();
    
    // Refresh advice
    setTimeout(() => {
       getFinancialAdvice(state.monthlyIncome, [...currentMonthTransactions], state.categories, state.currency)
        .then(setAiAdvice);
    }, 1000);
  };

  const handleEditClick = (t: Transaction) => {
    // We must find the master transaction from state, because 't' might be a projected one
    // with a modified date. We want to edit the Source of Truth.
    const master = state.transactions.find(tr => tr.id === t.id) || t;
    
    setEditingId(master.id);
    setAmount(master.amount.toString());
    setDescription(master.description);
    setSelectedCategory(master.categoryId);
    setTxType(master.type);
    setIsRecurring(!!master.isRecurring);
    setRecurrenceFreq(master.recurrence || 'monthly');
    
    setIsAddModalOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setAmount('');
    setDescription('');
    setSelectedCategory(state.categories[0]?.id || '');
    setTxType('expense');
    setIsRecurring(false);
    setRecurrenceFreq('monthly');
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return;
    const newCat: Category = {
      id: generateId(),
      name: newCatName,
      color: newCatColor,
      icon: 'Tag' 
    };
    setState(prev => ({ ...prev, categories: [...prev.categories, newCat] }));
    setIsCategoryModalOpen(false);
    setNewCatName('');
  };

  const handleDeleteTransaction = (id: string) => {
    if (confirm("Are you sure? If this is a recurring transaction, it will be removed from all months.")) {
      setState(prev => ({
        ...prev,
        transactions: prev.transactions.filter(t => t.id !== id)
      }));
    }
  };

  const handleDescriptionBlur = async () => {
    if (description && !selectedCategory && txType === 'expense') {
      setIsSuggestingCategory(true);
      const suggestedName = await suggestCategoryFromText(description, state.categories);
      if (suggestedName) {
        const cat = state.categories.find(c => c.name === suggestedName);
        if (cat) setSelectedCategory(cat.id);
      }
      setIsSuggestingCategory(false);
    }
  };

  const generateEmailReport = () => {
    const monthStr = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    const body = `
      Budget Report for ${monthStr}
      
      Income: ${state.currency}${totalIncome}
      Expenses: ${state.currency}${totalExpenses}
      Net: ${state.currency}${remainingBudget}
      
      Top Categories:
      ${state.categories.map(c => {
        const amt = currentMonthTransactions
            .filter(t => t.categoryId === c.id)
            .reduce((sum, t) => sum + t.amount, 0);
        return amt > 0 ? `- ${c.name}: ${state.currency}${amt}` : null;
      }).filter(Boolean).join('\n')}
    `;
    window.location.href = `mailto:?subject=Budget Report - ${monthStr}&body=${encodeURIComponent(body)}`;
  };

  // --- Render Views ---

  if (!state.hasOnboarded) {
    return (
      <OnboardingView 
        onSelectTemplate={handleTemplateSelect} 
        currentCategories={state.categories}
        onComplete={completeOnboarding}
      />
    );
  }

  return (
    <div className={`min-h-screen pb-24 md:pb-12 transition-colors duration-300 ${state.theme === 'dark' ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-gray-200 dark:border-slate-700 sticky top-0 z-30 transition-colors">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4 md:mb-0">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                  <Wallet size={20} />
                </div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">ZenBudget</h1>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                      resetForm();
                      setIsAddModalOpen(true);
                  }}
                  className="hidden md:flex bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center gap-2 mr-2"
                >
                  <Plus size={18} />
                  <span>Add Transaction</span>
                </button>

                <button 
                  onClick={handleConfetti}
                  className="p-2 rounded-full text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                  title="Celebrate!"
                >
                  <Sparkles size={20} />
                </button>
                <button 
                  onClick={toggleTheme}
                  className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  {state.theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
                <button 
                  onClick={() => setIsUserModalOpen(true)}
                  className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <User size={20} />
                </button>
              </div>
          </div>
          
          {/* Month Navigation */}
          <div className="flex items-center justify-between md:justify-center gap-4 mt-2">
            <button onClick={() => changeMonth(-1)} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <ArrowLeft size={20}/>
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[140px] text-center">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
             <button onClick={() => changeMonth(1)} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <ArrowRight size={20}/>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        
        {/* Financial Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <OverviewCard 
            title="Monthly Income" 
            amount={state.monthlyIncome} 
            currency={state.currency} 
            extra={totalIncome - state.monthlyIncome}
            color="blue"
          />
          
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col transition-colors">
            <span className="text-sm text-gray-500 dark:text-slate-400 font-medium mb-1">Total Spent</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{state.currency}{totalExpenses.toLocaleString()}</span>
            <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 mt-3 overflow-hidden">
                <div 
                    className={`h-2 rounded-full transition-all duration-500 ${spendPercentage > 100 ? 'bg-red-500' : 'bg-blue-500'}`} 
                    style={{ width: `${Math.min(spendPercentage, 100)}%` }}
                ></div>
            </div>
            <span className="text-xs text-gray-400 mt-2 text-right">{spendPercentage.toFixed(0)}% used</span>
          </div>

          <OverviewCard 
             title="Remaining" 
             amount={remainingBudget} 
             currency={state.currency}
             color={remainingBudget < 0 ? 'red' : 'emerald'}
             subtext={remainingBudget < 0 ? 'Over budget' : 'Safe to spend'}
          />
        </div>

        {/* AI Insight Banner */}
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-slate-800 dark:to-slate-800 p-6 rounded-2xl border border-indigo-100 dark:border-slate-700 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-10 dark:opacity-5">
            <Sparkles size={100} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2 text-indigo-700 dark:text-indigo-400 font-semibold text-sm">
                <Sparkles size={16} />
                <span>Smart Insight</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              {isLoadingAdvice ? "Asking the financial guru..." : (aiAdvice || "Start adding transactions to get AI-powered insights.")}
            </p>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex space-x-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                    <button 
                        onClick={() => setActiveTab('dashboard')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
                    >
                        Overview
                    </button>
                    <button 
                        onClick={() => setActiveTab('transactions')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'transactions' ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
                    >
                        Transactions
                    </button>
                </div>
                
                {activeTab === 'transactions' && (
                    <div className="flex items-center gap-2 flex-wrap">
                         <div className="flex items-center bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2">
                            <Filter size={14} className="text-gray-400 mr-1" />
                            <select 
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value as any)}
                                className="bg-transparent text-gray-700 dark:text-slate-300 text-sm py-2 outline-none cursor-pointer"
                            >
                                <option value="all">All Types</option>
                                <option value="expense">Expenses</option>
                                <option value="income">Income</option>
                            </select>
                         </div>

                         <select 
                            value={filterRecurrence}
                            onChange={(e) => setFilterRecurrence(e.target.value as any)}
                            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm rounded-lg px-3 py-2 outline-none cursor-pointer"
                        >
                            <option value="all">All Frequencies</option>
                            <option value="recurring">Recurring Only</option>
                            <option value="non-recurring">One-time Only</option>
                        </select>

                         <select 
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-sm rounded-lg px-3 py-2 outline-none max-w-[150px] cursor-pointer"
                        >
                            <option value="all">All Categories</option>
                            {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {activeTab === 'dashboard' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <PieIcon size={18} className="text-gray-400 dark:text-slate-500"/>
                                Spending Breakdown
                            </h3>
                            <button 
                                onClick={() => setIsCategoryModalOpen(true)}
                                className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
                            >
                                Manage Categories
                            </button>
                        </div>
                        <SpendingChart transactions={currentMonthTransactions} categories={state.categories} />
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                         <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Top Categories</h3>
                         <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {state.categories.map(cat => {
                                const spent = currentMonthTransactions
                                    .filter(t => t.categoryId === cat.id && t.type === 'expense')
                                    .reduce((sum, t) => sum + t.amount, 0);
                                if (spent === 0) return null;
                                const percent = totalExpenses > 0 ? (spent / totalExpenses) * 100 : 0;
                                
                                return (
                                    <div key={cat.id}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-700 dark:text-slate-300 font-medium">{cat.name}</span>
                                            <span className="text-gray-900 dark:text-white font-bold">{state.currency}{spent.toLocaleString()}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
                                            <div 
                                                className="h-2 rounded-full" 
                                                style={{ width: `${percent}%`, backgroundColor: cat.color }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                            {totalExpenses === 0 && <p className="text-gray-400 text-sm italic">No data for this month.</p>}
                         </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-slate-900/50 text-gray-500 dark:text-slate-400 text-xs uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Description</th>
                                    <th className="px-6 py-4">Category</th>
                                    <th className="px-6 py-4 text-right">Amount</th>
                                    <th className="px-6 py-4 w-20 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700 text-sm">
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400 dark:text-slate-500">
                                            No transactions found matching your filters.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map(t => {
                                        const category = state.categories.find(c => c.id === t.categoryId);
                                        return (
                                            <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                                <td className="px-6 py-4 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                                                    {new Date(t.date).toLocaleDateString()}
                                                    {t.isRecurring && (
                                                      <span className="ml-2 inline-flex items-center text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded text-[10px] font-medium" title="Recurring">
                                                        <Repeat size={10} className="mr-1" /> Recurring
                                                      </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                                    {t.description}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {t.type === 'income' ? (
                                                        <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-md text-xs font-semibold">Income</span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 text-xs font-medium">
                                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: category?.color || '#9ca3af' }}></span>
                                                            {category?.name || 'Uncategorized'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={`px-6 py-4 text-right font-bold ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                                                    {t.type === 'income' ? '+' : '-'}{state.currency}{t.amount.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                    <button 
                                                        onClick={() => handleEditClick(t)}
                                                        className="text-gray-400 hover:text-blue-500 transition-colors mr-2"
                                                        title="Edit"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteTransaction(t.id)}
                                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
      </main>

      {/* Floating Action Button (Mobile) */}
      <button 
        onClick={() => {
            resetForm();
            setIsAddModalOpen(true);
        }}
        className="md:hidden fixed bottom-6 right-6 bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center z-40 hover:scale-105 transition-transform"
      >
        <Plus size={24} />
      </button>

      {/* Transaction Modal (Add/Edit) */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={editingId ? "Edit Transaction" : "Add Transaction"}>
        <form onSubmit={handleSaveTransaction} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-2 bg-gray-100 dark:bg-slate-700 p-1 rounded-lg">
                <button
                    type="button"
                    onClick={() => setTxType('expense')}
                    className={`py-2 text-sm font-medium rounded-md transition-all ${txType === 'expense' ? 'bg-white dark:bg-slate-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}
                >
                    Expense
                </button>
                <button
                    type="button"
                    onClick={() => setTxType('income')}
                    className={`py-2 text-sm font-medium rounded-md transition-all ${txType === 'income' ? 'bg-white dark:bg-slate-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}
                >
                    Income
                </button>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Amount</label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{state.currency}</span>
                    <input 
                        type="number" 
                        step="0.01" 
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                        placeholder="0.00"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Description</label>
                <input 
                    type="text" 
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    placeholder={txType === 'expense' ? "e.g., Grocery shopping" : "e.g., Freelance payment"}
                />
            </div>

            {txType === 'expense' && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1 flex justify-between">
                        Category
                        {isSuggestingCategory && <span className="text-xs text-blue-500 animate-pulse">AI suggestions...</span>}
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                        {state.categories.map(cat => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-all ${selectedCategory === cat.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 text-gray-700 dark:text-slate-300'}`}
                            >
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></span>
                                <span className="truncate">{cat.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2 pt-2">
                <input 
                    type="checkbox" 
                    id="recurring" 
                    checked={isRecurring} 
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="recurring" className="text-sm text-gray-700 dark:text-slate-300">Monthly Recurring Transaction</label>
            </div>
            
            {editingId && isRecurring && (
                 <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                    Editing this will update all future occurrences of this recurring transaction.
                 </p>
            )}

            <button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors mt-4"
            >
                {editingId ? 'Save Changes' : `Add ${txType === 'expense' ? 'Expense' : 'Income'}`}
            </button>
        </form>
      </Modal>

      {/* Category Manager Modal */}
      <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title="Manage Categories">
            <div className="space-y-6">
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {state.categories.map(cat => (
                         <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg group">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }}></div>
                                <span className="text-sm font-medium text-gray-700 dark:text-slate-200">{cat.name}</span>
                            </div>
                            <button 
                                onClick={() => {
                                    setState(prev => ({
                                        ...prev,
                                        categories: prev.categories.filter(c => c.id !== cat.id)
                                    }));
                                }}
                                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <Trash2 size={16} />
                            </button>
                         </div>
                    ))}
                </div>

                <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add New Category</h4>
                    <form onSubmit={handleAddCategory} className="space-y-3">
                        <div>
                            <input 
                                type="text"
                                placeholder="Category Name"
                                value={newCatName}
                                onChange={(e) => setNewCatName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                {COLORS.map(color => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => setNewCatColor(color)}
                                        className={`w-6 h-6 rounded-full shrink-0 transition-transform ${newCatColor === color ? 'scale-110 ring-2 ring-offset-2 ring-gray-400' : ''}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>
                        <button 
                            type="submit" 
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            Create Category
                        </button>
                    </form>
                </div>
            </div>
      </Modal>

      {/* User Profile Modal */}
      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title="User Settings & Reports">
            <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Currency</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {CURRENCIES.map(c => (
                      <button
                        key={c.code}
                        onClick={() => setState(prev => ({ ...prev, currency: c.symbol }))}
                        className={`p-2 rounded-lg text-sm border font-medium transition-all ${state.currency === c.symbol ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-slate-600 hover:border-blue-300 text-gray-700 dark:text-slate-300'}`}
                      >
                        {c.symbol} <span className="text-xs opacity-75">{c.code}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                   <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Monthly Income Goal</h4>
                   <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{state.currency}</span>
                      <input 
                          type="number"
                          value={state.monthlyIncome}
                          onChange={(e) => setState(prev => ({ ...prev, monthlyIncome: parseFloat(e.target.value) || 0 }))}
                          className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      />
                   </div>
                </div>

                <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Actions</h4>
                  <button 
                    onClick={generateEmailReport}
                    className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-slate-700 hover:bg-gray-800 dark:hover:bg-slate-600 text-white py-3 rounded-xl transition-colors"
                  >
                    <Download size={18} />
                    Email Report for {currentDate.toLocaleString('default', { month: 'short' })}
                  </button>
                </div>
            </div>
      </Modal>

    </div>
  );
};

// --- Sub-Components ---

const OverviewCard: React.FC<{ title: string, amount: number, currency: string, extra?: number, color: string, subtext?: string }> = ({ title, amount, currency, extra, color, subtext }) => {
  const colorClasses = {
    blue: 'text-gray-900 dark:text-white',
    red: 'text-red-600 dark:text-red-400',
    emerald: 'text-emerald-600 dark:text-emerald-400'
  };

  return (
     <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col transition-colors">
        <span className="text-sm text-gray-500 dark:text-slate-400 font-medium mb-1">{title}</span>
        <span className={`text-2xl font-bold ${colorClasses[color as keyof typeof colorClasses] || 'text-gray-900'}`}>
          {currency}{amount.toLocaleString()}
        </span>
        {extra && extra > 0 ? (
           <span className="text-xs text-green-600 dark:text-green-400 flex items-center mt-2">
             <TrendingUp size={12} className="mr-1"/> +{currency}{extra.toLocaleString()} extra
           </span>
        ) : null}
        {subtext && <span className="text-xs text-gray-400 mt-2">{subtext}</span>}
      </div>
  );
}

const OnboardingView: React.FC<{ 
    onSelectTemplate: (id: string) => void, 
    currentCategories: Category[],
    onComplete: (income: number, currency: string) => void
}> = ({ onSelectTemplate, currentCategories, onComplete }) => {
    const [step, setStep] = useState(1);
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [income, setIncome] = useState('');
    const [currency, setCurrency] = useState('$');

    const handleNext = () => {
        if (step === 1 && selectedTemplate) {
            setStep(2);
        } else if (step === 2 && income) {
            onComplete(parseFloat(income), currency);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 text-gray-900 dark:text-white transition-colors">
            <div className="w-full max-w-2xl">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold mb-3">Welcome to ZenBudget</h1>
                    <p className="text-gray-500 dark:text-gray-400">Let's set up your financial peace of mind.</p>
                </div>

                {step === 1 ? (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-lg font-semibold">Choose a template to start</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {TEMPLATES.map(t => {
                                const Icon = t.icon;
                                const isSelected = selectedTemplate === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => {
                                            setSelectedTemplate(t.id);
                                            onSelectTemplate(t.id);
                                        }}
                                        className={`p-6 rounded-2xl border-2 text-left transition-all ${isSelected ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-600 dark:border-blue-500' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-slate-500'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${isSelected ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'}`}>
                                            <Icon size={20} />
                                        </div>
                                        <h3 className="font-bold">{t.name}</h3>
                                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{t.description}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 animate-in slide-in-from-right-4 duration-500">
                         <div className="mb-6">
                            <h2 className="text-lg font-semibold mb-2">Select Currency</h2>
                            <div className="flex gap-2 flex-wrap">
                                {CURRENCIES.map(c => (
                                    <button
                                        key={c.code}
                                        onClick={() => setCurrency(c.symbol)}
                                        className={`px-3 py-1 rounded-full text-sm border ${currency === c.symbol ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400'}`}
                                    >
                                        {c.code} ({c.symbol})
                                    </button>
                                ))}
                            </div>
                        </div>

                        <h2 className="text-xl font-semibold mb-6">What is your expected monthly income?</h2>
                        <div className="relative mb-8">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl font-medium">{currency}</span>
                            <input 
                                type="number" 
                                value={income}
                                onChange={(e) => setIncome(e.target.value)}
                                className="w-full pl-10 pr-4 py-4 text-2xl font-bold border-b-2 border-gray-200 dark:border-slate-600 bg-transparent focus:border-blue-600 outline-none transition-colors"
                                placeholder="0"
                                autoFocus
                            />
                        </div>
                    </div>
                )}

                <div className="mt-8 flex justify-end">
                    <button
                        onClick={handleNext}
                        disabled={step === 1 ? !selectedTemplate : !income}
                        className="bg-gray-900 dark:bg-blue-600 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {step === 1 ? 'Next Step' : 'Launch Dashboard'}
                        <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default App;
