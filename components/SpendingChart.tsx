import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Category, Transaction } from '../types';

interface SpendingChartProps {
  transactions: Transaction[];
  categories: Category[];
}

export const SpendingChart: React.FC<SpendingChartProps> = ({ transactions, categories }) => {
  // Aggregate expenses by category
  const data = categories.map(cat => {
    const value = transactions
      .filter(t => t.categoryId === cat.id && t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    return {
      name: cat.name,
      value,
      color: cat.color
    };
  }).filter(d => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-panda-50/50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-panda-100 dark:border-slate-800">
        <p>No expenses for this period.</p>
        <p className="text-sm opacity-75">Add a transaction to see the breakdown.</p>
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={85}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => [`${value.toFixed(2)}`, 'Spent']}
            contentStyle={{ 
              borderRadius: '16px', 
              border: 'none', 
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              color: '#1e293b',
              padding: '12px'
            }}
            itemStyle={{ color: '#6d28d9', fontWeight: 600 }}
          />
          <Legend 
            verticalAlign="bottom" 
            height={36} 
            iconType="circle"
            formatter={(value, entry: any) => <span className="text-xs font-medium text-slate-600 dark:text-slate-400 ml-1">{value}</span>} 
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};