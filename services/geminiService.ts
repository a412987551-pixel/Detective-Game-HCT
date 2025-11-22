
import { GoogleGenAI, Chat, Type, Schema } from "@google/genai";
import { GameResponse } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY is missing. Please ensure it is set in the environment.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Define the schema for the structured output
const gameSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    narrative: {
      type: Type.STRING,
      description: "劇情的推進描述，包含對話、環境描寫。使用 Markdown 格式。請以繁體中文撰寫。",
    },
    location_name: {
      type: Type.STRING,
      description: "當前所在的具體地點名稱，例如：'餐飲三勤教室'、'走廊'。",
    },
    suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 個簡短明確的下一步行動建議。",
    },
    turns_left: {
      type: Type.INTEGER,
      description: "剩餘回合數。",
    },
    game_status: {
      type: Type.STRING,
      enum: ["playing", "won", "lost"],
    },
    characters: {
      type: Type.ARRAY,
      description: "所有相關角色的列表及其當前狀態。",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING, description: "請只填寫角色全名，不要加括號或稱謂。" },
          role: { type: Type.STRING, description: "角色身分，如'班長'、'目擊者'。" },
          status: { type: Type.STRING, enum: ['alive', 'deceased', 'missing', 'arrested'] },
          is_interrogating: { type: Type.BOOLEAN, description: "如果玩家正在與此人對話或調查此人，設為 true。" },
          description: { type: Type.STRING, description: "簡短的一句話描述。" },
          avatar_keyword: { type: Type.STRING, enum: ['man', 'woman', 'old', 'young', 'scar', 'singer'], description: "用於生成頭像的關鍵字。" }
        },
        required: ["id", "name", "role", "status", "is_interrogating", "avatar_keyword"]
      }
    },
    evidence: {
      type: Type.ARRAY,
      description: "目前玩家已發現並持有的所有線索與證物列表。",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          icon_type: { type: Type.STRING, enum: ['document', 'weapon', 'item', 'place'] }
        },
        required: ["id", "name", "description", "icon_type"]
      }
    }
  },
  required: ["narrative", "location_name", "suggestions", "turns_left", "game_status", "characters", "evidence"],
};

const SYSTEM_INSTRUCTION = `
你是一位「現代校園懸疑謀殺案」的遊戲主持人 (GM)。
你的目標是透過文字與結構化數據，為玩家呈現一個緊張、寫實且恐怖的校園推理遊戲。

【遊戲設定】
1.  **主題**：滬江高中餐飲三勤命案。
2.  **風格**：現代校園、血腥、恐怖、懸疑。
3.  **玩家角色**：許淑媚 (餐飲三勤的班導師，女性，試圖保護學生並找出真相)。
4.  **目標**：在 15 回合內，找出殺死「壽司」的**殺手**、**兇器名稱**和**殺機**。

【登場人物 (請務必在 characters 列表中準確回傳以下姓名)】
- **壽司** (死者)：女性。慘死在教室中。
- **王洧邦** (班長/潛在嫌疑人)：男性。
- **許晉嘉** (同學A/目擊者/潛在嫌疑人)：男性。
- **張瑞麟** (同學B/目擊者/潛在嫌疑人)：男性。
- **戴沂臻** (同學C/目擊者/潛在嫌疑人)：女性。
- **林主安** (同學/證人)：男性。
- **小小** (校外人士/證人)：男性。
- **許淑媚** (玩家)：老師。

【GM 行為規範】
1.  **語言**：全繁體中文 (Traditional Chinese，台灣用語)。
2.  **敘事**：
    -   始終維持命案現場的**緊張氛圍**與**教室的細節**（例如：黑板上血寫的HELP、地上的血跡、空氣中的鐵鏽味、慌張哭泣的學生）。
    -   根據玩家行動描述結果，並推進劇情。
3.  **狀態維護**：
    -   **characters**: 每次回覆都要包含上述所有角色。
        -   死者「壽司」的 status 必須是 'deceased'。
        -   姓名必須精確匹配上述列表。
    -   **evidence**: 隨著調查，將發現的線索（如沾血的廚刀、食譜筆記、手機訊息）加入此陣列。
4.  **開場設定**：
    -   地點：滬江高中餐飲三勤教室。
    -   場景：許淑媚老師剛踏入教室，看見令人震驚的血腥一幕。黑板上可能有死者留下的血痕或求救訊號。學生們驚慌失措。

請記住，你是電腦系統，也是說書人。引導許淑媚老師揭開真相。
`;

let chatSession: Chat | null = null;

export const initializeGame = async (): Promise<GameResponse> => {
  try {
    chatSession = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: gameSchema,
      },
    });

    const response = await chatSession.sendMessage({
      message: "初始化案件。描述許淑媚老師剛踏入案發現場（餐飲三勤教室）的恐怖場景，並列出所有在場學生。",
    });

    if (!response.text) {
      throw new Error("No response from AI");
    }

    return JSON.parse(response.text) as GameResponse;
  } catch (error) {
    console.error("Failed to initialize game:", error);
    throw error;
  }
};

export const sendPlayerAction = async (action: string): Promise<GameResponse> => {
  if (!chatSession) {
    throw new Error("Game session not initialized.");
  }

  try {
    const response = await chatSession.sendMessage({
      message: action,
    });

    if (!response.text) {
      throw new Error("No response from AI");
    }

    return JSON.parse(response.text) as GameResponse;
  } catch (error) {
    console.error("Failed to process action:", error);
    throw error;
  }
};
