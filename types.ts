/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import type { Chat } from '@google/genai';
export type { Chat };

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  lang?: string;
  type?: 'chat';
}

export interface InteractionData {
  id?: string;
  type: string;
  value?: string;
  elementType: string;
  elementText: string;
  appContext: string | null;
}

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompt: string;
}
