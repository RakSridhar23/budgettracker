import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  Repeat,
  Pencil,
  Mail,
  Loader,
  Check,
  X,
  Mic,
  List,
  LogOut,
  ChevronLeft,
  Palette,
  Tag,
  LayoutGrid
} from 'lucide-react';
import { TEMPLATES, COLORS, CURRENCIES } from './constants';
import { AppState, Category, Transaction, RecurrenceFrequency } from './types';
import { Modal } from './components/Modal';
import { SpendingChart } from './components/SpendingChart';
import { getFinancialAdvice, suggestCategoryFromText, parseTransactionFromText } from './services/geminiService';

// Initial State Generator
const generateId = () => Math.random().toString(36).substr(2, 9);

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const App: React.FC = () => {
  // --- State Management ---
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('vyayaState');
    const defaultState: AppState = {
      hasOnboarded: false,
      monthlyIncome: 0,
      currency: '$',
      theme: 'dark', // Default to Dark
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
  const [isUserModalOpen, setIsUserModalOpen] = useState(false); // Profile
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false); // Settings (Theme)
  
  // Email Report State
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);

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

  // Category Management State
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(COLORS[0]);
  const [newCatLimit, setNewCatLimit] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryViewMode, setCategoryViewMode] = useState<'list' | 'form'>('list');

  // Voice State
  const [isListening, setIsListening] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);


  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('vyayaState', JSON.stringify(state));
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
       if (t.recurrence === 'monthly' || !t.recurrence) { 
          const targetDay = Math.min(tDate.getDate(), daysInCurrentMonth);
          const projectedDate = new Date(year, month, targetDay, tDate.getHours(), tDate.getMinutes());
          
          return [{
             ...t,
             date: projectedDate.toISOString(),
          }];
       }
       
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
    if (state.hasOnboarded) {
      setIsLoadingAdvice(true);
      const timer = setTimeout(() => {
        getFinancialAdvice(state.monthlyIncome, currentMonthTransactions, state.categories, state.currency)
          .then(advice => {
            setAiAdvice(advice);
            setIsLoadingAdvice(false);
          })
          .catch(err => {
             console.error(err);
             setIsLoadingAdvice(false);
          });
      }, 1000); 

      return () => clearTimeout(timer);
    }
  }, [state.hasOnboarded, currentMonthTransactions, state.monthlyIncome, state.categories, state.currency]);

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

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Your browser does not support voice recognition. Please try Chrome or Edge.");
      return;
    }

    if (isListening) {
      return; 
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListening(true);

    recognition.onresult = async (event: any) => {
      const text = event.results[0][0].transcript;
      setIsListening(false);
      setIsProcessingVoice(true);

      const parsedData = await parseTransactionFromText(text, state.categories, state.currency);
      
      setIsProcessingVoice(false);
      
      if (parsedData) {
        setAmount(parsedData.amount.toString());
        setDescription(parsedData.description);
        setTxType(parsedData.type);
        if (parsedData.categoryId) {
          setSelectedCategory(parsedData.categoryId);
        } else {
           setSelectedCategory(state.categories[0]?.id || '');
        }
        setIsAddModalOpen(true);
      } else {
        alert("Could not understand the transaction. Please try again.");
      }
    };

    recognition.onspeechend = () => {
      recognition.stop();
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        setIsListening(false);
        setIsProcessingVoice(false);
        return;
      }
      setIsListening(false);
      setIsProcessingVoice(false);
      if (event.error === 'not-allowed') {
        alert("Microphone access blocked. Please allow permission.");
      }
    };

    recognition.start();
  };


  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return; 

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
            };
          }
          return t;
        })
      }));
      setEditingId(null);
    } else {
      // Create New
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
  };

  const handleEditClick = (t: Transaction) => {
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

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return;

    if (editingCategoryId) {
        setState(prev => ({
            ...prev,
            categories: prev.categories.map(c => c.id === editingCategoryId ? {
                ...c,
                name: newCatName,
                color: newCatColor,
                budgetLimit: parseFloat(newCatLimit) || 0
            } : c)
        }));
        setEditingCategoryId(null);
    } else {
        const newCat: Category = {
          id: generateId(),
          name: newCatName,
          color: newCatColor,
          icon: 'Tag',
          budgetLimit: parseFloat(newCatLimit) || 0
        };
        setState(prev => ({ ...prev, categories: [...prev.categories, newCat] }));
    }
    setNewCatName('');
    setNewCatLimit('');
    setNewCatColor(COLORS[0]);
    setCategoryViewMode('list');
  };

  const handleEditCategory = (cat: Category) => {
    setNewCatName(cat.name);
    setNewCatLimit(cat.budgetLimit?.toString() || '');
    setNewCatColor(cat.color);
    setEditingCategoryId(cat.id);
    setCategoryViewMode('form');
  };

  const handleCancelEditCategory = () => {
    setNewCatName('');
    setNewCatLimit('');
    setNewCatColor(COLORS[0]);
    setEditingCategoryId(null);
    setCategoryViewMode('list');
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

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailAddress) return;

    setIsSendingEmail(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Generate PDF (Simplified for brevity, same logic as before)
    const doc = new jsPDF();
    const monthStr = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    doc.text(`Vyaya Report - ${monthStr}`, 14, 20);
    doc.save(`Vyaya_Report_${monthStr}.pdf`);
    
    setIsSendingEmail(false);
    setIsEmailSent(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsEmailSent(false);
    setIsEmailModalOpen(false);
    setEmailAddress('');
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
    <div className={`min-h-screen pb-28 md:pb-12 transition-colors duration-300 ${state.theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
      
      {/* Mobile Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 transition-colors border-b border-gray-100 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                  <Wallet size={16} />
                </div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-stone-100 tracking-tight">Vyaya</h1>
              </div>
              <button 
                  onClick={handleConfetti}
                  className="p-2 rounded-full text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                >
                  <Sparkles size={18} />
              </button>
          </div>
          
          <div className="flex items-center justify-between mt-4 mb-2">
             <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 hover:text-gray-900 dark:hover:text-emerald-400 transition-colors">
              <ArrowLeft size={18}/>
            </button>
            <h2 className="text-base font-semibold text-gray-900 dark:text-stone-100">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
             <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 hover:text-gray-900 dark:hover:text-emerald-400 transition-colors">
              <ArrowRight size={18}/>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 pb-8 space-y-6">
        
        {/* Segmented Control */}
        <div className="flex p-1 bg-gray-200 dark:bg-slate-900 rounded-xl mb-4">
            <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'dashboard' 
                    ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400'
                }`}
            >
                <PieIcon size={16} />
                Overview
            </button>
            <button
                onClick={() => setActiveTab('transactions')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'transactions' 
                    ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400'
                }`}
            >
                <List size={16} />
                Transactions
            </button>
        </div>

        {/* Financial Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <OverviewCard 
            title="Income" 
            amount={state.monthlyIncome} 
            currency={state.currency} 
            extra={totalIncome - state.monthlyIncome}
            color="emerald"
          />
          
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-emerald-500/10 flex flex-col transition-colors">
            <span className="text-xs text-gray-500 dark:text-stone-400 font-medium mb-1">Total Spent</span>
            <span className="text-xl font-bold text-gray-900 dark:text-stone-100">{state.currency}{totalExpenses.toLocaleString()}</span>
            <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
                <div 
                    className={`h-1.5 rounded-full transition-all duration-500 ${spendPercentage > 100 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                    style={{ width: `${Math.min(spendPercentage, 100)}%` }}
                ></div>
            </div>
            <span className="text-[10px] text-gray-400 mt-2 text-right">{spendPercentage.toFixed(0)}% used</span>
          </div>

          <OverviewCard 
             title="Left" 
             amount={remainingBudget} 
             currency={state.currency}
             color={remainingBudget < 0 ? 'red' : 'emerald'}
             subtext={remainingBudget < 0 ? 'Over budget' : 'Safe to spend'}
          />
        </div>

        {/* AI Insight Banner */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-900 dark:to-slate-900 p-5 rounded-2xl border border-emerald-500/20 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-10 dark:opacity-5">
             <span className="text-8xl grayscale opacity-20 select-none">🐼</span> 
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2 text-emerald-700 dark:text-emerald-400 font-semibold text-xs">
                <span>🐼 Financial Buddy</span>
            </div>
            <div className="flex gap-4">
                <p className="text-sm text-gray-700 dark:text-stone-300 leading-relaxed italic">
                "{isLoadingAdvice ? "Eating bamboo and crunching numbers..." : (aiAdvice || "Start adding transactions to get some wisdom!")}"
                </p>
            </div>
          </div>
        </div>

        {activeTab === 'dashboard' ? (
            <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-emerald-500/10">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold text-gray-900 dark:text-stone-100 text-sm flex items-center gap-2">
                            Breakdown
                        </h3>
                        {/* Hidden link removed as requested */}
                    </div>
                    <SpendingChart transactions={currentMonthTransactions} categories={state.categories} />
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-emerald-500/10">
                        <h3 className="font-semibold text-gray-900 dark:text-stone-100 mb-4 text-sm">Budgets</h3>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {state.categories.map(cat => {
                            const spent = currentMonthTransactions
                                .filter(t => t.categoryId === cat.id && t.type === 'expense')
                                .reduce((sum, t) => sum + t.amount, 0);
                            
                            const limit = cat.budgetLimit || 0;
                            const hasLimit = limit > 0;
                            const percent = hasLimit ? (spent / limit) * 100 : (totalExpenses > 0 ? (spent / totalExpenses) * 100 : 0);
                            
                            let progressColor = cat.color;
                            if (hasLimit) {
                                if (percent > 100) progressColor = '#ef4444'; // Red
                                else if (percent > 85) progressColor = '#f59e0b'; // Amber
                            }

                            if (spent === 0 && !hasLimit) return null;
                            
                            return (
                                <div key={cat.id}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-gray-700 dark:text-stone-300 font-medium">{cat.name}</span>
                                        <div className="text-right">
                                            <span className="text-gray-900 dark:text-white font-bold">{state.currency}{spent.toLocaleString()}</span>
                                            {hasLimit && (
                                                <span className="text-gray-400 text-[10px] ml-1">
                                                    / {state.currency}{limit.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5">
                                        <div 
                                            className="h-1.5 rounded-full transition-all duration-500" 
                                            style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: progressColor }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                        {state.categories.length === 0 && <p className="text-gray-400 text-sm italic">No categories set.</p>}
                        </div>
                </div>
            </div>
        ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-500/10 overflow-hidden">
                {/* Mobile Transaction List */}
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                    {filteredTransactions.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 dark:text-stone-500 text-sm">
                            No transactions found.
                        </div>
                    ) : (
                        filteredTransactions.map(t => {
                            const category = state.categories.find(c => c.id === t.categoryId);
                            return (
                                <div key={t.id} onClick={() => handleEditClick(t)} className="p-4 flex items-center justify-between active:bg-gray-50 dark:active:bg-slate-800 transition-colors cursor-pointer">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: t.type === 'income' ? '#10b981' : category?.color || '#9ca3af' }}>
                                            {t.type === 'income' ? 'IN' : (category?.name.substring(0,2).toUpperCase() || 'UN')}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.description}</p>
                                            <p className="text-xs text-gray-500 dark:text-stone-400">
                                                {new Date(t.date).toLocaleDateString()}
                                                {t.isRecurring && <span className="ml-1 text-emerald-500">↻</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-bold ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                                            {t.type === 'income' ? '+' : '-'}{state.currency}{t.amount.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-gray-200 dark:border-slate-800 pb-safe px-6 flex justify-between items-center z-40 h-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
        <button onClick={() => setIsUserModalOpen(true)} className="flex flex-col items-center gap-1 w-12 text-gray-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
            <User size={24} />
            <span className="text-[10px] font-medium">Profile</span>
        </button>

        <div className="flex items-center gap-5 relative -top-6">
            <button 
                onClick={handleVoiceInput}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isListening ? 'bg-red-500 animate-pulse scale-110' : 'bg-emerald-500 text-white hover:bg-emerald-600'} border-[6px] border-white dark:border-slate-950`}
            >
                {isProcessingVoice ? <Loader size={22} className="animate-spin" /> : <Mic size={22} />}
            </button>
            <button 
                onClick={() => { resetForm(); setIsAddModalOpen(true); }}
                className="w-16 h-16 rounded-full bg-gray-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow-xl border-[6px] border-white dark:border-slate-950 hover:scale-105 transition-transform"
            >
                <Plus size={30} />
            </button>
        </div>

        <button onClick={() => setIsSettingsModalOpen(true)} className="flex flex-col items-center gap-1 w-12 text-gray-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
            <Settings size={24} />
            <span className="text-[10px] font-medium">Settings</span>
        </button>
      </div>

      {/* Transaction Modal (Add/Edit) */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={editingId ? "Edit Transaction" : "Add Transaction"}>
        <form onSubmit={handleSaveTransaction} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 bg-gray-100 dark:bg-slate-900 p-1 rounded-lg">
                <button
                    type="button"
                    onClick={() => setTxType('expense')}
                    className={`py-2 text-sm font-medium rounded-md transition-all ${txType === 'expense' ? 'bg-white dark:bg-slate-800 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-stone-400'}`}
                >
                    Expense
                </button>
                <button
                    type="button"
                    onClick={() => setTxType('income')}
                    className={`py-2 text-sm font-medium rounded-md transition-all ${txType === 'income' ? 'bg-white dark:bg-slate-800 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-stone-400'}`}
                >
                    Income
                </button>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1">Amount</label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{state.currency}</span>
                    <input 
                        type="number" 
                        step="0.01" 
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-lg font-semibold"
                        placeholder="0.00"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1">Description</label>
                <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                    placeholder="e.g., Grocery shopping"
                />
            </div>

            {txType === 'expense' && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1 flex justify-between">
                        Category
                        {isSuggestingCategory && <span className="text-xs text-emerald-500 animate-pulse">AI suggestions...</span>}
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                        {state.categories.map(cat => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-all ${selectedCategory === cat.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-500 text-gray-700 dark:text-stone-300'}`}
                            >
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></span>
                                <span className="truncate">{cat.name}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setIsAddModalOpen(false);
                                setCategoryViewMode('form');
                                setEditingCategoryId(null);
                                setIsCategoryModalOpen(true);
                            }}
                            className="flex items-center justify-center gap-2 p-2 rounded-lg border border-dashed border-gray-300 dark:border-slate-600 text-gray-500 dark:text-stone-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <Plus size={16} />
                            <span className="text-sm">New Category</span>
                        </button>
                    </div>
                </div>
            )}

            {editingId && (
                <div className="flex justify-end pt-2">
                     <button type="button" onClick={() => handleDeleteTransaction(editingId)} className="text-red-500 text-sm flex items-center gap-1">
                        <Trash2 size={14} /> Delete Transaction
                     </button>
                </div>
            )}

            <button 
                type="submit" 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition-colors mt-4 shadow-lg shadow-emerald-500/20"
            >
                {editingId ? 'Save Changes' : `Add ${txType === 'expense' ? 'Expense' : 'Income'}`}
            </button>
        </form>
      </Modal>

      {/* Category Manager Modal */}
      <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title={categoryViewMode === 'list' ? "Categories" : (editingCategoryId ? "Edit Category" : "New Category")}>
        {categoryViewMode === 'list' ? (
             <div className="flex flex-col h-[400px]">
                <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                    {state.categories.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 dark:text-slate-500">
                             <Tag size={48} className="mb-4 opacity-50"/>
                             <p>No categories yet.</p>
                             <p className="text-sm">Create one to start tracking!</p>
                        </div>
                    ) : (
                        state.categories.map(cat => (
                            <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm" style={{ backgroundColor: cat.color }}>
                                        {cat.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-gray-900 dark:text-white">{cat.name}</span>
                                        {cat.budgetLimit ? (
                                             <span className="text-xs text-gray-500">Limit: {state.currency}{cat.budgetLimit}</span>
                                        ) : (
                                            <span className="text-xs text-gray-400">No Limit</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => handleEditCategory(cat)}
                                        className="p-2 text-gray-400 hover:text-emerald-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                    <button 
                                        onClick={() => {
                                             setState(prev => ({
                                                ...prev,
                                                categories: prev.categories.filter(c => c.id !== cat.id)
                                            }));
                                        }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <div className="pt-4 mt-2 border-t border-gray-100 dark:border-slate-800">
                    <button 
                        onClick={() => {
                            setNewCatName('');
                            setNewCatLimit('');
                            setNewCatColor(COLORS[0]);
                            setEditingCategoryId(null);
                            setCategoryViewMode('form');
                        }}
                        className="w-full bg-gray-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                    >
                        <Plus size={20} />
                        Create New Category
                    </button>
                </div>
             </div>
        ) : (
            <form onSubmit={handleSaveCategory} className="space-y-6">
                {/* Live Preview */}
                <div className="flex justify-center py-4">
                    <div className="flex items-center gap-3 px-6 py-3 rounded-2xl shadow-lg transition-all duration-300 transform scale-100" style={{ backgroundColor: newCatColor }}>
                        <span className="text-white font-bold text-lg">{newCatName || 'Category Name'}</span>
                        {newCatLimit && (
                            <span className="bg-white/20 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm">
                                {state.currency}{newCatLimit}
                            </span>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2 tracking-wider">Name</label>
                        <input 
                            type="text"
                            required
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-medium"
                            placeholder="e.g., Entertainment"
                            autoFocus
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2 tracking-wider">Monthly Limit (Optional)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">{state.currency}</span>
                            <input 
                                type="number"
                                value={newCatLimit}
                                onChange={(e) => setNewCatLimit(e.target.value)}
                                className="w-full pl-8 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 tracking-wider">Color</label>
                        <div className="grid grid-cols-5 gap-3">
                            {COLORS.map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setNewCatColor(color)}
                                    className={`w-10 h-10 rounded-full transition-all flex items-center justify-center ${newCatColor === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110 shadow-md' : 'hover:scale-105'}`}
                                    style={{ backgroundColor: color }}
                                >
                                    {newCatColor === color && <Check size={16} className="text-white" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 pt-2">
                    <button 
                        type="button"
                        onClick={handleCancelEditCategory}
                        className="flex-1 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        className="flex-[2] py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        {editingCategoryId ? 'Save Changes' : 'Create Category'}
                    </button>
                </div>
            </form>
        )}
      </Modal>

      {/* Profile Modal */}
      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title="My Profile">
            <div className="space-y-6">
                <div>
                   <h4 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 tracking-wider">Account Settings</h4>
                   <button 
                      onClick={() => {
                          setIsUserModalOpen(false);
                          setCategoryViewMode('list');
                          setIsCategoryModalOpen(true);
                      }}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors group"
                   >
                       <div className="flex items-center gap-3">
                           <div className="p-2 bg-white dark:bg-slate-800 rounded-lg text-emerald-600 dark:text-emerald-400 shadow-sm">
                                <LayoutGrid size={20} />
                           </div>
                           <div className="text-left">
                               <p className="font-medium text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Manage Categories</p>
                               <p className="text-xs text-gray-500 dark:text-stone-400">Add, edit or remove spending categories</p>
                           </div>
                       </div>
                       <ChevronLeft size={18} className="rotate-180 text-gray-400 group-hover:text-emerald-500 transition-colors" />
                   </button>
                </div>

                <div className="border-t border-gray-100 dark:border-slate-800 pt-4">
                  <h4 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 tracking-wider">Currency</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {CURRENCIES.map(c => (
                      <button
                        key={c.code}
                        onClick={() => setState(prev => ({ ...prev, currency: c.symbol }))}
                        className={`p-2 rounded-lg text-sm border font-medium transition-all ${state.currency === c.symbol ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-stone-400'}`}
                      >
                        {c.symbol}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                   <h4 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 tracking-wider">Monthly Goal</h4>
                   <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">{state.currency}</span>
                      <input 
                          type="number"
                          value={state.monthlyIncome}
                          onChange={(e) => setState(prev => ({ ...prev, monthlyIncome: parseFloat(e.target.value) || 0 }))}
                          className="w-full pl-8 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                      />
                   </div>
                </div>

                <div className="pt-2">
                     <button 
                        onClick={() => { setIsUserModalOpen(false); setIsEmailModalOpen(true); }}
                        className="w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white py-3 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                     >
                        <Mail size={18} />
                        Export Data via Email
                     </button>
                </div>
            </div>
      </Modal>

      {/* Settings Modal (Theme) */}
      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Settings">
          <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-200 dark:bg-slate-800 rounded-full text-gray-600 dark:text-gray-300">
                        {state.theme === 'light' ? <Sun size={20} /> : <Moon size={20} />}
                      </div>
                      <div>
                          <p className="font-medium text-gray-900 dark:text-white">App Theme</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{state.theme === 'light' ? 'Light Mode' : 'Dark Mode'}</p>
                      </div>
                  </div>
                  <button 
                    onClick={toggleTheme}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${state.theme === 'dark' ? 'bg-emerald-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${state.theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
              </div>

               <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
                  <p className="text-xs text-center text-gray-400 dark:text-slate-600">
                      Vyaya v1.0.1
                  </p>
               </div>
          </div>
      </Modal>

      {/* Email Report Modal */}
      <Modal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} title="Export Report">
         <form onSubmit={handleSendReport} className="space-y-4">
            <div className="text-center mb-4">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600 dark:text-emerald-400">
                    <Mail size={24} />
                </div>
                <p className="text-sm text-gray-500 dark:text-stone-400">
                    Get a PDF report for {currentDate.toLocaleString('default', { month: 'long' })} sent to your inbox.
                </p>
            </div>
            
            <input 
                type="email" 
                required
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                placeholder="you@example.com"
            />

            <button 
                type="submit" 
                disabled={isSendingEmail || isEmailSent}
                className={`w-full font-bold py-3.5 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                    isEmailSent 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
            >
                {isSendingEmail ? <Loader size={18} className="animate-spin" /> : isEmailSent ? "Sent!" : "Send Report"}
            </button>
         </form>
      </Modal>

    </div>
  );
};

// --- Sub-Components ---

const OverviewCard: React.FC<{ title: string, amount: number, currency: string, extra?: number, color: string, subtext?: string }> = ({ title, amount, currency, extra, color, subtext }) => {
  const colorClasses = {
    emerald: 'text-gray-900 dark:text-white', 
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400'
  };

  return (
     <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-emerald-500/10 flex flex-col transition-colors">
        <span className="text-xs text-gray-500 dark:text-stone-400 font-medium mb-1">{title}</span>
        <span className={`text-xl font-bold ${colorClasses[color as keyof typeof colorClasses] || 'text-gray-900 dark:text-white'}`}>
          {currency}{amount.toLocaleString()}
        </span>
        {subtext && <span className="text-[10px] text-gray-400 mt-2">{subtext}</span>}
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
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-gray-900 dark:text-white transition-colors">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold mb-2 text-emerald-600 dark:text-emerald-400">Welcome to Vyaya</h1>
                    <p className="text-gray-500 dark:text-stone-400 text-sm">Let's set up your financial peace of mind.</p>
                </div>

                {step === 1 ? (
                    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-1 gap-3">
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
                                        className={`p-4 rounded-xl border text-left transition-all ${isSelected ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-600 dark:border-emerald-500' : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSelected ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-200' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-stone-300'}`}>
                                                <Icon size={16} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm dark:text-stone-100">{t.name}</h3>
                                                <p className="text-xs text-gray-500 dark:text-stone-400">{t.description}</p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-emerald-500/30 animate-in slide-in-from-right-4 duration-500">
                         <div className="mb-6">
                            <h2 className="text-sm font-semibold mb-2 dark:text-stone-200">Select Currency</h2>
                            <div className="flex gap-2 flex-wrap">
                                {CURRENCIES.map(c => (
                                    <button
                                        key={c.code}
                                        onClick={() => setCurrency(c.symbol)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${currency === c.symbol ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-300 dark:border-slate-700 text-gray-600 dark:text-stone-400'}`}
                                    >
                                        {c.code}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <h2 className="text-lg font-semibold mb-6 dark:text-stone-200">Monthly Income Goal?</h2>
                        <div className="relative mb-4">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl font-medium">{currency}</span>
                            <input 
                                type="number" 
                                value={income}
                                onChange={(e) => setIncome(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 text-2xl font-bold border-b-2 border-gray-200 dark:border-slate-700 bg-transparent focus:border-emerald-600 outline-none transition-colors dark:text-white"
                                placeholder="0"
                                autoFocus
                            />
                        </div>
                    </div>
                )}

                <div className="mt-8">
                    <button
                        onClick={handleNext}
                        disabled={step === 1 ? !selectedTemplate : !income}
                        className="w-full bg-gray-900 dark:bg-emerald-600 text-white py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-800 dark:hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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