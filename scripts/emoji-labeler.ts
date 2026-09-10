import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import fs from "fs";
import path from "path";
import dedent from "dedent";
import { googleApiKey, openRouterApiKey } from './emoji-check-guidance';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export function labellingModel() {
  const routerKey = openRouterApiKey();
  if (routerKey) return createOpenRouter({ apiKey: routerKey })('google/gemini-3.8-flash');
  const key = googleApiKey();
  if (!key) throw new Error('Set OPENROUTER_API_KEY or a Google Gemini API key before labelling.');
  return createGoogleGenerativeAI({ apiKey: key })('gemini-3.8-flash');
}

export const emojiLabeler = async (inputImage: string) => {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    throw new Error("Live labelling is disabled in CI; run locally as a maintainer.");
  }
  const mimeType = path.extname(inputImage).slice(1);
  const validMimeTypes = ["png", "jpg", "jpeg", "gif", "webp", "pdf"];
  if (!validMimeTypes.includes(mimeType)) {
    throw new Error(
      `Invalid file type: ${mimeType}. Supported types are: ${validMimeTypes.join(
        ", "
      )}`
    );
  }

  const result = await generateText({
    model: labellingModel(),
    instructions: dedent`
          You are an emoji labeling assistant. Analyze the provided emoji image and generate a JSON object with 'categories' and 'tags'.
          
          GUIDELINES:
          - Extract ANY text, numbers, or symbols visible in the image (e.g., "10000", "420", "99")
          - Include colors, emotions, actions, and objects depicted
          - Categories: broad themes (2-4 items) like "number", "animal", "reaction", "meme"
          - Tags: specific details (3-8 items) including text, characters, emotions, objects
          
          EXAMPLES:
          - Number emoji → categories: ["number"], tags: ["10000", "digit", "numeric"]
          - Cat emoji → categories: ["animal", "emoji"], tags: ["cat", "feline", "cute"]
          - Reaction GIF → categories: ["reaction", "gif"], tags: ["surprised", "shocked", "wow"]
          
          Return ONLY valid JSON: {"categories": [], "tags": []}
        `,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            mediaType: mimeType === 'pdf' ? 'application/pdf' : `image/${mimeType === 'jpg' ? 'jpeg' : mimeType}`,
            data: fs.readFileSync(inputImage),
          },
        ],
      },
    ],
  });

  return result.text;
};
