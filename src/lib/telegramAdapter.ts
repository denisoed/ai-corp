import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { Agent, TaskRisk, TaskPriority } from '../types';

// Use the API key securely injected by Vite config in AI Studio preview
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const TELEGRAM_API = 'https://api.telegram.org/bot';

// Define tools that Gemini can use to interact with our Antigravity Company
const companyTools: FunctionDeclaration[] = [
  {
    name: 'create_agent',
    description: 'Hire/Onboard a new AI agent into the company.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Name of the agent' },
        model: { type: Type.STRING, description: 'Model to use (e.g. Gemini 3.1 Pro)' },
        role: { type: Type.STRING, description: 'Role (Must be one of: Manager, Developer, Analyst, Reviewer, Designer, DevOps, Research)' },
        description: { type: Type.STRING, description: 'Description of responsibilities' },
        skills: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of skills' },
        managerName: { type: Type.STRING, description: 'Optional. The name of the manager agent they report to.' }
      },
      required: ['name', 'model', 'role', 'description', 'skills']
    }
  },
  {
    name: 'create_task',
    description: 'Create a new task on the Kanban board.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        priority: { type: Type.STRING, description: 'Must be: Low, Medium, High, or Urgent' },
        risk: { type: Type.STRING, description: 'Must be: low, medium, high, or critical' },
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Tag names' },
        assigneeName: { type: Type.STRING, description: 'Optional. Name of the agent to assign this task to.' }
      },
      required: ['title', 'description', 'priority', 'risk']
    }
  },
  {
    name: 'get_company_state',
    description: 'Get a summary of the current agents and tasks in the company to help answer user questions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        focus: { type: Type.STRING, description: '"agents" or "tasks" or "all"' }
      },
      required: ['focus']
    }
  }
];

