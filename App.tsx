/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createTaxChatSession, parseResponse } from './services/geminiService';
import { SUPPORTED_LANGUAGES } from './constants';
import type { Chat, Message } from './types';

// SpeechRecognition might not be on the window object type
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const welcomeMessages = [
  { text: '歡迎！我是您的臺灣稅務 AI 助理。我可以回答關於國稅與地方稅的問題，請問有什麼可以協助您？', lang: 'cmn-Hant-TW' },
  { text: 'Welcome! I am your Taiwan Tax AI Assistant. I can answer questions about national and local taxes. How can I help you?', lang: 'en-US' },
  { text: 'ようこそ！私はあなたの台湾税務AIアシスタントです。国税や地方税に関する質問にお答えできます。何かお手伝いできることはありますか？', lang: 'ja-JP' },
  { text: '환영합니다! 저는 당신의 대만 세무 AI 어시스턴트입니다. 국세 및 지방세에 관한 질문에 답변해 드릴 수 있습니다. 무엇을 도와드릴까요?', lang: 'ko-KR' },
];

const preprocessTextForSpeech = (text: string): string => {
  let processedText = text;
  // Remove asterisks used for markdown-style bolding/italics to prevent them from being read aloud.
  processedText = processedText.replace(/[\*]/g, '');
  // Replace "10萬" with "十萬" for more natural speech synthesis in Chinese.
  processedText = processedText.replace(/10萬/g, '十萬');
  return processedText;
};

const WelcomeScreen: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div
    className="welcome-screen"
    onClick={onStart}
    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onStart()}
    role="button"
    aria-label="Welcome to the Taiwan Tax AI Assistant. Click anywhere or press Enter to start."
    tabIndex={0}
  >
    <div className="welcome-content">
      <div className="lang-block">
        <h1 className="lang-title">歡迎使用臺灣稅務 AI 助理</h1>
        <p className="lang-subtitle">請點擊螢幕任何地方以啟動語音服務</p>
      </div>
      <div className="lang-block">
        <h2 className="lang-title">Welcome to the Taiwan Tax AI Assistant</h2>
        <p className="lang-subtitle">Please click anywhere on the screen to activate the voice service</p>
      </div>
      <div className="lang-block">
        <h2 className="lang-title">台湾税務AIアシスタントへようこそ</h2>
        <p className="lang-subtitle">画面の任意の場所をクリックして、音声サービスを有効にしてください</p>
      </div>
      <div className="lang-block">
        <h2 className="lang-title">대만 세무 AI 어시스턴트 사용을 환영합니다</h2>
        <p className="lang-subtitle">음성 서비스를 활성화하려면 화면 아무 곳이나 클릭하십시오</p>
      </div>
    </div>
  </div>
);

const SystemWelcomeMessage: React.FC = () => (
  <div className="message message-system">
    <div className="welcome-message-block">
      {welcomeMessages.map(({ text }, index) => (
        <p key={index} className="welcome-message-text">{text}</p>
      ))}
    </div>
  </div>
);

