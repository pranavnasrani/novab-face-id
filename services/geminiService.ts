

import { GoogleGenAI, FunctionDeclaration, Type, Chat, GenerateContentResponse } from '@google/genai';
import { Transaction, Card, Loan, InsightsData } from '../types';

// FIX: Added a fallback of an empty string to prevent a crash if the API key is not defined.
const API_KEY = process.env.API_KEY || '';

if (!API_KEY) {
    console.warn("API_KEY is not set in environment variables.");
}

// FIX: Updated to use the new API initialization with a named `apiKey` parameter.
export const ai = new GoogleGenAI({ apiKey: API_KEY });

export const initiatePaymentFunctionDeclaration: FunctionDeclaration = {
    name: 'initiatePayment',
    description: 'Initiates a payment from the current user to a specified recipient.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            recipientName: {
                type: Type.STRING,
                description: "The full name or first name of the person to receive the money. Use this OR recipientAccountNumber OR recipientEmail OR recipientPhone.",
            },
            recipientAccountNumber: {
                type: Type.STRING,
                description: "The 16-digit account number of the recipient. Use this OR recipientName OR recipientEmail OR recipientPhone.",
            },
            recipientEmail: {
                type: Type.STRING,
                description: "The email address of the recipient. Use this OR recipientName OR recipientAccountNumber OR recipientPhone."
            },
            recipientPhone: {
                type: Type.STRING,
                description: "The phone number of the recipient. Use this OR recipientName OR recipientAccountNumber OR recipientEmail."
            },
            amount: {
                type: Type.NUMBER,
                description: 'The amount of money to send.',
            },
        },
        required: ['amount'],
    },
};

export const getCardStatementDetailsFunctionDeclaration: FunctionDeclaration = {
    name: 'getCardStatementDetails',
    description: "Retrieves the current statement details for a user's credit card, including balance, minimum payment, and due date.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            cardLast4: { type: Type.STRING, description: "The last 4 digits of the card number to query. If not provided, defaults to the user's primary card." },
        },
        required: [],
    },
};

export const getCardTransactionsFunctionDeclaration: FunctionDeclaration = {
    name: 'getCardTransactions',
    description: 'Fetches the recent transaction history for a specified credit card.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            cardLast4: { type: Type.STRING, description: "The last 4 digits of the card number. If not provided, defaults to the primary card." },
            limit: { type: Type.NUMBER, description: "The number of recent transactions to return. Defaults to 5." },
        },
        required: [],
    },
};

export const makeAccountPaymentFunctionDeclaration: FunctionDeclaration = {
    name: 'makeAccountPayment',
    description: "Makes a payment towards a user's credit card bill or loan from their main account.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            accountId: {
                type: Type.STRING,
                description: "The last 4 digits of the card number or the full loan ID."
            },
            accountType: {
                type: Type.STRING,
                description: "The type of account to pay, either 'card' or 'loan'."
            },
            paymentType: {
                type: Type.STRING,
                description: "The type of payment to make: 'minimum' for the minimum due, 'statement' for the statement balance (cards only), 'full' for the total outstanding balance, or 'custom' for a specific amount."
            },
            amount: {
                type: Type.NUMBER,
                description: "The specific amount to pay. This is ONLY required if paymentType is 'custom'."
            },
        },
        required: ['accountId', 'accountType', 'paymentType'],
    },
};

export const requestPaymentExtensionFunctionDeclaration: FunctionDeclaration = {
    name: 'requestPaymentExtension',
    description: 'Requests a 14-day payment extension for a credit card or loan.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            accountType: { type: Type.STRING, description: "The type of account, either 'card' or 'loan'." },
            accountId: { type: Type.STRING, description: "The last 4 digits of the card number or the loan ID." },
        },
        required: ['accountType', 'accountId'],
    },
};

export const getAccountTransactionsFunctionDeclaration: FunctionDeclaration = {
    name: 'getAccountTransactions',
    description: "Fetches the recent transaction history for the user's main savings account.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            limit: { type: Type.NUMBER, description: "The number of recent transactions to return. Defaults to 5." },
        },
        required: [],
    },
};

export const getAccountBalanceFunctionDeclaration: FunctionDeclaration = {
    name: 'getAccountBalance',
    description: "Retrieves the user's current account balances, including savings, total credit card debt, and total loan debt.",
    parameters: {
        type: Type.OBJECT,
        properties: {},
        required: [],
    },
};