export function useTelegramManager() {
  const agents = useStore(state => state.agents);
  const updateAgent = useStore(state => state.updateAgent);
  const addLog = useStore(state => state.addLog);
  const addAgent = useStore(state => state.addAgent);
  const addTask = useStore(state => state.addTask);
  
  // Track running bots
  const runningBots = useRef<{ [agentId: string]: { token: string, offset: number, isActive: boolean, abortController: AbortController } }>({});

  useEffect(() => {
    // Check which agents have a token and need to be started
    agents.forEach(agent => {
      const config = agent.telegramConfig;
      if (config && config.botToken) {
        if (!runningBots.current[agent.id]) {
          // Start bot
          startBot(agent, config.botToken);
        } else if (runningBots.current[agent.id].token !== config.botToken) {
          // Token changed, restart
          stopBot(agent.id);
          startBot(agent, config.botToken);
        }
      } else {
        // No token, stop if running
        if (runningBots.current[agent.id]) {
          stopBot(agent.id);
        }
      }
    });
    
    // Stop bots for deleted agents
    const currentAgentIds = new Set(agents.map(a => a.id));
    Object.keys(runningBots.current).forEach(botAgentId => {
       if (!currentAgentIds.has(botAgentId)) {
          stopBot(botAgentId);
       }
    });

  }, [agents]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.keys(runningBots.current).forEach(botAgentId => {
        stopBot(botAgentId);
      });
    };
  }, []);

  const stopBot = (agentId: string) => {
    if (runningBots.current[agentId]) {
      runningBots.current[agentId].isActive = false;
      runningBots.current[agentId].abortController.abort();
      delete runningBots.current[agentId];
    }
  };

  const startBot = (agent: Agent, token: string) => {
    runningBots.current[agent.id] = {
      token,
      offset: 0,
      isActive: true,
      abortController: new AbortController()
    };
    
    updateAgent(agent.id, { telegramConfig: { ...agent.telegramConfig, botToken: token, status: 'running', lastError: undefined } });

    // Start polling loop asynchronously
    pollTelegram(agent.id, token);
  };

  const pollTelegram = async (agentId: string, token: string) => {
    const bot = runningBots.current[agentId];
    if (!bot || !bot.isActive) return;

    try {
      const res = await fetch(`${TELEGRAM_API}${token}/getUpdates?offset=${bot.offset}&timeout=5`, {
        signal: bot.abortController.signal
      });

      if (!res.ok) {
        throw new Error(`Telegram API Error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          bot.offset = Math.max(bot.offset, update.update_id + 1);
          
          if (update.message && update.message.text) {
             handleIncomingMessage(agentId, token, update.message);
          }
        }
      }
      
      // Successfully connected
      const currentAgentConfig = useStore.getState().agents.find(a => a.id === agentId)?.telegramConfig;
      if (currentAgentConfig && currentAgentConfig.status !== 'running') {
         updateAgent(agentId, { telegramConfig: { ...currentAgentConfig, status: 'running', lastError: undefined } });
      }

    } catch (err: any) {
      if (err.name !== 'AbortError') {
         console.error(`Telegram Polling Error for agent ${agentId}:`, err);
         const currentAgentConfig = useStore.getState().agents.find(a => a.id === agentId)?.telegramConfig;
         if (currentAgentConfig) {
            updateAgent(agentId, { telegramConfig: { ...currentAgentConfig, status: 'error', lastError: err.message } });
         }
         // Wait a bit before retrying on error
         await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Continue polling if still active
    if (bot.isActive) {
      setTimeout(() => pollTelegram(agentId, token), 1000); // 1 second delay between polls
    }
  };

  const handleIncomingMessage = async (agentId: string, token: string, message: any) => {
     const chatId = message.chat.id;
     const text = message.text;
     
     const agentInfo = useStore.getState().agents.find(a => a.id === agentId);
     if (!agentInfo) return;

     addLog({
        agentId: 'system',
        action: 'Telegram Message Received',
        details: `${agentInfo.name} received a message: "${text}"`,
        type: 'info'
     });

     if (agentInfo.telegramConfig && agentInfo.telegramConfig.lastChatId !== chatId) {
        useStore.getState().updateAgent(agentId, {
            telegramConfig: {
               ...agentInfo.telegramConfig,
               lastChatId: chatId
            }
        });
     }

     try {
       // Send typing indicator
       await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ chat_id: chatId, action: 'typing' })
       });

       // Now use Gemini to process the text
       const chatSession = ai.chats.create({
          model: 'gemini-3-flash-preview', // Using flash for speed in conversation
          config: {
             systemInstruction: `You are ${agentInfo.name}, an AI Agent in a company. Your role is ${agentInfo.role}. 
Description: ${agentInfo.description}
Skills: ${agentInfo.skills.join(', ')}

You are communicating with the user/boss via Telegram. 
Help them manage the company, answer questions, or use your tools to perform actions like creating tasks or hiring new agents.
Be concise, professional, and act in-character!`,
             tools: [{ functionDeclarations: companyTools }]
          }
       });

       const response = await chatSession.sendMessage(text);
       
       let replyText = response.text || '';

       // Handle function calls if Gemini decided to use a tool
       if (response.functionCalls && response.functionCalls.length > 0) {
          for (const call of response.functionCalls) {
             const result = await executeTool(call.name, call.args, agentId);
             
             // Send tool result back to Gemini so it can answer the user
             const followUpResponse = await chatSession.sendMessage({
                message: [{
                   functionResponse: {
                      name: call.name,
                      response: result
                   }
                }]
             });
             
             if (followUpResponse.text) {
                replyText += '\n\n' + followUpResponse.text;
             }
          }
       }

       let finalReply = replyText.trim();
       if (!finalReply) {
          finalReply = 'Task executed successfully.';
       }

       // Send final reply back to Telegram
       const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ chat_id: chatId, text: finalReply })
       });
       
       if (!res.ok) {
           const errData = await res.json();
           throw new Error(`Telegram Send Error: ${errData.description}`);
       }

     } catch (err: any) {
        console.error('Error processing telegram message with Gemini:', err);
        await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ chat_id: chatId, text: `Sorry, I encountered an internal cognitive error: ${err.message}` })
       });
     }
  };

  const executeTool = async (name: string, args: any, executingAgentId: string): Promise<any> => {
     const state = useStore.getState();
     
     if (name === 'create_agent') {
        let parentId = undefined;
        if (args.managerName) {
           const parent = state.agents.find(a => a.name.toLowerCase().includes(args.managerName.toLowerCase()));
           if (parent) parentId = parent.id;
        }

        state.addAgent({
           name: args.name,
           model: args.model,
           role: args.role as any,
           description: args.description,
           skills: args.skills,
           parentId,
           status: 'Idle'
        });

        state.addLog({
           agentId: executingAgentId,
           action: 'Hired Agent via Telegram',
           details: `Hired ${args.name} (${args.role}).`,
           type: 'success'
        });

        return { success: true, message: `Agent ${args.name} created successfully.` };
     }
     
     if (name === 'create_task') {
        let assigneeId = undefined;
        if (args.assigneeName) {
           const assignee = state.agents.find(a => a.name.toLowerCase().includes(args.assigneeName.toLowerCase()));
           if (assignee) assigneeId = assignee.id;
        }

        state.addTask({
           title: args.title,
           description: args.description,
           status: 'Backlog',
           priority: args.priority as TaskPriority,
           risk: args.risk as TaskRisk,
           tags: args.tags || [],
           assigneeId,
           creatorId: 'user'
        });

        state.addLog({
           agentId: executingAgentId,
           action: 'Created Task via Telegram',
           details: `Added task "${args.title}" to board.`,
           type: 'success'
        });

        return { success: true, message: `Task "${args.title}" created successfully.` };
     }

     if (name === 'get_company_state') {
        if (args.focus === 'agents') {
           return { agents: state.agents.map(a => ({ name: a.name, role: a.role, status: a.status })) };
        }
        if (args.focus === 'tasks') {
           return { tasks: state.tasks.map(t => ({ title: t.title, status: t.status, assignee: state.agents.find(a=>a.id === t.assigneeId)?.name || 'unassigned' })) };
        }
        return { 
           agentsCount: state.agents.length, 
           tasksCount: state.tasks.length,
           activeTasks: state.tasks.filter(t => t.status === 'In Progress').length
        };
     }

     return { success: false, error: 'Unknown tool' };
  };
}
