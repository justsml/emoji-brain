import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import fs from "fs";
import path from "path";
import dedent from "dedent";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export const emojiLabeler = async (inputImage: string) => {
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
    model: google("gemini-3-flash-preview"),
    messages: [
      {
        role: "system",
        content: dedent`
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
      },
      {
        role: "user",
        content: [
          {
            type: "image",
            image: fs.readFileSync(inputImage).toString("base64url"),
          },
        ],
      },
    ],
  });

  return result.text;
};