export const applyForCreditCardFunctionDeclaration: FunctionDeclaration = {
    name: 'applyForCreditCard',
    description: 'Processes a new credit card application for the user. All necessary personal and financial information must be collected before calling this function.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            applicationDetails: {
                type: Type.OBJECT,
                description: "Object containing all user-provided application details.",
                properties: {
                    address: { type: Type.STRING, description: "The user's full residential address." },
                    dateOfBirth: { type: Type.STRING, description: "The user's date of birth (e.g., YYYY-MM-DD)." },
                    employmentStatus: { type: Type.STRING, description: "e.g., Employed, Self-Employed, Unemployed." },
                    employer: { type: Type.STRING, description: "Name of the user's employer. Can be 'N/A'." },
                    annualIncome: { type: Type.NUMBER, description: "The user's total annual income." },
                    cardType: { type: Type.STRING, description: "The preferred card network, either 'Visa' or 'Mastercard'." },
                },
                required: ['address', 'dateOfBirth', 'employmentStatus', 'employer', 'annualIncome', 'cardType']
            }
        },
        required: ['applicationDetails'],
    },
};

export const applyForLoanFunctionDeclaration: FunctionDeclaration = {
    name: 'applyForLoan',
    description: 'Processes a new loan application for the user after collecting necessary personal and financial information.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            applicationDetails: {
                type: Type.OBJECT,
                description: "Object containing all user-provided loan application details.",
                properties: {
                    loanAmount: { type: Type.NUMBER, description: "The amount of money the user wants to borrow." },
                    loanTerm: { type: Type.NUMBER, description: "The desired loan term in months (e.g., 24, 36, 48, 60)." },
                    address: { type: Type.STRING, description: "The user's full residential address." },
                    dateOfBirth: { type: Type.STRING, description: "The user's date of birth (e.g., YYYY-MM-DD)." },
                    employmentStatus: { type: Type.STRING, description: "e.g., Employed, Self-Employed, Unemployed." },
                    annualIncome: { type: Type.NUMBER, description: "The user's total annual income." },
                },
                required: ['loanAmount', 'loanTerm', 'address', 'dateOfBirth', 'employmentStatus', 'annualIncome']
            }
        },
        required: ['applicationDetails'],
    },
};

export const getSpendingAnalysisFunctionDeclaration: FunctionDeclaration = {
    name: 'getSpendingAnalysis',
    description: 'Analyzes the user\'s spending habits over a specified period using AI. Covers both bank and card transactions.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            period: {
                type: Type.STRING,
                description: "The time period for the analysis, e.g., 'this month', 'last week', 'this year'. Defaults to 'this month'."
            },
        },
        required: [],
    },
};

export const getExistingSpendingInsightsFunctionDeclaration: FunctionDeclaration = {
    name: 'getExistingSpendingInsights',
    description: 'Retrieves pre-calculated spending insights for the user, such as spending breakdown by category, trends, and financial advice. This is the fastest way to get a general overview of recent spending. Use this tool FIRST for any questions related to spending analysis, spending habits, financial summaries, or advice.',
    parameters: {
        type: Type.OBJECT,
        properties: {},
        required: [],
    },
};

export const allFunctionDeclarations = [
    initiatePaymentFunctionDeclaration,
    getCardStatementDetailsFunctionDeclaration,
    getCardTransactionsFunctionDeclaration,
    makeAccountPaymentFunctionDeclaration,
    requestPaymentExtensionFunctionDeclaration,
    applyForCreditCardFunctionDeclaration,
    applyForLoanFunctionDeclaration,
    getSpendingAnalysisFunctionDeclaration,
    getExistingSpendingInsightsFunctionDeclaration,
    getAccountTransactionsFunctionDeclaration,
    getAccountBalanceFunctionDeclaration
];

