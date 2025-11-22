import React, { useState, useEffect, useRef } from 'react';
import { initializeGame, sendPlayerAction } from './services/geminiService';
import { Message, GameState, GameResponse, Character, Evidence } from './types';
import Header from './components/Header';
import NarrativeDisplay from './components/NarrativeDisplay';
import ActionPanel from './components/ActionPanel';
import CharacterBoard from './components/CharacterBoard';
import EvidenceSidebar from './components/EvidenceSidebar';
import GameOverModal from './components/GameOverModal';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [turnsLeft, setTurnsLeft] = useState(15);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  // New State for Dashboard
  const [characters, setCharacters] = useState<Character[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [locationName, setLocationName] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);
  const hasInitialized = useRef(false);

  const startGame = async () => {
    setIsLoading(true);
    setMessages([]);
    setGameState(GameState.PLAYING);
    setTurnsLeft(15);
    setSuggestions([]);
    setCharacters([]);
    setEvidence([]);
    
    try {
      const response = await initializeGame();
      handleGameResponse(response);
    } catch (error) {
      console.error(error);
      setGameState(GameState.ERROR);
      addSystemMessage("Error initializing the Game Master. Please check your API key or try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasInitialized.current) {
        setTimeout(() => {
            startGame();
        }, 100);
        hasInitialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGameResponse = (response: GameResponse) => {
    // Add Bot Message
    const botMsg: Message = {
      id: Date.now().toString(),
      role: 'model',
      text: response.narrative,
    };
    setMessages((prev) => [...prev, botMsg]);

    // Update Dashboard State
    setTurnsLeft(response.turns_left);
    setSuggestions(response.suggestions || []);
    setCharacters(response.characters || []);
    setEvidence(response.evidence || []);
    setLocationName(response.location_name || "Unknown");
    
    if (response.game_status === 'won') {
      setGameState(GameState.GAME_OVER);
    } else if (response.game_status === 'lost' || response.turns_left <= 0) {
      setGameState(GameState.GAME_OVER);
    }
  };

  const handleAction = async (actionText: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: actionText,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await sendPlayerAction(actionText);
      handleGameResponse(response);
    } catch (error) {
      console.error(error);
      addSystemMessage("The Game Master is silent (Network Error). Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const addSystemMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'model', text: `**SYSTEM:** ${text}` },
    ]);
  };

  const handleRestart = () => {
      setGameState(GameState.IDLE);
      hasInitialized.current = false;
      startGame();
  };

  return (
    // Changed bg-[#0B0C15] to bg-transparent to let the body background image show through
    <div className="flex h-screen bg-transparent text-slate-300 overflow-hidden font-sans selection:bg-red-900 selection:text-white">
      
      {/* Sidebar (Desktop Only) - Evidence */}
      <div className="hidden md:block h-full shrink-0">
         <EvidenceSidebar evidence={evidence} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Header turnsLeft={turnsLeft} location={locationName} />
        
        {/* Character Board Panel */}
        <div className="z-10">
           <CharacterBoard characters={characters} />
        </div>

        {/* Main Narrative Scroll Area */}
        <NarrativeDisplay messages={messages} isTyping={isLoading} />

        {/* Error Banner */}
        {gameState === GameState.ERROR && (
          <div className="bg-red-900/80 border-t border-b border-red-500 text-red-200 p-2 text-center text-sm backdrop-blur">
            Connection lost.
          </div>
        )}

        <ActionPanel 
          onAction={handleAction} 
          suggestions={suggestions} 
          isLoading={isLoading}
          gameStatus={gameState === GameState.GAME_OVER ? 'finished' : 'playing'}
        />
      </div>

      {gameState === GameState.GAME_OVER && (
        <GameOverModal 
            status={turnsLeft > 0 && messages[messages.length-1]?.text.includes("won") ? 'won' : (turnsLeft <= 0 ? 'lost' : (messages[messages.length-1]?.text.includes("lost") ? 'lost' : 'won'))} 
            onRestart={handleRestart} 
        />
      )}
    </div>
  );
};

export default App;