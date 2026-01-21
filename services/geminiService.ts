import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, Category, RecurrenceFrequency } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const getFinancialAdvice = async (
  income: number,
  transactions: Transaction[],
  categories: Category[],
  currency: string = '$'
): Promise<string> => {
  if (!ai) {
    return "Please configure your API Key to receive AI-powered financial advice.";
  }

  // Calculate totals for context
  const totalExpenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const categoryBreakdown = categories.map(cat => {
    const sum = transactions
      .filter(t => t.categoryId === cat.id)
      .reduce((s, t) => s + t.amount, 0);
    return `${cat.name}: ${currency}${sum}`;
  }).join(', ');

  const prompt = `
    You are a friendly, encouraging financial buddy (a cute panda character) for a budgeting app called Vyaya.
    
    Here is the user's current month snapshot:
    - Monthly Income Goal: ${currency}${income}
    - Total Expenses So Far: ${currency}${totalExpenses}
    - Remaining Budget: ${currency}${income - totalExpenses}
    - Category Breakdown: ${categoryBreakdown}

    Provide a short, 2-3 sentence insight or tip. 
    If they are over budget, be gentle but firm. 
    If they are doing well, congratulate them.
    Keep the tone casual, fun, and accessible to anyone from age 10 to 80.
    Occasionally use a panda-related pun if appropriate, but keep it subtle.
    Do not use complex financial jargon.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Keep tracking your spending to stay on top of your goals!";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm having trouble connecting to the bamboo forest right now. Check back later!";
  }
};

export const suggestCategoryFromText = async (description: string, categories: Category[]): Promise<string | null> => {
    if (!ai) return null;

    const catList = categories.map(c => c.name).join(', ');
    const prompt = `
      I have a list of budget categories: [${catList}].
      I spent money on: "${description}".
      Which category name from the list best fits this expense? 
      Return ONLY the exact category name. If none fit perfectly, return "Miscellaneous".
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        const suggestedName = response.text?.trim();
        return suggestedName || null;
    } catch (e) {
        return null;
    }
}

export const parseTransactionFromText = async (
  text: string, 
  categories: Category[], 
  currency: string
): Promise<{
  amount: number;
  description: string;
  categoryId: string | null;
  newCategoryName: string | null;
  type: 'expense' | 'income';
  isRecurring: boolean;
  recurrence: RecurrenceFrequency;
} | null> => {
  if (!ai) return null;

  const categoryNames = categories.map(c => c.name).join(', ');
  
  const prompt = `
    Analyze this spoken transaction text: "${text}".
    Currency context: ${currency}.
    Available Categories: ${categoryNames}.
    
    Your goal is to extract transaction details, determine the category, and detect if it is a recurring payment.
    
    Logic for Category:
    1. If the input matches the *intent* of an existing category (e.g. "housing" matches "Rent", "latte" matches "Coffee"), use the Exact Existing Category Name.
    2. If the input does NOT fit any existing category well, or the user explicitly names a new one (e.g. "Spent 500 on Miscellaneous"), suggest a NEW short category name (e.g. "Miscellaneous").
    
    Logic for Recurrence:
    - Look for keywords like "every month", "monthly", "weekly", "yearly", "recurring", "subscription".
    - If found, set isRecurring to true and set the frequency (daily, weekly, monthly, yearly). Default to 'monthly' if vague.
    
    Extract:
    - Amount (number).
    - Description (short string summary).
    - Category Name (Existing or New).
    - Type ("expense" or "income").
    - Recurrence info.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            description: { type: Type.STRING },
            categoryName: { type: Type.STRING, description: "The determined category name" },
            type: { 
              type: Type.STRING,
              description: "Must be exactly 'expense' or 'income'" 
            },
            isRecurring: { type: Type.BOOLEAN },
            recurrence: { 
                type: Type.STRING, 
                description: "one of: daily, weekly, monthly, yearly. defaults to monthly if unsure." 
            }
          }
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    
    // Check if the returned name matches an existing category
    const category = categories.find(c => 
      c.name.toLowerCase() === (result.categoryName || '').toLowerCase()
    );

    const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
    const recurrenceFreq = validFrequencies.includes(result.recurrence) ? result.recurrence : 'monthly';
    
    return {
      amount: result.amount || 0,
      description: result.description || text,
      categoryId: category ? category.id : null,
      newCategoryName: category ? null : (result.categoryName || null),
      type: result.type === 'income' ? 'income' : 'expense',
      isRecurring: !!result.isRecurring,
      recurrence: recurrenceFreq as RecurrenceFrequency
    };
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return null;
  }
};