// FIX: Extracted the system instruction logic into its own function to be reused for the voice session.
export const getSystemInstruction = (userFullName: string, language: 'en' | 'es' | 'th' | 'tl', userCards: Card[], userLoans: Loan[]): string => {
    const langNameMap = {
        en: 'English',
        es: 'Spanish',
        th: 'Thai',
        tl: 'Tagalog'
    };
    const langName = langNameMap[language];

    const contactsInstruction = `The 'initiatePayment' tool will automatically search the bank's database to find any recipient. You can identify a recipient by their full name, first name, username, 16-digit account number, email address, or phone number. Simply call the tool with whatever identifier the user provides. If the tool cannot find the user, it will return an error, and you should inform the user that the recipient was not found and ask for a more specific identifier. You do not need a pre-defined list of contacts.`;

    const activeLoans = userLoans.filter(l => l.status === 'Active');

    let loanInstructions = '';
    if (activeLoans.length === 0) {
        loanInstructions = "The user has no active loans. If they ask to pay a loan or request an extension, you must inform them they don't have one.";
    } else if (activeLoans.length === 1) {
        loanInstructions = `The user has one active loan. If they want to pay their loan or request an extension, assume it is this one and use its ID: '${activeLoans[0].id}'. You do not need to ask for the loan ID.`;
    } else {
        const loanDescriptions = activeLoans.map((l) => `a loan for $${l.loanAmount} (ID: '${l.id}')`).join('; ');
        loanInstructions = `The user has multiple active loans: ${loanDescriptions}. If the user asks to pay a loan or request an extension, you MUST ask for clarification (e.g., "Which loan would you like to pay? The one for $${activeLoans[0].loanAmount} or..."). Once they specify, you must use the corresponding loan ID for the 'accountId'. Do NOT ask the user for the loan ID directly.`;
    }

    const cardDescriptions = userCards.length > 0 ? `The user has the following card(s): ${userCards.map(c => `${c.cardType} ending in ${c.cardNumber.slice(-4)}`).join(', ')}.` : "The user has no credit cards.";


    const systemInstruction = `You are a world-class banking assistant named Nova for a user named ${userFullName}.
Your capabilities include initiating payments, providing card information, analyzing spending, processing applications, and handling payment extensions.

1.  **Payments**:
    - If the user asks to "send", "pay", "transfer", or similar, you MUST use the 'initiatePayment' tool.
    - You must have a recipient and an amount. The recipient can be identified by their name, 16-digit account number, email address, or phone number. Prioritize using the account number if provided.
    - ${contactsInstruction}

2.  **Spending Analysis**:
    - For any questions about spending habits, breakdowns, trends, subscriptions, or financial advice (e.g., "how much did I spend", "show my expenses", "any advice for me?"), you MUST FIRST use the 'getExistingSpendingInsights' tool. This tool is very fast as it retrieves a pre-computed analysis in the user's current language (${langName}).
    - If 'getExistingSpendingInsights' returns a message that no insights are available, you should THEN use the 'getSpendingAnalysis' tool. Inform the user that since this is the first time, it will generate insights in all supported languages and might take a moment.
    - Only use 'getSpendingAnalysis' directly if the user asks for a very specific time period that the general insights tool wouldn't cover (e.g., "what did I spend on Amazon in the last 3 days?").

3.  **Card & Account Information**:
    - If the user asks for their "balance," "how much money do I have," or similar, you MUST use the 'getAccountBalance' tool. This provides a full financial overview (savings, card debt, loans).
    - If the user asks about their credit card "bill," "statement," "due date," or "minimum payment," you MUST use the 'getCardStatementDetails' tool.
    - To get recent transactions for a credit card, use 'getCardTransactions'. To get transactions for the main savings account, use 'getAccountTransactions'. If the user just asks for "recent transactions" without specifying, use 'getAccountTransactions'.
    - ${cardDescriptions} If a card is not specified for a card-related query, assume they mean their primary (first) card if they have one.

4.  **Bill & Loan Payments**:
    - If the user wants to "pay my bill," "make a payment," or similar for a card or loan, you MUST use the 'makeAccountPayment' tool.
    - You must clarify the payment amount (e.g., minimum, statement, full, or custom).
    - For card payments, you must provide the last 4 digits of the card number as the \`accountId\`.
    - ${loanInstructions}

5.  **Payment Extensions**:
    - If the user says they "can't pay," "need more time," or asks for an "extension" on a bill or loan, you MUST use the 'requestPaymentExtension' tool.
    - For card extensions, you must provide the last 4 digits of the card number as the \`accountId\`.
    - For loan extensions, follow the same logic as for loan payments above to determine the correct account ID.

6.  **Credit Card Application**:
    - If the user expresses intent to "apply for a credit card," you MUST use the 'applyForCreditCard' tool.
    - Before calling the tool, you MUST collect all required information: address, date of birth, employment status, employer, annual income, and preferred card type (Visa or Mastercard). You already know the user's name is ${userFullName}, so do not ask for it.
    - Ask for any missing information conversationally.

7.  **Loan Application**:
    - If the user wants to "apply for a loan," you MUST use the 'applyForLoan' tool.
    - Before calling the tool, collect the desired loan amount, the loan term in months, and the other personal/financial details: address, date of birth, employment status, and annual income. You already know the user's name is ${userFullName}, so do not ask for it.
    - Ask for missing information conversationally.

8.  **General Conversation**:
    - For any other queries, provide polite, very concise, and helpful responses. Be concise and to the point.
    - Always maintain a friendly and professional tone.
    - VERY IMPORTANT: You MUST respond exclusively in ${langName}. Do not switch languages.`;

    return systemInstruction;
};


