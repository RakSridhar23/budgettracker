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
  LayoutGrid,
  Bell,
  RefreshCw
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
      isLoggedIn: false,
      hasOnboarded: false,
      monthlyIncome: 0,
      currency: '$',
      theme: 'light', // Default to Light for Panda Theme
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

  const handleLogin = (email: string) => {
    setState(prev => ({ ...prev, isLoggedIn: true, userEmail: email }));
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, isLoggedIn: false }));
    setIsSettingsModalOpen(false);
  }

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
        setIsRecurring(parsedData.isRecurring);
        if (parsedData.recurrence) {
            setRecurrenceFreq(parsedData.recurrence);
        }
        
        let targetCategoryId = '';

        if (parsedData.categoryId) {
          // Exact match found
          targetCategoryId = parsedData.categoryId;
        } else if (parsedData.newCategoryName && parsedData.type === 'expense') {
          // AI suggested a new category that doesn't exist
          const newId = generateId();
          const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
          
          const newCat: Category = {
            id: newId,
            name: parsedData.newCategoryName,
            color: randomColor,
            icon: 'Tag',
            budgetLimit: 0
          };

          // Optimistically update state to include new category
          setState(prev => ({
            ...prev,
            categories: [...prev.categories, newCat]
          }));
          
          targetCategoryId = newId;
        } else {
           // Fallback
           targetCategoryId = state.categories[0]?.id || '';
        }

        setSelectedCategory(targetCategoryId);
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

  if (!state.isLoggedIn) {
      return <LoginView onLogin={handleLogin} />;
  }

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
    <div className={`min-h-screen pb-28 md:pb-12 transition-colors duration-500 font-sans ${state.theme === 'dark' ? 'bg-slate-950 text-white' : 'bg-panda-50 text-slate-800'}`}>
      
      {/* Mobile Header - Panda Style */}
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl sticky top-0 z-30 transition-all border-b border-panda-100 dark:border-slate-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-5 py-4">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-tr from-panda-600 to-accent-pink rounded-xl flex items-center justify-center text-white shadow-lg shadow-panda-500/20 transform hover:scale-105 transition-transform">
                   <span className="text-xl">🐼</span>
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">Vyaya</h1>
                  <p className="text-[10px] font-bold text-panda-500 uppercase tracking-widest">Budget Buddy</p>
                </div>
              </div>
              <button 
                  onClick={handleConfetti}
                  className="w-9 h-9 rounded-full bg-panda-50 dark:bg-slate-800 flex items-center justify-center text-accent-amber hover:bg-accent-amber hover:text-white transition-all duration-300"
                >
                  <Sparkles size={16} />
              </button>
          </div>
          
          <div className="flex items-center justify-between mt-6 mb-1">
             <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-panda-100 dark:hover:bg-slate-800 text-panda-400 hover:text-panda-700 dark:text-slate-500 dark:hover:text-white transition-all">
              <ChevronLeft size={20}/>
            </button>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
             <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-panda-100 dark:hover:bg-slate-800 text-panda-400 hover:text-panda-700 dark:text-slate-500 dark:hover:text-white transition-all">
              <ChevronLeft size={20} className="rotate-180"/>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 pt-6 pb-8 space-y-8">
        
        {/* Toggle Switch */}
        <div className="flex p-1.5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-panda-100 dark:border-slate-800 mx-auto max-w-sm">
            <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                    activeTab === 'dashboard' 
                    ? 'bg-panda-500 text-white shadow-md shadow-panda-500/25' 
                    : 'text-slate-400 dark:text-slate-500 hover:text-panda-600'
                }`}
            >
                Overview
            </button>
            <button
                onClick={() => setActiveTab('transactions')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                    activeTab === 'transactions' 
                    ? 'bg-panda-500 text-white shadow-md shadow-panda-500/25' 
                    : 'text-slate-400 dark:text-slate-500 hover:text-panda-600'
                }`}
            >
                List
            </button>
        </div>

        {/* Compact Panda AI Insight Pill - Adjusted to Fit Text */}
        <div className="flex justify-center w-full">
            <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-panda-100 dark:border-slate-800 p-2 pr-4 shadow-sm hover:shadow-md transition-all max-w-md w-full mx-auto">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 shrink-0 bg-panda-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-lg border border-panda-100 dark:border-slate-700">
                    🐼
                 </div>
                 
                 <div className="flex-1 min-w-0 py-1">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-black uppercase text-panda-500 tracking-wider">Insight</span>
                        {isLoadingAdvice && <Loader size={10} className="animate-spin text-panda-400"/>}
                    </div>
                    {/* Removed line-clamp-2 to let text fit naturally */}
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-snug">
                        {isLoadingAdvice ? "Munching bamboo..." : (aiAdvice || "Add expenses to get tips!")}
                    </p>
                 </div>
              </div>
            </div>
        </div>

        {/* Financial Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <OverviewCard 
            title="Income" 
            amount={state.monthlyIncome} 
            currency={state.currency} 
            color="violet"
            icon={<TrendingUp size={18} />}
          />
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-panda-100 dark:border-slate-800 flex flex-col justify-between hover:border-panda-200 transition-colors">
            <div className="flex justify-between items-start mb-2">
                 <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Spent</span>
                 <div className="p-2 rounded-lg bg-accent-pink/10 text-accent-pink">
                    <Wallet size={18} />
                 </div>
            </div>
            <div>
                <span className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{state.currency}{totalExpenses.toLocaleString()}</span>
                <div className="w-full bg-panda-50 dark:bg-slate-800 rounded-full h-2 mt-4 overflow-hidden">
                    <div 
                        className={`h-2 rounded-full transition-all duration-1000 ease-out bg-gradient-to-r from-accent-pink to-purple-500`} 
                        style={{ width: `${Math.min(spendPercentage, 100)}%` }}
                    ></div>
                </div>
                <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-400">
                    <span>0%</span>
                    <span>{spendPercentage.toFixed(0)}% used</span>
                </div>
            </div>
          </div>

          <OverviewCard 
             title="Left" 
             amount={remainingBudget} 
             currency={state.currency}
             color={remainingBudget < 0 ? 'red' : 'teal'}
             subtext={remainingBudget < 0 ? 'Over Budget' : 'Safe to Spend'}
             icon={<PieIcon size={18} />}
          />
        </div>

        {activeTab === 'dashboard' ? (
            <div className="space-y-6">
                {/* Chart Card */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-panda-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            Spending Breakdown
                        </h3>
                    </div>
                    <SpendingChart transactions={currentMonthTransactions} categories={state.categories} />
                </div>

                {/* Categories List */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-panda-100 dark:border-slate-800">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-6">Your Budgets</h3>
                        <div className="space-y-5 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {state.categories.map(cat => {
                            const spent = currentMonthTransactions
                                .filter(t => t.categoryId === cat.id && t.type === 'expense')
                                .reduce((sum, t) => sum + t.amount, 0);
                            
                            const limit = cat.budgetLimit || 0;
                            const hasLimit = limit > 0;
                            const percent = hasLimit ? (spent / limit) * 100 : (totalExpenses > 0 ? (spent / totalExpenses) * 100 : 0);
                            
                            // Determine color based on limit
                            let progressColor = cat.color;
                            if (hasLimit) {
                                if (percent > 100) progressColor = '#ef4444'; 
                                else if (percent > 85) progressColor = '#f59e0b';
                            }
                            const incomePercentage = state.monthlyIncome > 0 ? (spent / state.monthlyIncome) * 100 : 0;

                            if (spent === 0 && !hasLimit) return null;
                            
                            return (
                                <div key={cat.id} className="group">
                                    <div className="flex justify-between items-end text-sm mb-2">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-700 dark:text-slate-200">{cat.name}</span>
                                            <span className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                               {incomePercentage < 0.1 && spent > 0 ? '< 0.1' : incomePercentage.toFixed(1)}% of income
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-slate-900 dark:text-white">{state.currency}{spent.toLocaleString()}</span>
                                            {hasLimit && (
                                                <span className="text-slate-400 text-xs ml-1 font-medium">
                                                    / {state.currency}{limit.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="w-full bg-panda-50 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                                        <div 
                                            className="h-full rounded-full transition-all duration-700 ease-out" 
                                            style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: progressColor }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                        {state.categories.length === 0 && (
                             <div className="text-center py-8">
                                <div className="inline-block p-3 rounded-full bg-panda-50 dark:bg-slate-800 text-panda-300 mb-2">
                                    <Tag size={24} />
                                </div>
                                <p className="text-slate-400 text-sm font-medium">No categories set.</p>
                             </div>
                        )}
                        </div>
                </div>
            </div>
        ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-panda-100 dark:border-slate-800 overflow-hidden min-h-[400px]">
                {/* Transaction List */}
                <div className="divide-y divide-panda-50 dark:divide-slate-800">
                    {filteredTransactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
                            <div className="w-16 h-16 bg-panda-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                <List size={24} className="opacity-50" />
                            </div>
                            <p className="font-medium">No transactions found.</p>
                            <p className="text-xs opacity-70 mt-1">Tap the + button to add one!</p>
                        </div>
                    ) : (
                        filteredTransactions.map(t => {
                            const category = state.categories.find(c => c.id === t.categoryId);
                            return (
                                <div key={t.id} onClick={() => handleEditClick(t)} className="p-5 flex items-center justify-between hover:bg-panda-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                                    <div className="flex items-center gap-4">
                                        <div 
                                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-sm transition-transform group-hover:scale-105" 
                                            style={{ backgroundColor: t.type === 'income' ? '#10b981' : category?.color || '#9ca3af' }}
                                        >
                                            {t.type === 'income' ? <TrendingUp size={20}/> : (category?.name.charAt(0).toUpperCase() || '?')}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">{t.description}</p>
                                            <p className="text-xs font-medium text-slate-400 mt-0.5 flex items-center gap-1">
                                                {new Date(t.date).toLocaleDateString()}
                                                {t.isRecurring && <span className="text-panda-500 bg-panda-100 dark:bg-panda-900/30 px-1.5 py-0.5 rounded text-[10px]">Recurring</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-base font-black ${t.type === 'income' ? 'text-emerald-500' : 'text-slate-800 dark:text-white'}`}>
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

      {/* Floating Bottom Dock */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/20 dark:border-slate-800 pl-6 pr-6 pt-3 pb-3 rounded-full flex items-center gap-8 shadow-2xl shadow-panda-900/10 z-50">
        <button onClick={() => setIsUserModalOpen(true)} className="flex flex-col items-center gap-1 text-slate-400 hover:text-panda-600 dark:hover:text-panda-400 transition-colors">
            <User size={22} />
        </button>

        <div className="flex items-center gap-4">
            <button 
                onClick={handleVoiceInput}
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-panda-500/30 transition-all hover:scale-110 active:scale-95 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-panda-100 text-panda-600 dark:bg-slate-800 dark:text-panda-400'}`}
            >
                {isProcessingVoice ? <Loader size={20} className="animate-spin" /> : <Mic size={20} />}
            </button>
            <button 
                onClick={() => { resetForm(); setIsAddModalOpen(true); }}
                className="w-14 h-14 rounded-full bg-gradient-to-tr from-panda-600 to-accent-pink text-white flex items-center justify-center shadow-xl shadow-panda-500/40 hover:scale-110 active:scale-95 transition-all border-4 border-white dark:border-slate-900"
            >
                <Plus size={28} strokeWidth={3} />
            </button>
        </div>

        <button onClick={() => setIsSettingsModalOpen(true)} className="flex flex-col items-center gap-1 text-slate-400 hover:text-panda-600 dark:hover:text-panda-400 transition-colors">
            <Settings size={22} />
        </button>
      </div>

      {/* Transaction Modal (Add/Edit) */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={editingId ? "Edit Transaction" : "New Transaction"}>
        <form onSubmit={handleSaveTransaction} className="space-y-5">
            <div className="grid grid-cols-2 gap-2 bg-panda-50 dark:bg-slate-800 p-1.5 rounded-2xl">
                <button
                    type="button"
                    onClick={() => setTxType('expense')}
                    className={`py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${txType === 'expense' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'}`}
                >
                    Expense
                </button>
                <button
                    type="button"
                    onClick={() => setTxType('income')}
                    className={`py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${txType === 'income' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'}`}
                >
                    Income
                </button>
            </div>

            <div className="bg-panda-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-panda-100 dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Amount</label>
                <div className="relative flex items-center">
                    <span className="text-2xl font-bold text-slate-400 mr-2">{state.currency}</span>
                    <input 
                        type="number" 
                        step="0.01" 
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full bg-transparent border-none text-3xl font-black text-slate-800 dark:text-white focus:ring-0 p-0 placeholder-slate-300"
                        placeholder="0.00"
                        autoFocus
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</label>
                <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    className="w-full px-4 py-3.5 bg-white dark:bg-slate-900 border-2 border-panda-50 dark:border-slate-700 rounded-2xl focus:border-panda-500 focus:ring-4 focus:ring-panda-500/10 outline-none transition-all font-medium text-slate-800 dark:text-white"
                    placeholder="What's this for?"
                />
            </div>

            {txType === 'expense' && (
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Category</label>
                        {isSuggestingCategory && <span className="text-[10px] font-bold text-panda-500 bg-panda-100 px-2 py-0.5 rounded-full animate-pulse">Panda Thinking...</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {state.categories.map(cat => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex items-center gap-3 p-3 rounded-2xl border-2 text-sm transition-all text-left group ${selectedCategory === cat.id ? 'border-panda-500 bg-panda-50 dark:bg-panda-900/20 ring-1 ring-panda-500' : 'border-transparent bg-panda-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-panda-200'}`}
                            >
                                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold shadow-sm" style={{ backgroundColor: cat.color }}>
                                    {cat.name.charAt(0)}
                                </span>
                                <span className={`font-semibold truncate ${selectedCategory === cat.id ? 'text-panda-700 dark:text-panda-300' : ''}`}>{cat.name}</span>
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
                            className="flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-dashed border-panda-200 dark:border-slate-700 text-slate-400 hover:text-panda-600 hover:border-panda-300 hover:bg-panda-50 transition-all"
                        >
                            <Plus size={18} />
                            <span className="text-sm font-bold">Create New</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Recurring Toggle */}
            <div className={`p-4 rounded-2xl transition-all duration-300 border-2 ${isRecurring ? 'bg-panda-50 border-panda-200 dark:bg-slate-800 dark:border-slate-700' : 'bg-white border-transparent'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${isRecurring ? 'bg-panda-200 text-panda-700' : 'bg-slate-100 text-slate-400'}`}>
                            <Repeat size={18} />
                        </div>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Recurring Payment</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsRecurring(!isRecurring)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${isRecurring ? 'bg-panda-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {isRecurring && (
                    <div className="mt-4 animate-in slide-in-from-top-2 fade-in">
                         <div className="flex gap-2">
                             {['daily', 'weekly', 'monthly', 'yearly'].map((freq) => (
                                 <button
                                    key={freq}
                                    type="button"
                                    onClick={() => setRecurrenceFreq(freq as RecurrenceFrequency)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${recurrenceFreq === freq ? 'bg-white shadow-sm text-panda-600 ring-1 ring-panda-200' : 'text-slate-400 hover:bg-panda-100/50'}`}
                                 >
                                     {freq}
                                 </button>
                             ))}
                         </div>
                    </div>
                )}
            </div>

            {editingId && (
                <div className="flex justify-center pt-2">
                     <button type="button" onClick={() => handleDeleteTransaction(editingId)} className="text-red-400 hover:text-red-500 text-sm font-medium flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={16} /> Delete this transaction
                     </button>
                </div>
            )}

            <button 
                type="submit" 
                className="w-full bg-gradient-to-r from-panda-600 to-accent-pink hover:from-panda-500 hover:to-pink-400 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-panda-500/30 hover:shadow-panda-500/40 hover:scale-[1.01] active:scale-[0.99]"
            >
                {editingId ? 'Save Changes' : `Add ${txType === 'expense' ? 'Expense' : 'Income'}`}
            </button>
        </form>
      </Modal>

      {/* Category Manager Modal */}
      <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title={categoryViewMode === 'list' ? "Manage Categories" : (editingCategoryId ? "Edit Category" : "New Category")}>
        {categoryViewMode === 'list' ? (
             <div className="flex flex-col h-[400px]">
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {state.categories.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                             <div className="w-16 h-16 bg-panda-50 rounded-full flex items-center justify-center mb-4">
                                <Tag size={24} className="opacity-50"/>
                             </div>
                             <p className="font-medium">No categories yet.</p>
                        </div>
                    ) : (
                        state.categories.map(cat => (
                            <div key={cat.id} className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-panda-50 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm" style={{ backgroundColor: cat.color }}>
                                        {cat.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-800 dark:text-white">{cat.name}</span>
                                        {cat.budgetLimit ? (
                                             <span className="text-xs font-medium text-slate-400">Limit: {state.currency}{cat.budgetLimit}</span>
                                        ) : (
                                            <span className="text-xs font-medium text-slate-400 opacity-60">No Limit</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => handleEditCategory(cat)}
                                        className="p-2 text-slate-400 hover:text-panda-500 hover:bg-panda-50 rounded-xl transition-all"
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
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <div className="pt-4 mt-2">
                    <button 
                        onClick={() => {
                            setNewCatName('');
                            setNewCatLimit('');
                            setNewCatColor(COLORS[0]);
                            setEditingCategoryId(null);
                            setCategoryViewMode('form');
                        }}
                        className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-lg"
                    >
                        <Plus size={20} />
                        Create New Category
                    </button>
                </div>
             </div>
        ) : (
            <form onSubmit={handleSaveCategory} className="space-y-6">
                {/* Live Preview */}
                <div className="flex justify-center py-6">
                    <div className="flex flex-col items-center gap-3 transform scale-110">
                        <div className="w-16 h-16 rounded-2xl shadow-lg flex items-center justify-center text-white text-2xl font-bold transition-colors duration-300" style={{ backgroundColor: newCatColor }}>
                            {newCatName ? newCatName.charAt(0).toUpperCase() : '?'}
                        </div>
                        <span className="font-bold text-slate-800 dark:text-white">{newCatName || 'Category Name'}</span>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
                        <input 
                            type="text"
                            required
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            className="w-full px-4 py-3.5 border-2 border-panda-100 dark:border-slate-700 rounded-2xl focus:border-panda-500 focus:ring-4 focus:ring-panda-500/10 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                            placeholder="e.g., Gaming"
                            autoFocus
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Monthly Limit</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{state.currency}</span>
                            <input 
                                type="number"
                                value={newCatLimit}
                                onChange={(e) => setNewCatLimit(e.target.value)}
                                className="w-full pl-8 pr-4 py-3.5 border-2 border-panda-100 dark:border-slate-700 rounded-2xl focus:border-panda-500 focus:ring-4 focus:ring-panda-500/10 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                                placeholder="Optional"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Color Code</label>
                        <div className="grid grid-cols-6 gap-3">
                            {COLORS.map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setNewCatColor(color)}
                                    className={`w-10 h-10 rounded-full transition-all flex items-center justify-center ${newCatColor === color ? 'ring-2 ring-offset-2 ring-slate-300 scale-110 shadow-md' : 'hover:scale-105 hover:opacity-80'}`}
                                    style={{ backgroundColor: color }}
                                >
                                    {newCatColor === color && <Check size={16} className="text-white" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 pt-4">
                    <button 
                        type="button"
                        onClick={handleCancelEditCategory}
                        className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        className="flex-[2] py-4 bg-panda-600 text-white font-bold rounded-2xl hover:bg-panda-700 transition-colors shadow-lg shadow-panda-500/20"
                    >
                        {editingCategoryId ? 'Save Changes' : 'Create Category'}
                    </button>
                </div>
            </form>
        )}
      </Modal>

      {/* Profile Modal */}
      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title="Profile">
            <div className="space-y-6">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-20 h-20 bg-panda-100 rounded-full flex items-center justify-center text-4xl mb-3 shadow-inner">
                        🐼
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Budget Explorer</h3>
                </div>

                <div>
                   <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Customization</h4>
                   <button 
                      onClick={() => {
                          setIsUserModalOpen(false);
                          setCategoryViewMode('list');
                          setIsCategoryModalOpen(true);
                      }}
                      className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-panda-100 dark:border-slate-700 hover:border-panda-300 transition-all group shadow-sm hover:shadow-md"
                   >
                       <div className="flex items-center gap-4">
                           <div className="p-2.5 bg-panda-50 dark:bg-slate-700 rounded-xl text-panda-600 dark:text-panda-400">
                                <LayoutGrid size={20} />
                           </div>
                           <div className="text-left">
                               <p className="font-bold text-slate-800 dark:text-white">Manage Categories</p>
                               <p className="text-xs text-slate-500">Edit colors & limits</p>
                           </div>
                       </div>
                       <ChevronLeft size={20} className="rotate-180 text-slate-300 group-hover:text-panda-500 transition-colors" />
                   </button>
                </div>

                <div className="border-t border-panda-100 dark:border-slate-800 pt-6">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Goal Settings</h4>
                  
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Monthly Income</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{state.currency}</span>
                        <input 
                            type="number"
                            value={state.monthlyIncome}
                            onChange={(e) => setState(prev => ({ ...prev, monthlyIncome: parseFloat(e.target.value) || 0 }))}
                            className="w-full pl-8 pr-4 py-3 bg-panda-50 dark:bg-slate-900 border border-transparent focus:border-panda-300 rounded-xl outline-none font-bold text-slate-800 dark:text-white"
                        />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {CURRENCIES.map(c => (
                      <button
                        key={c.code}
                        onClick={() => setState(prev => ({ ...prev, currency: c.symbol }))}
                        className={`p-2 rounded-xl text-xs font-bold transition-all border ${state.currency === c.symbol ? 'border-panda-500 bg-panda-50 text-panda-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                      >
                        {c.symbol}
                      </button>
                    ))}
                  </div>
                </div>
            </div>
      </Modal>

      {/* Settings Modal (Theme) */}
      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Preferences">
          <div className="space-y-6">
              <div className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 rounded-2xl border border-panda-100 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center gap-4">
                      <div className="p-3 bg-panda-50 dark:bg-slate-700 rounded-full text-panda-600 dark:text-panda-400">
                        {state.theme === 'light' ? <Sun size={20} /> : <Moon size={20} />}
                      </div>
                      <div>
                          <p className="font-bold text-slate-800 dark:text-white">Dark Mode</p>
                          <p className="text-xs text-slate-500">Switch between light & dark themes</p>
                      </div>
                  </div>
                  <button 
                    onClick={toggleTheme}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${state.theme === 'dark' ? 'bg-panda-600' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${state.theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
              </div>
               
               <div className="pt-6 border-t border-panda-100 dark:border-slate-800 text-center space-y-4">
                   <button 
                        onClick={handleLogout}
                        className="text-xs font-bold text-red-400 hover:text-red-500 uppercase tracking-widest hover:underline flex items-center justify-center gap-2 mx-auto"
                   >
                       <LogOut size={12} />
                       Exit App
                   </button>
                   <p className="text-[10px] font-semibold text-panda-200 uppercase tracking-widest">Vyaya Version 2.0</p>
               </div>
          </div>
      </Modal>

      {/* Email Report Modal */}
      <Modal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} title="Export Report">
         <form onSubmit={handleSendReport} className="space-y-5">
            <div className="bg-panda-50 p-6 rounded-3xl text-center">
                <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto mb-3 text-panda-500 shadow-sm">
                    <Mail size={24} />
                </div>
                <h4 className="font-bold text-slate-800 mb-1">Monthly Statement</h4>
                <p className="text-xs text-slate-500">
                    Send a detailed PDF summary for {currentDate.toLocaleString('default', { month: 'long' })} to your email.
                </p>
            </div>
            
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                <input 
                    type="email" 
                    required
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    className="w-full px-4 py-3.5 border-2 border-panda-100 rounded-2xl focus:border-panda-500 outline-none font-medium"
                    placeholder="panda@example.com"
                />
            </div>

            <button 
                type="submit" 
                disabled={isSendingEmail || isEmailSent}
                className={`w-full font-bold py-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 ${
                    isEmailSent 
                    ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' 
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
            >
                {isSendingEmail ? <Loader size={20} className="animate-spin" /> : isEmailSent ? "Sent Successfully!" : "Send Report"}
            </button>
         </form>
      </Modal>

    </div>
  );
};

// --- Sub-Components ---

const LoginView: React.FC<{ onLogin: (email: string) => void }> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    
    return (
        <div className="flex flex-col h-screen bg-white dark:bg-slate-950 font-sans relative overflow-hidden">
            {/* Top Section - 60% */}
            <div className="h-[60%] flex items-center justify-center relative p-8 bg-white dark:bg-slate-900">
                <div className="relative w-full h-full flex items-center justify-center">
                    {/* Calligraphy Text */}
                    <h1 className="text-[100px] md:text-[140px] leading-none text-panda-400 dark:text-panda-300 font-['Great_Vibes'] drop-shadow-sm animate-in fade-in zoom-in duration-1000">
                        Vyaya
                    </h1>
                </div>
            </div>

            {/* Bottom Section - 40% */}
            <div className="h-[40%] bg-white dark:bg-slate-900 w-full rounded-t-[3rem] px-8 pt-10 pb-6 shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.1)] ring-1 ring-black/5 relative z-20 flex flex-col">
                <div className="max-w-md mx-auto w-full flex flex-col h-full">
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-8">Login</h2>
                    
                    <form 
                        onSubmit={(e) => { 
                            e.preventDefault(); 
                            if(email) onLogin(email); 
                        }}
                        className="space-y-6"
                    >
                        <div>
                             <input 
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-5 py-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-slate-900 dark:focus:border-white focus:ring-0 outline-none transition-all font-medium text-slate-800 dark:text-white placeholder-slate-400"
                                placeholder="username@email.com"
                             />
                        </div>

                        <button 
                            type="submit"
                            className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-4 rounded-full shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Login
                        </button>
                    </form>

                    <div className="mt-auto pb-4 text-center">
                         <p className="text-sm font-medium text-slate-500">
                            You don't have an account? <button onClick={() => alert("Sign up flow coming soon!")} className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Sign up</button>
                         </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OverviewCard: React.FC<{ title: string, amount: number, currency: string, extra?: number, color: string, subtext?: string, icon: any }> = ({ title, amount, currency, extra, color, subtext, icon }) => {
  const bgColors = {
    violet: 'bg-white',
    teal: 'bg-white', 
    red: 'bg-white'
  };
  
  const textColors = {
    violet: 'text-panda-600',
    teal: 'text-emerald-500',
    red: 'text-rose-500'
  }

  const iconBg = {
    violet: 'bg-panda-50 text-panda-500',
    teal: 'bg-emerald-50 text-emerald-500',
    red: 'bg-rose-50 text-rose-500'
  }

  return (
     <div className={`${bgColors[color as keyof typeof bgColors] || 'bg-white'} dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-panda-100 dark:border-slate-800 flex flex-col justify-between hover:border-panda-200 transition-all`}>
        <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{title}</span>
            <div className={`p-2 rounded-lg ${iconBg[color as keyof typeof iconBg]}`}>
                {icon}
            </div>
        </div>
        <div>
            <span className={`text-2xl font-black tracking-tight ${textColors[color as keyof typeof textColors] || 'text-slate-800'} dark:text-white`}>
            {currency}{amount.toLocaleString()}
            </span>
            {subtext && <span className="block text-[10px] font-bold text-slate-400 mt-1">{subtext}</span>}
        </div>
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
        <div className="min-h-screen bg-panda-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-800 dark:text-white transition-colors">
            <div className="w-full max-w-md">
                <div className="text-center mb-10">
                    <div className="w-24 h-24 bg-white rounded-full mx-auto mb-6 flex items-center justify-center shadow-xl shadow-panda-500/20 text-5xl animate-bounce-slow">
                        🐼
                    </div>
                    <h1 className="text-3xl font-black mb-2 text-slate-900 dark:text-white tracking-tight">Welcome to Vyaya</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Your playful financial companion.</p>
                </div>

                {step === 1 ? (
                    <div className="space-y-4 animate-in slide-in-from-bottom-8 duration-700">
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
                                        className={`p-5 rounded-2xl border-2 text-left transition-all duration-300 ${isSelected ? 'border-panda-500 bg-white shadow-lg ring-1 ring-panda-500 transform scale-[1.02]' : 'border-transparent bg-white/60 dark:bg-slate-900 hover:bg-white hover:shadow-md'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSelected ? 'bg-panda-100 text-panda-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                                <Icon size={20} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t.name}</h3>
                                                <p className="text-xs text-slate-500">{t.description}</p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl shadow-panda-900/5 animate-in slide-in-from-right-8 duration-500">
                         <div className="mb-8">
                            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Currency</h2>
                            <div className="flex gap-2 flex-wrap">
                                {CURRENCIES.map(c => (
                                    <button
                                        key={c.code}
                                        onClick={() => setCurrency(c.symbol)}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${currency === c.symbol ? 'bg-panda-500 text-white border-panda-500' : 'border-slate-100 bg-slate-50 text-slate-500'}`}
                                    >
                                        {c.code}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <h2 className="text-xl font-bold mb-6 text-slate-900 dark:text-white">Monthly Income</h2>
                        <div className="relative mb-4">
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-300 text-3xl font-black">{currency}</span>
                            <input 
                                type="number" 
                                value={income}
                                onChange={(e) => setIncome(e.target.value)}
                                className="w-full pl-8 pr-4 py-2 text-4xl font-black border-b-2 border-slate-100 bg-transparent focus:border-panda-500 outline-none transition-colors text-slate-900 dark:text-white placeholder-slate-200"
                                placeholder="0"
                                autoFocus
                            />
                        </div>
                    </div>
                )}

                <div className="mt-10">
                    <button
                        onClick={handleNext}
                        disabled={step === 1 ? !selectedTemplate : !income}
                        className="w-full bg-slate-900 dark:bg-panda-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-xl"
                    >
                        {step === 1 ? 'Continue' : 'Start Budgeting'}
                        <ArrowRight size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default App;