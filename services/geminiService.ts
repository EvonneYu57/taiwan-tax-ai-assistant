/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import { GoogleGenAI, Chat } from '@google/genai';
import { SYSTEM_INSTRUCTION } from '../constants';

if (!process.env.API_KEY) {
  throw new Error('API_KEY environment variable is not set.');
}

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

export function createTaxChatSession(): Chat {
  const model = 'gemini-2.5-flash';
  const chat = ai.chats.create({
    model: model,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }],
    },
  });
  return chat;
}

export function parseResponse(text: string): { cleanedText: string; lang: string | null; action: string | null } {
  let cleanedText = text;
  let lang: string | null = null;
  let action: string | null = null;

  const actionMatch = cleanedText.match(/\[action:\s*([\w-]+)\]\s*$/);
  if(actionMatch) {
    action = actionMatch[1];
    cleanedText = cleanedText.replace(/\[action:\s*([\w-]+)\]\s*$/, '').trim();
  }

  const langMatch = cleanedText.match(/\[lang:\s*([\w-]+)\]\s*$/);
  if(langMatch) {
    lang = langMatch[1];
    cleanedText = cleanedText.replace(/\[lang:\s*([\w-]+)\]\s*$/, '').trim();
  }
  
  return { cleanedText, lang, action };
}