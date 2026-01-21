import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, Category } from '../types';

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
  type: 'expense' | 'income';
} | null> => {
  if (!ai) return null;

  const categoryNames = categories.map(c => c.name).join(', ');
  
  const prompt = `
    Analyze this spoken transaction text: "${text}".
    Currency context: ${currency}.
    Available Categories: ${categoryNames}.
    
    Extract the following details:
    - Amount (number).
    - Description (short string summary).
    - Category Name (Must match one of the Available Categories closely, or "Miscellaneous" if undefined).
    - Type ("expense" or "income").
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
            categoryName: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["expense", "income"] }
          }
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    
    // Find category ID from name
    const category = categories.find(c => 
      c.name.toLowerCase() === (result.categoryName || '').toLowerCase()
    );
    
    return {
      amount: result.amount || 0,
      description: result.description || text,
      categoryId: category ? category.id : null,
      type: result.type === 'income' ? 'income' : 'expense'
    };
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return null;
  }
};