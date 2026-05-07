import { Router } from 'express';
import openai from './assistant.js';

const chatRouter = Router();

/**
 * Utility: Limit conversation history
 */
function limitHistory(history = [], maxTurns = 10) {
  return history.slice(-maxTurns);
}

/**
 * Utility: Prepare inventory summary
 */
function buildInventoryContext(inventoryData) {
  const medicines = inventoryData?.medicines || [];
  const dispenseLogs = inventoryData?.dispenseLogs || [];

  const today = new Date();

  const lowStock = medicines.filter((med) => med.qty < med.minStock);

  const expiringSoon = medicines.filter((med) => {
    if (!med.expiry) return false;

    const expiry = new Date(med.expiry);
    const diffDays = (expiry - today) / (1000 * 60 * 60 * 24);

    return diffDays <= 30;
  });

  const totalValue = medicines.reduce((sum, med) => {
    return sum + med.qty * (med.price || 0);
  }, 0);

  return `
MEDICAL INVENTORY SUMMARY

Total medicines: ${medicines.length}
Low stock medicines: ${lowStock.length}
Medicines expiring within 30 days: ${expiringSoon.length}
Total inventory value: ₱${totalValue.toLocaleString()}

LOW STOCK ITEMS:
${JSON.stringify(lowStock, null, 2)}

EXPIRING SOON:
${JSON.stringify(expiringSoon, null, 2)}

RECENT DISPENSE LOGS:
${JSON.stringify(dispenseLogs.slice(-10), null, 2)}

Today's date:
${today.toISOString().slice(0, 10)}

Health center type:
Philippine Public Health Center / RHU
  `;
}

chatRouter.post('/chat', async (req, res) => {
  try {
    console.log('chatRouter is running');
    const { message, history = [], inventoryData = {} } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Message is required.',
      });
    }

    /**
     * Build AI Context
     */
    const inventoryContext = buildInventoryContext(inventoryData);

    /**
     * System Prompt
     */
    const systemPrompt = `
You are MediSys AI,
an expert medical inventory advisor
for Philippine public health centers.

You specialize in:
- medicine inventory analysis
- shortage prevention
- procurement planning
- expiry risk management
- emergency preparedness
- medicine distribution optimization

You understand:
- DOH
- RHU
- Barangay Health Centers
- UHC systems
- resource-limited healthcare settings

Rules:
- Be concise
- Be actionable
- Use bullet points
- Prioritize patient safety
- Give practical recommendations
- Structure responses clearly
`;

    /**
     * Limit chat history
     */
    const limitedHistory = limitHistory(history);

    /**
     * OpenAI messages
     */
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },

      {
        role: 'system',
        content: inventoryContext,
      },

      ...limitedHistory.map((turn) => ({
        role: turn.role === 'bot' ? 'assistant' : 'user',

        content: turn.text,
      })),

      {
        role: 'user',
        content: message,
      },
    ];

    /**
     * OpenAI Request
     */
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',

      messages,

      max_tokens: 1200,

      temperature: 0.4,
    });

    const reply = response.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({
        error: 'No response from AI.',
      });
    }

    return res.json({
      reply,
    });
  } catch (err) {
    console.error('[AI CHAT ERROR]', err);

    if (err?.status && err?.error) {
      return res.status(err.status).json({
        error: err.error.message,
      });
    }

    return res.status(500).json({
      error: 'AI assistant failed. Please try again.',
    });
  }
});

export default chatRouter;