export const createChatSession = (userFullName: string, language: 'en' | 'es' | 'th' | 'tl', userCards: Card[], userLoans: Loan[]): Chat => {
    // FIX: Replaced the deprecated model `gemini-1.5-flash` with the recommended `gemini-2.5-flash`.
    const systemInstruction = getSystemInstruction(userFullName, language, userCards, userLoans);
    
    // FIX: Updated to use the new `ai.chats.create` API with the recommended `gemini-2.5-flash` model and the correct configuration structure.
    return ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemInstruction,
        tools: [{ functionDeclarations: allFunctionDeclarations }],
      }
    });
};


export const extractPaymentDetailsFromImage = async (base64Image: string, mimeType: string): Promise<{ recipientName: string, amount: number, recipientAccountNumber: string }> => {
    const prompt = `Analyze the provided image, which could be a photo of a handwritten note or a document. Extract the following three pieces of information for a financial transaction:
1. The recipient's full name (recipientName).
2. The monetary amount (amount).
3. The recipient's account number (recipientAccountNumber), which should be a string of digits.

Return the information as a JSON object. If any piece of information is unclear or missing, return an empty string for that field.`;

    const imagePart = {
        inlineData: {
            mimeType: mimeType,
            data: base64Image,
        },
    };

    const textPart = {
        text: prompt
    };
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            recipientName: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            recipientAccountNumber: { type: Type.STRING },
        },
        required: ["recipientName", "amount", "recipientAccountNumber"],
    };

    try {
        // FIX: Replaced the deprecated API with the new `ai.models.generateContent` call, using the `gemini-2.5-flash` model and a structured JSON response schema.
        const response: GenerateContentResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [imagePart, textPart] },
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
          },
        });
        
        // FIX: Updated response handling to use the `.text` property instead of the deprecated `.text()` method.
        const jsonString = response.text.trim();
        return JSON.parse(jsonString);

    } catch (error) {
        console.error("Error extracting details from image:", error);
        throw new Error("Failed to parse payment details from the image.");
    }
};

const singleLanguageInsightsSchema = {
    type: Type.OBJECT,
    properties: {
        spendingBreakdown: {
            type: Type.ARRAY,
            description: 'Categorical breakdown of spending in the last 30 days.',
            items: {
                type: Type.OBJECT,
                properties: { name: { type: Type.STRING }, value: { type: Type.NUMBER } },
                required: ['name', 'value']
            }
        },
        overallSpendingChange: { type: Type.NUMBER, description: 'Overall percentage change in spending compared to the previous 30 days.' },
        topCategoryChanges: {
            type: Type.ARRAY,
            description: 'Top 2 categories with the largest spending change.',
            items: {
                type: Type.OBJECT,
                properties: { category: { type: Type.STRING }, changePercent: { type: Type.NUMBER } },
                required: ['category', 'changePercent']
            }
        },
        subscriptions: {
            type: Type.ARRAY,
            description: 'Identified recurring monthly subscriptions.',
            items: {
                type: Type.OBJECT,
                properties: { name: { type: Type.STRING }, amount: { type: Type.NUMBER } },
                required: ['name', 'amount']
            }
        },
        cashFlowForecast: { type: Type.STRING, description: 'A brief, one-sentence forecast of the user\'s cash flow for the next 30 days.' },
        savingOpportunities: {
            type: Type.ARRAY,
            description: 'Two actionable saving tips.',
            items: {
                type: Type.OBJECT,
                properties: { suggestion: { type: Type.STRING }, potentialSavings: { type: Type.NUMBER } },
                required: ['suggestion', 'potentialSavings']
            }
        },
    },
    required: ['spendingBreakdown', 'overallSpendingChange', 'topCategoryChanges', 'subscriptions', 'cashFlowForecast', 'savingOpportunities']
};

