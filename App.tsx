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
  Calendar,
  Repeat,
  Download,
  Pencil,
  Mail,
  Loader,
  Check,
  X,
  Mic
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
      theme: 'dark', // Default to Dark for "off-white font" aesthetic
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
      // Stop logic is handled by the 'end' event usually, but if user clicks button again, we can stop manually if we had the instance ref.
      // For simplicity in this functional component without ref persistence for the recognition instance, 
      // we'll rely on the user toggling or the auto-stop. 
      // Ideally, we'd store the recognition instance in a ref to call .stop().
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
          // If category was not found/assigned, default to first or empty
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
      // Wait for onresult
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
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
  };

  const handleEditCategory = (cat: Category) => {
    setNewCatName(cat.name);
    setNewCatLimit(cat.budgetLimit?.toString() || '');
    setNewCatColor(cat.color);
    setEditingCategoryId(cat.id);
  };

  const handleCancelEditCategory = () => {
    setNewCatName('');
    setNewCatLimit('');
    setNewCatColor(COLORS[0]);
    setEditingCategoryId(null);
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

    // Simulate Network Delay and Generation Time
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Generate PDF
    const doc = new jsPDF();
    const monthStr = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    // --- Header ---
    doc.setFontSize(22);
    doc.setTextColor(33, 33, 33);
    doc.text(`Vyaya Report`, 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`For: ${monthStr}`, 14, 28);
    doc.text(`Prepared for: ${emailAddress}`, 14, 34);

    // --- Overview Stats ---
    doc.setDrawColor(200);
    doc.line(14, 40, 196, 40);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Total Income", 14, 50);
    doc.text("Total Expenses", 80, 50);
    doc.text("Net Balance", 150, 50);

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`${state.currency}${totalIncome.toLocaleString()}`, 14, 58);
    doc.text(`${state.currency}${totalExpenses.toLocaleString()}`, 80, 58);
    
    const netColor = remainingBudget >= 0 ? [16, 185, 129] : [239, 68, 68]; // Green or Red
    doc.setTextColor(netColor[0], netColor[1], netColor[2]);
    doc.text(`${state.currency}${remainingBudget.toLocaleString()}`, 150, 58);

    // --- Overview Graph (Visual Breakdown) ---
    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.text("Expense Breakdown", 14, 75);
    
    // Draw Stacked Bar
    let currentX = 14;
    const barWidth = 182; // Total width
    const barHeight = 8;
    const barY = 80;

    if (totalExpenses > 0) {
      state.categories.forEach(cat => {
        const spent = currentMonthTransactions
            .filter(t => t.categoryId === cat.id && t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        
        if (spent > 0) {
          const width = (spent / totalExpenses) * barWidth;
          doc.setFillColor(cat.color);
          doc.rect(currentX, barY, width, barHeight, 'F');
          currentX += width;
        }
      });
    } else {
        doc.setFillColor(240, 240, 240);
        doc.rect(currentX, barY, barWidth, barHeight, 'F');
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("No expenses recorded", 14 + barWidth/2, barY + 5, { align: 'center' });
    }

    // Legend
    let legendY = 95;
    state.categories.forEach(cat => {
        const spent = currentMonthTransactions
            .filter(t => t.categoryId === cat.id && t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        
        if (spent > 0) {
            const percentage = ((spent / totalExpenses) * 100).toFixed(1);
            doc.setFillColor(cat.color);
            doc.circle(16, legendY, 2, 'F');
            doc.setFontSize(9);
            doc.setTextColor(50);
            doc.text(`${cat.name} - ${state.currency}${spent.toLocaleString()} (${percentage}%)`, 22, legendY + 1);
            legendY += 6;
        }
    });

    // --- Transaction Table ---
    // @ts-ignore
    autoTable(doc, {
        startY: legendY + 10,
        head: [['Date', 'Description', 'Category', 'Type', 'Amount']],
        body: currentMonthTransactions.map(t => {
            const cat = state.categories.find(c => c.id === t.categoryId);
            return [
                new Date(t.date).toLocaleDateString(),
                t.description,
                cat?.name || 'Income',
                t.type,
                `${t.type === 'income' ? '+' : '-'}${state.currency}${t.amount.toLocaleString()}`
            ];
        }),
        headStyles: { fillColor: [16, 185, 129] }, // Emerald header (approx)
        alternateRowStyles: { fillColor: [240, 253, 244] } // Light green
    });

    // Transition to Success State
    setIsSendingEmail(false);
    setIsEmailSent(true);

    // Show Green Tick for 1.5 seconds
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Save File
    doc.save(`Vyaya_Report_${monthStr}.pdf`);
    
    // Reset UI
    setIsEmailSent(false);
    setIsEmailModalOpen(false);
    setEmailAddress('');
    
    // Show info alert
    setTimeout(() => {
        alert(`Report generated for ${emailAddress}!\n\nBecause this is a demo app, the PDF has been downloaded to your device instead of emailed. You can now attach it to an email yourself.`);
    }, 100);
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
    <div className={`min-h-screen pb-24 md:pb-12 transition-colors duration-300 ${state.theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-emerald-500/20 sticky top-0 z-30 transition-colors">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4 md:mb-0">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                  <Wallet size={20} />
                </div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-stone-100 tracking-tight">Vyaya</h1>
              </div>

              <div className="flex items-center gap-2">
                <button
                    onClick={handleVoiceInput}
                    disabled={isListening || isProcessingVoice}
                    className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                        isListening 
                        ? 'bg-red-500 text-white animate-pulse' 
                        : isProcessingVoice 
                        ? 'bg-amber-500 text-white'
                        : 'bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-stone-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 hover:text-emerald-600'
                    }`}
                    title="Voice Record Transaction"
                >
                    {isProcessingVoice ? <Loader size={18} className="animate-spin" /> : <Mic size={18} />}
                    {isListening && <span className="text-xs font-medium hidden md:inline">Listening...</span>}
                </button>

                <button 
                  onClick={() => {
                      resetForm();
                      setIsAddModalOpen(true);
                  }}
                  className="hidden md:flex bg-gray-900 dark:bg-emerald-600 hover:bg-gray-800 dark:hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors items-center gap-2 mr-2"
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
                  className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {state.theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
                <button 
                  onClick={() => setIsUserModalOpen(true)}
                  className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <User size={20} />
                </button>
              </div>
          </div>
          
          {/* Month Navigation */}
          <div className="flex items-center justify-between md:justify-center gap-4 mt-2">
            <button onClick={() => changeMonth(-1)} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-emerald-400 transition-colors">
              <ArrowLeft size={20}/>
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-stone-100 min-w-[140px] text-center">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
             <button onClick={() => changeMonth(1)} className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-emerald-400 transition-colors">
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
            color="emerald"
          />
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-emerald-500/30 flex flex-col transition-colors">
            <span className="text-sm text-gray-500 dark:text-stone-400 font-medium mb-1">Total Spent</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-stone-100">{state.currency}{totalExpenses.toLocaleString()}</span>
            <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 mt-3 overflow-hidden">
                <div 
                    className={`h-2 rounded-full transition-all duration-500 ${spendPercentage > 100 ? 'bg-red-500' : 'bg-emerald-500'}`} 
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
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-900 dark:to-slate-900 p-6 rounded-2xl border border-emerald-500/30 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-10 dark:opacity-5">
             <span className="text-9xl grayscale opacity-20 select-none">🐼</span> 
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                <span className="text-xl">🐼</span>
                <span>Financial Buddy</span>
            </div>
            <div className="flex gap-4">
                <p className="text-gray-700 dark:text-stone-300 leading-relaxed italic">
                "{isLoadingAdvice ? "Eating bamboo and crunching numbers..." : (aiAdvice || "Start adding transactions to get some wisdom!")}"
                </p>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-stone-500 mt-3 border-t border-emerald-100 dark:border-slate-800 pt-2">
                * This is not strictly financial advice. Always consult a professional.
            </p>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex space-x-1 bg-gray-100 dark:bg-slate-900 p-1 rounded-xl w-fit border border-emerald-500/20">
                    <button 
                        onClick={() => setActiveTab('dashboard')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-stone-400 hover:text-gray-700 dark:hover:text-stone-200'}`}
                    >
                        Overview
                    </button>
                    <button 
                        onClick={() => setActiveTab('transactions')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'transactions' ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-stone-400 hover:text-gray-700 dark:hover:text-stone-200'}`}
                    >
                        Transactions
                    </button>
                </div>
                
                {activeTab === 'transactions' && (
                    <div className="flex items-center gap-2 flex-wrap">
                         <div className="flex items-center bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-lg px-2">
                            <Filter size={14} className="text-gray-400 mr-1" />
                            <select 
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value as any)}
                                className="bg-transparent text-gray-700 dark:text-stone-300 text-sm py-2 outline-none cursor-pointer"
                            >
                                <option value="all">All Types</option>
                                <option value="expense">Expenses</option>
                                <option value="income">Income</option>
                            </select>
                         </div>

                         <select 
                            value={filterRecurrence}
                            onChange={(e) => setFilterRecurrence(e.target.value as any)}
                            className="bg-white dark:bg-slate-900 border border-emerald-500/30 text-gray-700 dark:text-stone-300 text-sm rounded-lg px-3 py-2 outline-none cursor-pointer"
                        >
                            <option value="all">All Frequencies</option>
                            <option value="recurring">Recurring Only</option>
                            <option value="non-recurring">One-time Only</option>
                        </select>

                         <select 
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="bg-white dark:bg-slate-900 border border-emerald-500/30 text-gray-700 dark:text-stone-300 text-sm rounded-lg px-3 py-2 outline-none max-w-[150px] cursor-pointer"
                        >
                            <option value="all">All Categories</option>
                            {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {activeTab === 'dashboard' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-emerald-500/30">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-gray-900 dark:text-stone-100 flex items-center gap-2">
                                <PieIcon size={18} className="text-gray-400 dark:text-stone-500"/>
                                Spending Breakdown
                            </h3>
                            <button 
                                onClick={() => setIsCategoryModalOpen(true)}
                                className="text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                            >
                                Manage Categories
                            </button>
                        </div>
                        <SpendingChart transactions={currentMonthTransactions} categories={state.categories} />
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-emerald-500/30">
                         <h3 className="font-semibold text-gray-900 dark:text-stone-100 mb-4">Category Budgets</h3>
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
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-700 dark:text-stone-300 font-medium">{cat.name}</span>
                                            <div className="text-right">
                                                <span className="text-gray-900 dark:text-white font-bold">{state.currency}{spent.toLocaleString()}</span>
                                                {hasLimit && (
                                                    <span className="text-gray-400 text-xs ml-1">
                                                        / {state.currency}{limit.toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2">
                                            <div 
                                                className="h-2 rounded-full transition-all duration-500" 
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
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-500/30 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-stone-400 text-xs uppercase font-semibold border-b border-emerald-500/20">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Description</th>
                                    <th className="px-6 py-4">Category</th>
                                    <th className="px-6 py-4 text-right">Amount</th>
                                    <th className="px-6 py-4 w-20 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-emerald-900/20 text-sm">
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400 dark:text-stone-500">
                                            No transactions found matching your filters.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map(t => {
                                        const category = state.categories.find(c => c.id === t.categoryId);
                                        return (
                                            <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-emerald-900/10 transition-colors">
                                                <td className="px-6 py-4 text-gray-500 dark:text-stone-400 whitespace-nowrap">
                                                    {new Date(t.date).toLocaleDateString()}
                                                    {t.isRecurring && (
                                                      <span className="ml-2 inline-flex items-center text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded text-[10px] font-medium" title="Recurring">
                                                        <Repeat size={10} className="mr-1" /> Recurring
                                                      </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                                    {t.description}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {t.type === 'income' ? (
                                                        <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-md text-xs font-semibold">Income</span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-stone-300 text-xs font-medium">
                                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: category?.color || '#9ca3af' }}></span>
                                                            {category?.name || 'Uncategorized'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={`px-6 py-4 text-right font-bold ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                                                    {t.type === 'income' ? '+' : '-'}{state.currency}{t.amount.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                    <button 
                                                        onClick={() => handleEditClick(t)}
                                                        className="text-gray-400 hover:text-emerald-500 transition-colors mr-2"
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
        className="md:hidden fixed bottom-6 right-6 bg-emerald-600 text-white w-14 h-14 rounded-full shadow-lg shadow-emerald-600/30 flex items-center justify-center z-40 hover:scale-105 transition-transform"
      >
        <Plus size={24} />
      </button>

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
                        className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                        placeholder="0.00"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1">Description</label>
                <input 
                    type="text" 
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                    placeholder={txType === 'expense' ? "e.g., Grocery shopping" : "e.g., Freelance payment"}
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
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2 pt-2">
                <input 
                    type="checkbox" 
                    id="recurring" 
                    checked={isRecurring} 
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="recurring" className="text-sm text-gray-700 dark:text-stone-300">Monthly Recurring Transaction</label>
            </div>
            
            {editingId && isRecurring && (
                 <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                    Editing this will update all future occurrences of this recurring transaction.
                 </p>
            )}

            <button 
                type="submit" 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-xl transition-colors mt-4"
            >
                {editingId ? 'Save Changes' : `Add ${txType === 'expense' ? 'Expense' : 'Income'}`}
            </button>
        </form>
      </Modal>

      {/* Category Manager Modal */}
      <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title="Manage Categories">
            <div className="space-y-6">
                {/* List of Existing Categories */}
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {state.categories.map(cat => (
                         <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900 rounded-lg group border border-emerald-500/20">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }}></div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-700 dark:text-stone-200">{cat.name}</span>
                                    {cat.budgetLimit && cat.budgetLimit > 0 && (
                                        <span className="text-xs text-gray-400">Limit: {state.currency}{cat.budgetLimit}</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => handleEditCategory(cat)}
                                    className="text-gray-400 hover:text-emerald-500 transition-colors p-1"
                                    title="Edit"
                                >
                                    <Pencil size={14} />
                                </button>
                                <button 
                                    onClick={() => {
                                        setState(prev => ({
                                            ...prev,
                                            categories: prev.categories.filter(c => c.id !== cat.id)
                                        }));
                                    }}
                                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                    title="Delete"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                         </div>
                    ))}
                </div>

                {/* Add / Edit Form */}
                <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                            {editingCategoryId ? 'Edit Category' : 'Add New Category'}
                        </h4>
                        {editingCategoryId && (
                            <button 
                                onClick={handleCancelEditCategory}
                                className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-stone-300 flex items-center gap-1"
                            >
                                <X size={12} /> Cancel
                            </button>
                        )}
                    </div>
                    
                    <form onSubmit={handleSaveCategory} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 sm:col-span-1">
                                <input 
                                    type="text"
                                    placeholder="Category Name"
                                    required
                                    value={newCatName}
                                    onChange={(e) => setNewCatName(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="col-span-2 sm:col-span-1 relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{state.currency}</span>
                                <input 
                                    type="number"
                                    placeholder="Budget Limit (Opt)"
                                    value={newCatLimit}
                                    onChange={(e) => setNewCatLimit(e.target.value)}
                                    className="w-full pl-7 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                                />
                            </div>
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
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            {editingCategoryId ? 'Update Category' : 'Create Category'}
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
                        className={`p-2 rounded-lg text-sm border font-medium transition-all ${state.currency === c.symbol ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-slate-700 hover:border-emerald-300 text-gray-700 dark:text-stone-300'}`}
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
                          className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                      />
                   </div>
                </div>

                <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Actions</h4>
                  <button 
                    onClick={() => {
                        setIsUserModalOpen(false);
                        setIsEmailModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-slate-700 hover:bg-gray-800 dark:hover:bg-slate-600 text-white py-3 rounded-xl transition-colors"
                  >
                    <Mail size={18} />
                    Email Report for {currentDate.toLocaleString('default', { month: 'short' })}
                  </button>
                </div>
            </div>
      </Modal>

      {/* Email Report Modal */}
      <Modal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} title="Email PDF Report">
         <form onSubmit={handleSendReport} className="space-y-4">
            <div className="text-center mb-4">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600 dark:text-emerald-400">
                    <Mail size={24} />
                </div>
                <p className="text-sm text-gray-500 dark:text-stone-400">
                    Enter your email to receive a detailed PDF report including your spending graph and full transaction history.
                </p>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-stone-300 mb-1">Email Address</label>
                <input 
                    type="email" 
                    required
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                    placeholder="you@example.com"
                />
            </div>

            <button 
                type="submit" 
                disabled={isSendingEmail || isEmailSent}
                className={`w-full font-medium py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                    isEmailSent 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-[1.02]' 
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-70 disabled:cursor-not-allowed'
                }`}
            >
                {isSendingEmail ? (
                    <>
                        <Loader size={18} className="animate-spin" />
                        Generating PDF...
                    </>
                ) : isEmailSent ? (
                    <>
                        <Check size={20} className="animate-bounce" />
                        <span>Sent!</span>
                    </>
                ) : (
                    <>
                        Send Report
                    </>
                )}
            </button>
         </form>
      </Modal>

    </div>
  );
};

// --- Sub-Components ---

const OverviewCard: React.FC<{ title: string, amount: number, currency: string, extra?: number, color: string, subtext?: string }> = ({ title, amount, currency, extra, color, subtext }) => {
  const colorClasses = {
    emerald: 'text-gray-900 dark:text-white', // Default text color for stats in dark mode is white/stone-200
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400'
  };

  return (
     <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-emerald-500/30 flex flex-col transition-colors">
        <span className="text-sm text-gray-500 dark:text-stone-400 font-medium mb-1">{title}</span>
        <span className={`text-2xl font-bold ${colorClasses[color as keyof typeof colorClasses] || 'text-gray-900 dark:text-white'}`}>
          {currency}{amount.toLocaleString()}
        </span>
        {extra && extra > 0 ? (
           <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center mt-2">
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
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-gray-900 dark:text-white transition-colors">
            <div className="w-full max-w-2xl">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold mb-3 text-emerald-600 dark:text-emerald-400">Welcome to Vyaya</h1>
                    <p className="text-gray-500 dark:text-stone-400">Let's set up your financial peace of mind.</p>
                </div>

                {step === 1 ? (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-lg font-semibold dark:text-stone-200">Choose a template to start</h2>
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
                                        className={`p-6 rounded-2xl border-2 text-left transition-all ${isSelected ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-600 dark:border-emerald-500' : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300 dark:hover:border-emerald-500/50'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${isSelected ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-200' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-stone-300'}`}>
                                            <Icon size={20} />
                                        </div>
                                        <h3 className="font-bold dark:text-stone-100">{t.name}</h3>
                                        <p className="text-sm text-gray-500 dark:text-stone-400 mt-1">{t.description}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-emerald-500/30 animate-in slide-in-from-right-4 duration-500">
                         <div className="mb-6">
                            <h2 className="text-lg font-semibold mb-2 dark:text-stone-200">Select Currency</h2>
                            <div className="flex gap-2 flex-wrap">
                                {CURRENCIES.map(c => (
                                    <button
                                        key={c.code}
                                        onClick={() => setCurrency(c.symbol)}
                                        className={`px-3 py-1 rounded-full text-sm border ${currency === c.symbol ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-300 dark:border-slate-700 text-gray-600 dark:text-stone-400'}`}
                                    >
                                        {c.code} ({c.symbol})
                                    </button>
                                ))}
                            </div>
                        </div>

                        <h2 className="text-xl font-semibold mb-6 dark:text-stone-200">What is your expected monthly income?</h2>
                        <div className="relative mb-8">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl font-medium">{currency}</span>
                            <input 
                                type="number" 
                                value={income}
                                onChange={(e) => setIncome(e.target.value)}
                                className="w-full pl-10 pr-4 py-4 text-2xl font-bold border-b-2 border-gray-200 dark:border-slate-700 bg-transparent focus:border-emerald-600 outline-none transition-colors dark:text-white"
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
                        className="bg-gray-900 dark:bg-emerald-600 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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