const App: React.FC = () => {
  const [view, setView] = useState<'welcome' | 'chat'>('welcome');
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [currentLang, setCurrentLang] = useState<string>('cmn-Hant-TW');

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const welcomeSpeechHasRun = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, isLoading]);
  
  const speak = useCallback((text: string, lang: string) => {
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const textForSpeech = preprocessTextForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(textForSpeech);
    utterance.lang = lang;

    const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(lang.split('-')[0]));
    const femaleVoice = voices.find(v => v.name.toLowerCase().includes('female'));
    utterance.voice = femaleVoice || voices[0];
    
    utterance.onerror = (event) => {
      console.error('SpeechSynthesisUtterance.onerror', event);
      setError(`Speech synthesis error: ${event.error}`);
    };
    
    window.speechSynthesis.speak(utterance);
  }, []);

  const initChat = useCallback(() => {
    try {
      const chatSession = createTaxChatSession();
      setChat(chatSession);
    } catch (e: any) {
      console.error("Failed to initialize chat:", e);
      setError(e.message || "Could not start chat session. Check API Key.");
    }
  }, []);

  const handleSendMessage = useCallback(async (text: string) => {
    if (isLoading || !text.trim() || !chat) return;

    const userMessage: Message = { id: Date.now().toString(), sender: 'user', text, type: 'chat' };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const langInfo = SUPPORTED_LANGUAGES[currentLang];
      const langName = langInfo ? langInfo.name : 'the user\'s language';
      const prompt = `(The user wants the response in ${langName}.)\n\n${text}`;
      
      let accumulatedResponse = '';
      const stream = await chat.sendMessageStream({ message: prompt });
      
      const aiMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: aiMessageId, sender: 'ai', text: '', type: 'chat' }]);

      for await (const chunk of stream) {
        if (chunk.text) {
          accumulatedResponse += chunk.text;
          setMessages(prev => prev.map(m => m.id === aiMessageId ? {...m, text: accumulatedResponse } : m));
        }
      }

      const { cleanedText, lang, action } = parseResponse(accumulatedResponse);
      setMessages(prev => prev.map(m => m.id === aiMessageId ? {...m, text: cleanedText, lang: lang || undefined } : m));
      
      if(lang && cleanedText) {
        speak(cleanedText, lang);
      }
      
      if (action === 'end_conversation') {
        if (isListening) {
          recognitionRef.current?.stop();
        }
      }

    } catch (e: any) {
      console.error(e);
      const errorMessage = "抱歉，我遇到了一些問題，請再試一次。";
      setError(errorMessage);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: 'ai', text: errorMessage, type: 'chat' }]);
    } finally {
      setIsLoading(false);
    }
  }, [chat, isLoading, speak, isListening, currentLang]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setInputValue('');
      recognitionRef.current?.start();
    }
  }, [isListening]);
  
  const speakWelcomeSequence = useCallback((onComplete: () => void) => {
    if (!('speechSynthesis' in window) || welcomeMessages.length === 0) {
      onComplete();
      return;
    }
    window.speechSynthesis.cancel();
  
    let currentMessageIndex = 0;
  
    const speakNext = () => {
      if (currentMessageIndex >= welcomeMessages.length) {
        onComplete();
        return;
      }
  
      const { text, lang } = welcomeMessages[currentMessageIndex];
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(lang.split('-')[0]));
      const femaleVoice = voices.find(v => v.name.toLowerCase().includes('female'));
      utterance.voice = femaleVoice || voices[0];
      
      utterance.onend = () => {
        currentMessageIndex++;
        speakNext();
      };
  
      utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        currentMessageIndex++;
        speakNext();
      };
  
      window.speechSynthesis.speak(utterance);
    };
  
    speakNext();
  }, []);
  
  useEffect(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      console.warn("Speech Recognition not supported by this browser.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = currentLang;

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setInputValue(interimTranscript);
      if (finalTranscript) {
          setInputValue(finalTranscript);
          handleSendMessage(finalTranscript);
      }
    };

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    }

    recognitionRef.current = recognition;
  }, [handleSendMessage, currentLang]);

  const resetChat = useCallback(() => {
      window.speechSynthesis.cancel();
      if(isListening) recognitionRef.current?.stop();
      
      setMessages([{
        id: 'system-welcome',
        sender: 'system',
        text: '', 
      }]);

      initChat();
      setError(null);
      setInputValue('');
      welcomeSpeechHasRun.current = false;
  }, [initChat, isListening]);

  const handleStart = () => {
    setView('chat');
    resetChat();
  };

  const handleNewSession = useCallback(() => {
    resetChat();
  }, [resetChat]);

  const handleDownload = (text: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai_response.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (view === 'chat' && chat && !welcomeSpeechHasRun.current) {
        welcomeSpeechHasRun.current = true;
        // Delay speech to allow voices to load, especially on first load.
        setTimeout(() => {
            speakWelcomeSequence(() => {
                if (!isListening) toggleListening();
            });
        }, 500);
    }
  }, [view, chat, speakWelcomeSequence, isListening, toggleListening]);
   
  useEffect(() => {
    if (view === 'chat' && window.speechSynthesis.getVoices().length === 0) {
        const loadVoices = () => { /* Voices loaded */ };
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => { window.speechSynthesis.onvoiceschanged = null; }
    }
  }, [view]);

  if (view === 'welcome') {
    return <WelcomeScreen onStart={handleStart} />;
  }

  return (
    <div className="chat-container">
      <header className="chat-header" role="banner">
        臺灣稅務 AI 助理
      </header>
      <main className="chat-messages" aria-live="polite" aria-atomic="false">
        {messages.map((msg) => {
            if (msg.sender === 'system') {
                return <SystemWelcomeMessage key={msg.id} />;
            }
            return (
              <div key={msg.id} className={`message message-${msg.sender}`} role="log">
                <div className={`message-bubble message-bubble-${msg.sender}`}>
                    <p>{msg.text}</p>
                    {msg.sender === 'ai' && msg.text && !isLoading && (
                        <button onClick={() => handleDownload(msg.text)} className="download-button" aria-label="Download message">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                             <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                           </svg>
                        </button>
                    )}
                </div>
              </div>
            )
        })}
        {isLoading && messages[messages.length - 1]?.sender === 'ai' && (
            <div className="message message-ai" role="log">
                <div className="message-bubble message-bubble-ai loading-indicator">
                    <div className="dot dot1"></div>
                    <div className="dot dot2"></div>
                    <div className="dot dot3"></div>
                </div>
            </div>
        )}
        {error && <div className="p-4 text-red-600 bg-red-100 rounded-md" role="alert">{error}</div>}
        <div ref={messagesEndRef} />
      </main>
      <footer className="chat-input-form" role="contentinfo">
        <button
          onClick={handleNewSession}
          className="new-session-button"
          aria-label="Start new conversation"
          disabled={isLoading}
        >
          新對話
        </button>
        <div className="chat-input-wrapper">
          <select 
            value={currentLang}
            onChange={(e) => setCurrentLang(e.target.value)}
            className="lang-selector"
            aria-label="Select language"
            disabled={isLoading || isListening}
          >
            {Object.entries(SUPPORTED_LANGUAGES).map(([code, { name }]) => (
                <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }} className="flex-grow flex">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={SUPPORTED_LANGUAGES[currentLang]?.placeholder || 'Please enter your question...'}
                className="chat-input"
                disabled={isLoading || isListening}
                aria-label="Chat input"
              />
          </form>
        </div>
        <button
          onClick={toggleListening}
          className={`mic-button ${isListening ? 'mic-button-listening' : 'mic-button-idle'}`}
          aria-label={isListening ? '停止錄音' : '開始錄音'}
          disabled={isLoading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
      </footer>
    </div>
  );
};

export default App;