const insightsResponseSchema = {
    type: Type.OBJECT,
    properties: {
        en: singleLanguageInsightsSchema,
        es: singleLanguageInsightsSchema,
        th: singleLanguageInsightsSchema,
        tl: singleLanguageInsightsSchema,
    },
    required: ['en', 'es', 'th', 'tl'],
};

export const getComprehensiveInsights = async (transactions: Transaction[]): Promise<Record<string, InsightsData> | null> => {
    // Ensure there are enough transactions to analyze
    if (transactions.filter(tx => tx.type === 'debit').length < 3) {
        return null;
    }

    const transactionList = transactions
        .map(tx => `${tx.type === 'credit' ? 'IN' : 'OUT'}: $${tx.amount.toFixed(2)} for "${tx.description}" on ${new Date(tx.timestamp).toLocaleDateString()}`)
        .join('\n');

    const prompt = `You are an expert financial analyst named Nova. Today is ${new Date().toLocaleDateString()}. 'This month' means the last 30 days from today. 'Last month' means the 30 days prior to that. All monetary values must be numbers.

Here are the user's transactions for the last 60 days:
${transactionList}

Provide a complete financial analysis in a single JSON object matching the provided schema. The object must contain four top-level keys: "en", "es", "th", and "tl". 
For each language key, provide the full analysis. All text within a language key's object (like category names, suggestions, forecasts) MUST be in that specific language (en for English, es for Spanish, th for Thai, tl for Tagalog).

For each language, the analysis must include:
1.  **spendingBreakdown**: Group all 'OUT' (debit) transactions from 'this month' into meaningful categories. Sum the total for each category.
2.  **spendingTrend**: Compare total spending for 'this month' vs 'last month'. Calculate the overall percentage change. Find the top 2 categories with the biggest percentage change (positive or negative).
3.  **subscriptions**: Identify recurring monthly subscriptions from all transactions.
4.  **financialAdvice**: Analyze all transactions. Identify likely income from large, recurring 'IN' (credit) transactions. Based on income and spending, provide a brief, one-sentence cash flow forecast for the next 30 days. Also, provide two actionable saving opportunity suggestions with estimated monthly savings.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: insightsResponseSchema
            }
        });

        const jsonString = response.text.trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error getting comprehensive insights:", error);
        return null;
    }
};


export const extractPassportDetails = async (base64Image: string, mimeType: string) => {
    const prompt = `Analyze this image of a passport. Extract the following details: full name, passport number, date of birth, expiry date, and nationality. Return the information as a JSON object. If any field is not visible, return an empty string for it.`;

    const imagePart = {
        inlineData: {
            mimeType: mimeType,
            data: base64Image,
        },
    };

    const textPart = { text: prompt };

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            fullName: { type: Type.STRING },
            passportNumber: { type: Type.STRING },
            dateOfBirth: { type: Type.STRING },
            expiryDate: { type: Type.STRING },
            nationality: { type: Type.STRING },
        },
        required: ["fullName", "passportNumber", "dateOfBirth", "expiryDate", "nationality"],
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const jsonString = response.text.trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error extracting passport details:", error);
        throw new Error("Failed to parse passport details from the image.");
    }
};

export const performLivenessCheck = async (base64Frames: string[]) => {
    const prompt = `Analyze these sequential image frames from a short video. The user was asked to turn their head to prove they are a live person. Determine if the images show a real person performing this action. The person must be clearly visible and show movement consistent with turning their head. A static image, a photo of a photo, or no clear human face should fail the check. Respond with a JSON object containing a boolean 'isLive' and a 'reason' string.`;

    const imageParts = base64Frames.map(frame => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: frame,
        },
    }));

    const textPart = { text: prompt };

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            isLive: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
        },
        required: ["isLive", "reason"],
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [...imageParts, textPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
        const jsonString = response.text.trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error performing liveness check:", error);
        throw new Error("Failed to perform liveness check.");
    }
};